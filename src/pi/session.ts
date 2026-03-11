// src/pi/session.ts
export class SessionKilledError extends Error {
  constructor() {
    super('Session was killed');
    this.name = 'SessionKilledError';
  }
}

//
// PiAgentSession wraps the `pi` CLI (global binary) in --mode rpc.
// Events are emitted per the pi RPC protocol over stdout (NDJSON).
//
// Pi lifecycle (per stdout in rpc mode):
//   response      — ack that prompt command was received
//   agent_start   — agent begins processing
//   turn_start    — conversation turn opens
//   message_start — a message begins (user or assistant)
//   message_update — incremental content:
//     .assistantMessageEvent.type === 'text_delta'  → token stream
//     .assistantMessageEvent.type === 'tool_use_start' → tool starting
//     .assistantMessageEvent.type === 'tool_result_start' → tool result
//   message_end   — message complete
//   turn_end      — turn complete (includes toolResults)
//   agent_end     — DONE, contains all messages
//
import { spawn, type ChildProcess } from 'node:child_process';
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
  /** Called with each text token as it arrives */
  onToken?: (delta: string) => void;
  /** Called with each thinking token */
  onThinking?: (delta: string) => void;
  /** Called with tool name when a tool starts executing */
  onToolStart?: (tool: string) => void;
  /** Called with tool name when a tool result arrives */
  onToolEnd?: (tool: string) => void;
  /** Called with the raw pi event type (for job status tracking) */
  onEvent?: (type: string) => void;
  /** Called once with actual backend/model from the first assistant message_start */
  onMeta?: (meta: { backend: string; model: string }) => void;
}

/** Maps specialist permission_required to pi --tools argument. */
function mapPermissionToTools(level?: string): string | undefined {
  switch (level?.toUpperCase()) {
    case 'READ_ONLY': return 'read,bash,grep,find,ls';
    case 'BASH_ONLY': return 'bash';
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':    return 'read,bash,edit,write,grep,find,ls';
    default:        return undefined;
  }
}

export class PiAgentSession {
  private proc?: ChildProcess;
  private _lastOutput = '';
  private _doneResolve?: () => void;
  private _doneReject?: (e: Error) => void;
  private _agentEndReceived = false;
  private _killed = false;
  private _lineBuffer = '';   // accumulates partial lines split across stdout chunks
  private _pendingCommand?: (response: any) => void;
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
      ...providerArgs,
      '--no-session',
      ...extraArgs,
    ];

    // Enforce permission level via --tools flag
    const toolsFlag = mapPermissionToTools(this.options.permissionLevel);
    if (toolsFlag) args.push('--tools', toolsFlag);

    if (this.options.systemPrompt) {
      args.push('--append-system-prompt', this.options.systemPrompt);
    }

    this.proc = spawn('pi', args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const donePromise = new Promise<void>((resolve, reject) => {
      this._doneResolve = resolve;
      this._doneReject = reject;
    });
    // Prevent unhandled rejection warnings when kill() is called before waitForDone() is awaited
    donePromise.catch(() => {});
    (this as any)._donePromise = donePromise;

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
      if (this._agentEndReceived || this._killed) {
        this._doneResolve?.();
      } else if (code === 0 || code === null) {
        this._doneResolve?.();
      } else {
        this._doneReject?.(new Error(`pi process exited with code ${code}`));
      }
    });
  }

  private _handleEvent(line: string): void {
    let event: Record<string, any>;
    try { event = JSON.parse(line); } catch { return; }

    const { type } = event;

    // ── RPC response (reply to a sendCommand call) ──────────────────────────
    if (type === 'response') {
      const handler = this._pendingCommand;
      this._pendingCommand = undefined;
      handler?.(event);
      return;
    }

    // ── Backend/model metadata (first assistant message) ───────────────────
    if (type === 'message_start' && event.message?.role === 'assistant') {
      const { provider, model } = event.message ?? {};
      if (provider || model) {
        this.options.onMeta?.({ backend: provider ?? '', model: model ?? '' });
      }
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
      this.options.onEvent?.('done');
      this._doneResolve?.();
      return;
    }

    // ── Thinking ───────────────────────────────────────────────────────────
    if (type === 'thinking_start') { this.options.onEvent?.('thinking'); return; }
    if (type === 'thinking_delta') {
      if (event.delta) this.options.onThinking?.(event.delta);
      this.options.onEvent?.('thinking');
      return;
    }
    if (type === 'thinking_end') { return; }

    // ── Tool call construction ─────────────────────────────────────────────
    if (type === 'toolcall_start') {
      this.options.onToolStart?.(event.name ?? event.toolName ?? 'tool');
      this.options.onEvent?.('toolcall');
      return;
    }
    if (type === 'toolcall_end') { this.options.onEvent?.('toolcall'); return; }

    // ── Tool execution ─────────────────────────────────────────────────────
    if (type === 'tool_execution_start') {
      this.options.onToolStart?.(event.name ?? event.toolName ?? 'tool');
      this.options.onEvent?.('tool_execution');
      return;
    }
    if (type === 'tool_execution_update') { this.options.onEvent?.('tool_execution'); return; }
    if (type === 'tool_execution_end') {
      this.options.onToolEnd?.(event.name ?? event.toolName ?? 'tool');
      this.options.onEvent?.('tool_execution_end');
      return;
    }

    // ── Text streaming (inside message_update) ─────────────────────────────
    if (type === 'message_update') {
      const ae = event.assistantMessageEvent;
      if (!ae) return;
      if (ae.type === 'text_delta' && ae.delta) {
        this.options.onToken?.(ae.delta);
        this.options.onEvent?.('text');
      }
    }
  }

  /**
   * Send a JSON command to pi's stdin and return a promise for the response.
   * There can only be one pending command at a time.
   */
  private sendCommand(cmd: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error('No stdin available'));
        return;
      }
      this._pendingCommand = resolve;
      this.proc.stdin.write(JSON.stringify(cmd) + '\n', (err) => {
        if (err) {
          this._pendingCommand = undefined;
          reject(err);
        }
      });
    });
  }

  /**
   * Write the prompt to pi's stdin. Stdin is kept open for subsequent RPC commands.
   * Call waitForDone() to block until agent_end, then close() to terminate.
   */
  async prompt(task: string): Promise<void> {
    const msg = JSON.stringify({ type: 'prompt', message: task }) + '\n';
    this.proc?.stdin?.write(msg);
    // NOTE: stdin is intentionally NOT closed here. Call close() after waitForDone()
    // to allow sendCommand() RPC calls between prompt completion and teardown.
  }

  /**
   * Wait for the agent to finish. Optionally times out (throws Error on timeout).
   */
  async waitForDone(timeout?: number): Promise<void> {
    const donePromise = (this as any)._donePromise as Promise<void>;
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
    this.proc?.stdin?.end();
    // Wait for the process to exit (reuse done promise which resolves on close)
    await (this as any)._donePromise.catch(() => {});
  }

  // executeBash removed — pre/post scripts run locally in runner.ts via execSync,
  // not via pi RPC (pi has no bash command in its protocol).

  kill(): void {
    if (this._killed) return; // idempotent – second call (e.g. from finally) is a no-op
    this._killed = true;
    this.proc?.kill();
    this.proc = undefined;
    // Reject so waitForDone() throws SessionKilledError, distinguishable from real failures
    this._doneReject?.(new SessionKilledError());
  }
}
