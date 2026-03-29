// src/pi/session.ts
export class SessionKilledError extends Error {
  constructor() {
    super('Session was killed');
    this.name = 'SessionKilledError';
  }
}

export class StallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Session stalled: no activity for ${timeoutMs}ms`);
    this.name = 'StallTimeoutError';
  }
}

//
// PiAgentSession wraps the `pi` CLI (global binary) in --mode rpc.
// Events are emitted per the pi RPC protocol over stdout (NDJSON).
//
// Pi RPC event layers (per docs/pi-rpc.md):
//
// Top-level events:
//   response              — ack that prompt command was received
//   agent_start           — agent begins processing
//   turn_start/end        — conversation turn boundaries
//   message_start/end     — message boundaries
//   message_update        — streaming update; carries .assistantMessageEvent
//   tool_execution_start  — tool begins executing (top-level)
//   tool_execution_update — tool execution progress (top-level)
//   tool_execution_end    — tool execution complete (top-level)
//   agent_end             — run complete, contains all generated messages
//
// Nested under message_update.assistantMessageEvent:
//   text_start/delta/end    — text token streaming
//   thinking_start/delta/end — thinking token streaming
//   toolcall_start/delta/end — LLM tool-call construction
//   done                    — message-level completion
//   error                   — message-level error
//
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mapSpecialistBackend, getProviderArgs } from './backendMap.js';

export interface AgentSessionMeta {
  backend: string;
  model: string;
  sessionId: string;
  startedAt: Date;
}

export interface PiSessionOptions {
  model: string;
  systemPrompt?: string;
  /** Permission level from specialist YAML — controls which pi tools are enabled */
  permissionLevel?: string;
  /** Skill files loaded via pi --skill (injected into system prompt natively) */
  skillPaths?: string[];
  /** Thinking level passed as pi --thinking <level> */
  thinkingLevel?: string;
  /** Working directory for the pi process — defaults to process.cwd() if not set */
  cwd?: string;
  /** Called with each text token as it arrives */
  onToken?: (delta: string) => void;
  /** Called with each thinking token */
  onThinking?: (delta: string) => void;
  /** Called with tool name, optional args payload, and optional tool call ID when a tool starts executing */
  onToolStart?: (tool: string, args?: Record<string, unknown>, toolCallId?: string) => void;
  /** Called with tool name, error flag, and optional tool call ID when a tool result arrives */
  onToolEnd?: (tool: string, isError: boolean, toolCallId?: string) => void;
  /** Called with the raw pi event type (for job status tracking) */
  onEvent?: (type: string) => void;
  /** Called once with actual backend/model from the first assistant message_start */
  onMeta?: (meta: { backend: string; model: string }) => void;
  /** Kill and fail if no streaming/protocol activity occurs within this window */
  stallTimeoutMs?: number;
}

/** Maps specialist permission_required to pi --tools argument.
 *
 *  READ_ONLY : read, grep, find, ls           — no bash, no writes
 *  LOW       : + bash                          — inspect/run commands, no file edits
 *  MEDIUM    : + edit                          — can edit existing files
 *  HIGH      : + write                         — full access, can create new files
 */
function mapPermissionToTools(level?: string): string | undefined {
  switch (level?.toUpperCase()) {
    case 'READ_ONLY': return 'read,grep,find,ls';
    case 'LOW':       return 'read,bash,grep,find,ls';
    case 'MEDIUM':    return 'read,bash,edit,grep,find,ls';
    case 'HIGH':      return 'read,bash,edit,write,grep,find,ls';
    default:          return undefined;
  }
}

export class PiAgentSession {
  private proc?: ChildProcess;
  private _lastOutput = '';
  private _donePromise?: Promise<void>;
  private _doneResolve?: () => void;
  private _doneReject?: (e: Error) => void;
  private _agentEndReceived = false;
  private _killed = false;
  private _lineBuffer = '';   // accumulates partial lines split across stdout chunks
  private _pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private _nextRequestId = 1;
  private _stderrBuffer = '';
  private _stallTimer?: ReturnType<typeof setTimeout>;
  private _stallError?: Error;
  readonly meta: AgentSessionMeta;

  private constructor(
    private options: PiSessionOptions,
    meta: AgentSessionMeta,
  ) {
    this.meta = meta;
  }

  static async create(options: PiSessionOptions): Promise<PiAgentSession> {
    const meta: AgentSessionMeta = {
      backend: options.model.includes('/')
        ? options.model.split('/')[0]
        : mapSpecialistBackend(options.model),
      model: options.model,
      sessionId: crypto.randomUUID(),
      startedAt: new Date(),
    };
    return new PiAgentSession(options, meta);
  }

  async start(): Promise<void> {
    const model = this.options.model;
    const extraArgs = getProviderArgs(model);

    const providerArgs: string[] = model.includes('/')
      ? ['--model', model]
      : ['--provider', mapSpecialistBackend(model)];

    const args = [
      '--mode', 'rpc',
      '--no-extensions',   // disable ALL auto-discovered xtrm Pi extensions (beads, session-flow, etc.)
      ...providerArgs,
      '--no-session',
      ...extraArgs,
    ];

    // Enforce permission level via --tools flag
    const toolsFlag = mapPermissionToTools(this.options.permissionLevel);
    if (toolsFlag) args.push('--tools', toolsFlag);

    // Thinking level (models that don't support it ignore the flag)
    if (this.options.thinkingLevel) {
      args.push('--thinking', this.options.thinkingLevel);
    }

    // Skill files injected natively via pi --skill
    for (const skillPath of this.options.skillPaths ?? []) {
      args.push('--skill', skillPath);
    }

    // Selectively re-enable useful Pi extensions if installed
    const piExtDir = join(homedir(), '.pi', 'agent', 'extensions');
    const permLevel = (this.options.permissionLevel ?? '').toUpperCase();
    if (permLevel !== 'READ_ONLY') {
      const qgPath = join(piExtDir, 'quality-gates');
      if (existsSync(qgPath)) args.push('-e', qgPath);
    }
    const ssPath = join(piExtDir, 'service-skills');
    if (existsSync(ssPath)) args.push('-e', ssPath);

    if (this.options.systemPrompt) {
      args.push('--append-system-prompt', this.options.systemPrompt);
    }

    this.proc = spawn('pi', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.options.cwd,
    });

    const donePromise = new Promise<void>((resolve, reject) => {
      this._doneResolve = resolve;
      this._doneReject = reject;
    });
    // Prevent unhandled rejection warnings when kill() is called before waitForDone() is awaited
    donePromise.catch(() => {});
    this._donePromise = donePromise;

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      this._stderrBuffer += chunk.toString();
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      // Accumulate into the line buffer — agent_end JSON can be 100KB+,
      // larger than a single stdout chunk (~64KB), so we must reassemble.
      this._lineBuffer += chunk.toString();
      const lines = this._lineBuffer.split('\n');
      // All but the last element are complete lines (last may be partial)
      this._lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) this._handleEvent(line);
      }
    });

    this.proc.stdout?.on('end', () => {
      // Flush any remaining buffered content when stdout closes
      if (this._lineBuffer.trim()) {
        this._handleEvent(this._lineBuffer);
        this._lineBuffer = '';
      }
    });

    this.proc.on('close', (code) => {
      this._clearStallTimer();
      if (this._agentEndReceived || this._killed) {
        this._doneResolve?.();
      } else if (code === 0 || code === null) {
        this._doneResolve?.();
      } else {
        this._doneReject?.(new Error(`pi process exited with code ${code}`));
      }
    });
  }

  private _clearStallTimer(): void {
    if (this._stallTimer) {
      clearTimeout(this._stallTimer);
      this._stallTimer = undefined;
    }
  }

  private _markActivity(): void {
    const timeoutMs = this.options.stallTimeoutMs;
    if (!timeoutMs || timeoutMs <= 0 || this._killed || this._agentEndReceived) return;

    this._clearStallTimer();
    this._stallTimer = setTimeout(() => {
      if (this._killed || this._agentEndReceived) return;
      const err = new StallTimeoutError(timeoutMs);
      this._stallError = err;
      this.kill(err);
    }, timeoutMs);
  }

  private _handleEvent(line: string): void {
    let event: Record<string, any>;
    try { event = JSON.parse(line); } catch { return; }

    this._markActivity();
    const { type } = event;

    // ── RPC response (reply to a sendCommand call) ──────────────────────────
    if (type === 'response') {
      const id = event.id as number | undefined;
      if (id !== undefined) {
        const entry = this._pendingRequests.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          this._pendingRequests.delete(id);
          entry.resolve(event);
        }
      }
      return;
    }

    // ── Message boundaries (assistant/toolResult) + metadata ───────────────
    if (type === 'message_start') {
      const role = event.message?.role;
      if (role === 'assistant') {
        this.options.onEvent?.('message_start_assistant');
        const { provider, model } = event.message ?? {};
        if (provider || model) {
          this.options.onMeta?.({ backend: provider ?? '', model: model ?? '' });
        }
      } else if (role === 'toolResult') {
        this.options.onEvent?.('message_start_tool_result');
      }
      return;
    }

    if (type === 'message_end') {
      const role = event.message?.role;
      if (role === 'assistant') {
        this.options.onEvent?.('message_end_assistant');
      } else if (role === 'toolResult') {
        this.options.onEvent?.('message_end_tool_result');
      }
      return;
    }

    // ── Turn boundaries ─────────────────────────────────────────────────────
    if (type === 'turn_start') {
      this.options.onEvent?.('turn_start');
      return;
    }
    if (type === 'turn_end') {
      this.options.onEvent?.('turn_end');
      return;
    }

    // ── Completion ─────────────────────────────────────────────────────────
    if (type === 'agent_end') {
      const messages: any[] = event.messages ?? [];
      const last = [...messages].reverse().find((m: any) => m.role === 'assistant');
      if (last) {
        this._lastOutput = last.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
      }
      this._agentEndReceived = true;
      this._clearStallTimer();
      this.options.onEvent?.('agent_end');
      this._doneResolve?.();
      return;
    }

    // ── Tool execution (top-level per RPC docs) ────────────────────────────────
    if (type === 'tool_execution_start') {
      this.options.onToolStart?.(
        event.toolName ?? event.name ?? 'tool',
        event.args as Record<string, unknown> | undefined,
        event.toolCallId as string | undefined,
      );
      this.options.onEvent?.('tool_execution_start');
      return;
    }
    if (type === 'tool_execution_update') {
      this.options.onEvent?.('tool_execution_update');
      return;
    }
    if (type === 'tool_execution_end') {
      this.options.onToolEnd?.(
        event.toolName ?? event.name ?? 'tool',
        event.isError ?? false,
        event.toolCallId as string | undefined,
      );
      this.options.onEvent?.('tool_execution_end');
      return;
    }

    // ── Auto-compaction / auto-retry lifecycle events ──────────────────────────
    if (type === 'auto_compaction_start' || type === 'auto_compaction_end') {
      this.options.onEvent?.('auto_compaction');
      return;
    }
    if (type === 'auto_retry_start' || type === 'auto_retry_end') {
      this.options.onEvent?.('auto_retry');
      return;
    }

    // ── message_update — all streaming deltas are nested here ─────────────────
    if (type === 'message_update') {
      const ae = event.assistantMessageEvent;
      if (!ae) return;
      switch (ae.type) {
        case 'text_delta':
          if (ae.delta) this.options.onToken?.(ae.delta);
          this.options.onEvent?.('text');
          break;
        case 'thinking_start':
          this.options.onEvent?.('thinking');
          break;
        case 'thinking_delta':
          if (ae.delta) this.options.onThinking?.(ae.delta);
          this.options.onEvent?.('thinking');
          break;
        case 'toolcall_start':
          // Tool name known at LLM construction time — set before execution events fire
          this.options.onToolStart?.(ae.name ?? ae.toolName ?? 'tool');
          this.options.onEvent?.('toolcall');
          break;
        case 'toolcall_end':
          this.options.onEvent?.('toolcall');
          break;
        case 'done':
          // Message-level completion (distinct from run-level agent_end)
          this.options.onEvent?.('message_done');
          break;
      }
    }
  }

  /**
   * Send a JSON command to pi's stdin and return a promise for the response.
   * Each call is assigned a unique ID; concurrent calls are supported.
   */
  private sendCommand(cmd: Record<string, any>, timeoutMs = 10_000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error('No stdin available'));
        return;
      }
      const id = this._nextRequestId++;
      const timer = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`RPC timeout: no response for command id=${id} after ${timeoutMs}ms`));
      }, timeoutMs);
      this._pendingRequests.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ ...cmd, id }) + '\n', (err) => {
        if (err) {
          const entry = this._pendingRequests.get(id);
          if (entry) {
            clearTimeout(entry.timer);
            this._pendingRequests.delete(id);
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Write the prompt to pi's stdin and await the RPC ack.
   * Stdin is kept open for subsequent RPC commands.
   * Call waitForDone() to block until agent_end, then close() to terminate.
   */
  async prompt(task: string): Promise<void> {
    this._stallError = undefined;
    this._markActivity();
    const response = await this.sendCommand({ type: 'prompt', message: task });
    if (response?.success === false) {
      throw new Error(`Prompt rejected by pi: ${response.error ?? 'already streaming'}`);
    }
    // NOTE: stdin is intentionally NOT closed here. Call close() after waitForDone()
    // to allow sendCommand() RPC calls between prompt completion and teardown.
  }

  /**
   * Wait for the agent to finish. Optionally times out (throws Error on timeout).
   */
  async waitForDone(timeout?: number): Promise<void> {
    const donePromise = this._donePromise ?? Promise.resolve();
    if (!timeout) return donePromise;
    return Promise.race([
      donePromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`Specialist timed out after ${timeout}ms`)), timeout)
      ),
    ]);
  }

  /**
   * Get the last assistant output text. Tries RPC first, falls back to in-memory capture.
   */
  async getLastOutput(): Promise<string> {
    if (!this.proc?.stdin || !this.proc.stdin.writable) {
      return this._lastOutput;
    }
    try {
      const response = await Promise.race([
        this.sendCommand({ type: 'get_last_assistant_text' }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      return response?.data?.text ?? this._lastOutput;
    } catch {
      return this._lastOutput;
    }
  }

  /**
   * Get current session state via RPC.
   */
  async getState(): Promise<any> {
    try {
      const response = await Promise.race([
        this.sendCommand({ type: 'get_state' }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      return response?.data;
    } catch {
      return null;
    }
  }

  /**
   * Close the pi process cleanly by ending stdin (EOF) and waiting for exit.
   */
  async close(): Promise<void> {
    if (this._killed) return;
    this._clearStallTimer();
    // Send EOF to stdin - pi should exit after this
    this.proc?.stdin?.end();
    // Wait for the process to actually exit
    if (this.proc) {
      await new Promise<void>((resolve) => {
        this.proc!.on('close', () => resolve());
        // Fallback: force kill after 2s if process doesn't exit
        setTimeout(() => {
          if (this.proc && !this._killed) {
            this.proc.kill();
          }
          resolve();
        }, 2000);
      });
    }
  }

  // executeBash removed — pre/post scripts run locally in runner.ts via execSync,
  // not via pi RPC (pi has no bash command in its protocol).

  kill(reason?: Error): void {
    if (this._killed) return; // idempotent – second call (e.g. from finally) is a no-op
    this._killed = true;
    this._clearStallTimer();
    // Best-effort abort signal before SIGKILL
    if (this.proc?.stdin?.writable) {
      try { this.proc.stdin.write(JSON.stringify({ type: 'abort' }) + '\n'); } catch { /* ignore */ }
    }
    // Reject all pending RPC requests
    const killError = reason ?? this._stallError ?? new SessionKilledError();
    for (const [, entry] of this._pendingRequests) {
      clearTimeout(entry.timer);
      entry.reject(killError);
    }
    this._pendingRequests.clear();
    this.proc?.kill();
    this.proc = undefined;
    // Reject so waitForDone() can distinguish cancelled vs stalled vs backend failures
    this._doneReject?.(killError);
  }

  /** Returns accumulated stderr output from the pi process. */
  getStderr(): string {
    return this._stderrBuffer;
  }

  /**
   * Send a mid-run steering message to the Pi agent and await the RPC ack.
   * Pi delivers it after the current assistant turn finishes tool calls.
   */
  async steer(message: string): Promise<void> {
    if (this._killed || !this.proc?.stdin) {
      throw new Error('Session is not active');
    }
    const response = await this.sendCommand({ type: 'steer', message });
    if (response?.success === false) {
      throw new Error(`Steer rejected by pi: ${response.error ?? 'steer failed'}`);
    }
  }

  /**
   * Queue a follow_up on the Pi session using pi's native follow_up RPC command.
   * This is distinct from resume(): follow_up queues work during a still-running turn,
   * while resume() sends a next-turn prompt to a waiting (idle) session.
   *
   * Not yet implemented — reserved to prevent semantic drift with pi's native follow_up.
   */
  followUp(_task: string): never {
    throw new Error('followUp() is not yet implemented. Use resume() to send a next-turn prompt to a waiting session.');
  }

  /**
   * Start a new turn on the same Pi session (keep-alive multi-turn).
   * Resets done state and sends a new prompt — Pi retains full conversation history.
   * Only valid after waitForDone() has resolved for the previous turn.
   */
  async resume(task: string, timeout?: number): Promise<void> {
    if (this._killed || !this.proc?.stdin) {
      throw new Error('Session is not active');
    }
    // Reset done state for the new turn
    this._agentEndReceived = false;
    const donePromise = new Promise<void>((resolve, reject) => {
      this._doneResolve = resolve;
      this._doneReject = reject;
    });
    donePromise.catch(() => {});
    this._donePromise = donePromise;

    await this.prompt(task);
    await this.waitForDone(timeout);
  }
}
