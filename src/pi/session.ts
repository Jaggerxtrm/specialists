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
import { join, resolve } from 'node:path';
import { mapSpecialistBackend, getProviderArgs } from './backendMap.js';

export interface AgentSessionMeta {
  backend: string;
  model: string;
  sessionId: string;
  startedAt: Date;
}

export interface SessionTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
}

export interface SessionRunMetrics {
  token_usage?: SessionTokenUsage;
  finish_reason?: string;
  exit_reason?: string;
  turns?: number;
  tool_calls?: number;
  tool_call_names?: string[];
  auto_compactions?: number;
  auto_retries?: number;
}

export type SessionMetricEvent =
  | { type: 'token_usage'; token_usage: SessionTokenUsage; source: 'message_done' | 'turn_end' | 'agent_end' }
  | { type: 'finish_reason'; finish_reason: string; source: 'message_done' | 'turn_end' | 'agent_end' }
  | { type: 'turn_summary'; turn_index: number; token_usage?: SessionTokenUsage; finish_reason?: string }
  | { type: 'compaction'; phase: 'start' | 'end' }
  | { type: 'retry'; phase: 'start' | 'end' };

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
  /** Called with tool name, error flag, optional tool call ID, summarized result content, and optional raw result payload */
  onToolEnd?: (tool: string, isError: boolean, toolCallId?: string, resultContent?: string, resultRaw?: Record<string, unknown>) => void;
  /** Called with the raw pi event type (for job status tracking) */
  onEvent?: (type: string, details?: { charCount?: number }) => void;
  /** Called with additive observability metrics derived from RPC events */
  onMetric?: (event: SessionMetricEvent) => void;
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

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickFirstNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeTokenUsage(candidate: unknown): SessionTokenUsage | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const usage = candidate as Record<string, unknown>;

  const normalized: SessionTokenUsage = {
    input_tokens: pickFirstNumber(usage, ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens']),
    output_tokens: pickFirstNumber(usage, ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens']),
    cache_creation_tokens: pickFirstNumber(usage, ['cache_creation_tokens', 'cacheCreationTokens', 'cache_write_tokens']),
    cache_read_tokens: pickFirstNumber(usage, ['cache_read_tokens', 'cacheReadTokens', 'cache_hit_tokens']),
    total_tokens: pickFirstNumber(usage, ['total_tokens', 'totalTokens']),
    cost_usd: pickFirstNumber(usage, ['cost_usd', 'costUsd', 'usd_cost', 'cost']),
  };

  const hasAny = Object.values(normalized).some(value => value !== undefined);
  if (!hasAny) return undefined;

  if (normalized.total_tokens === undefined) {
    const components = [
      normalized.input_tokens,
      normalized.output_tokens,
      normalized.cache_creation_tokens,
      normalized.cache_read_tokens,
    ].filter((value): value is number => value !== undefined);
    if (components.length > 0) {
      normalized.total_tokens = components.reduce((sum, value) => sum + value, 0);
    }
  }

  return normalized;
}

function findFinishReason(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const direct = record.stopReason ?? record.finishReason ?? record.finish_reason ?? record.reason;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;
  return undefined;
}

function findTokenUsage(payload: unknown): SessionTokenUsage | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    record.usage,
    record.tokenUsage,
    record.token_usage,
    (record.stats as Record<string, unknown> | undefined)?.usage,
    (record.stats as Record<string, unknown> | undefined)?.tokenUsage,
    (record.result as Record<string, unknown> | undefined)?.usage,
    (record.result as Record<string, unknown> | undefined)?.tokenUsage,
    (record.assistantMessageEvent as Record<string, unknown> | undefined)?.usage,
    (record.assistantMessageEvent as Record<string, unknown> | undefined)?.tokenUsage,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTokenUsage(candidate);
    if (normalized) return normalized;
  }

  return normalizeTokenUsage(record);
}

function normalizeToolResultPart(contentPart: unknown): string | undefined {
  if (!contentPart || typeof contentPart !== 'object') return undefined;
  const part = contentPart as Record<string, unknown>;
  const text = part.text;
  if (typeof text === 'string' && text.trim().length > 0) return text;

  const content = part.content;
  if (typeof content === 'string' && content.trim().length > 0) return content;

  const output = part.output;
  if (typeof output === 'string' && output.trim().length > 0) return output;

  return undefined;
}

function findToolResultContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const result = record.result;
  if (!result || typeof result !== 'object') return undefined;
  const resultRecord = result as Record<string, unknown>;

  const content = resultRecord.content;
  if (Array.isArray(content)) {
    const parts = content
      .map(normalizeToolResultPart)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length > 0) return parts.join('\n');
  }

  if (typeof resultRecord.content === 'string' && resultRecord.content.trim().length > 0) {
    return resultRecord.content;
  }

  if (typeof resultRecord.output === 'string' && resultRecord.output.trim().length > 0) {
    return resultRecord.output;
  }

  return undefined;
}

function findToolResultRaw(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const result = record.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  return result as Record<string, unknown>;
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
  private _metrics: SessionRunMetrics = {
    turns: 0,
    tool_calls: 0,
    auto_compactions: 0,
    auto_retries: 0,
  };
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

    // npm package extensions (gitnexus, serena) - resolve from global node_modules
    // These are installed via npm, not as directory extensions in ~/.pi/agent/extensions/
    const npmGlobalDir = join(homedir(), '.nvm/versions/node', process.version, 'lib/node_modules');
    const gitnexusPath = join(npmGlobalDir, 'pi-gitnexus');
    if (existsSync(gitnexusPath)) args.push('-e', gitnexusPath);

    const serenaPath = join(npmGlobalDir, 'pi-serena-tools');
    if (existsSync(serenaPath)) args.push('-e', serenaPath);

    if (this.options.systemPrompt) {
      args.push('--append-system-prompt', this.options.systemPrompt);
    }

    const sessionCwd = resolve(this.options.cwd ?? process.cwd());

    this.proc = spawn('pi', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sessionCwd,
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

  private _updateTokenUsage(tokenUsage: SessionTokenUsage | undefined, source: 'message_done' | 'turn_end' | 'agent_end'): void {
    if (!tokenUsage) return;

    this._metrics.token_usage = {
      ...this._metrics.token_usage,
      ...tokenUsage,
    };

    this.options.onMetric?.({ type: 'token_usage', token_usage: tokenUsage, source });
  }

  private _updateFinishReason(finishReason: string | undefined, source: 'message_done' | 'turn_end' | 'agent_end'): void {
    if (!finishReason) return;
    this._metrics.finish_reason = finishReason;
    this.options.onMetric?.({ type: 'finish_reason', finish_reason: finishReason, source });
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
      this._metrics.turns = (this._metrics.turns ?? 0) + 1;
      this.options.onEvent?.('turn_start');
      return;
    }
    if (type === 'turn_end') {
      const tokenUsage = findTokenUsage(event);
      const finishReason = findFinishReason(event);
      this._updateTokenUsage(tokenUsage, 'turn_end');
      this._updateFinishReason(finishReason, 'turn_end');
      this.options.onMetric?.({
        type: 'turn_summary',
        turn_index: this._metrics.turns ?? 0,
        ...(tokenUsage ? { token_usage: tokenUsage } : {}),
        ...(finishReason ? { finish_reason: finishReason } : {}),
      });
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

      this._updateTokenUsage(findTokenUsage(event), 'agent_end');
      this._updateFinishReason(findFinishReason(event), 'agent_end');

      this._agentEndReceived = true;
      this._clearStallTimer();
      this.options.onEvent?.('agent_end');
      this._doneResolve?.();
      return;
    }

    // ── Tool execution (top-level per RPC docs) ────────────────────────────────
    if (type === 'tool_execution_start') {
      this._metrics.tool_calls = (this._metrics.tool_calls ?? 0) + 1;
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
        findToolResultContent(event),
        findToolResultRaw(event),
      );
      this.options.onEvent?.('tool_execution_end');
      return;
    }

    // ── Auto-compaction / auto-retry lifecycle events ──────────────────────────
    if (type === 'auto_compaction_start' || type === 'auto_compaction_end') {
      if (type === 'auto_compaction_end') {
        this._metrics.auto_compactions = (this._metrics.auto_compactions ?? 0) + 1;
      }
      this.options.onMetric?.({ type: 'compaction', phase: type === 'auto_compaction_start' ? 'start' : 'end' });
      this.options.onEvent?.(type);
      return;
    }
    if (type === 'auto_retry_start' || type === 'auto_retry_end') {
      if (type === 'auto_retry_end') {
        this._metrics.auto_retries = (this._metrics.auto_retries ?? 0) + 1;
      }
      this.options.onMetric?.({ type: 'retry', phase: type === 'auto_retry_start' ? 'start' : 'end' });
      this.options.onEvent?.('auto_retry');
      return;
    }

    // ── message_update — all streaming deltas are nested here ─────────────────
    if (type === 'message_update') {
      const ae = event.assistantMessageEvent;
      if (!ae) return;
      switch (ae.type) {
        case 'text_delta': {
          const delta = typeof ae.delta === 'string' ? ae.delta : '';
          if (delta) this.options.onToken?.(delta);
          this.options.onEvent?.('text', { charCount: delta.length });
          break;
        }
        case 'thinking_start':
          this.options.onEvent?.('thinking', { charCount: 0 });
          break;
        case 'thinking_delta': {
          const delta = typeof ae.delta === 'string' ? ae.delta : '';
          if (delta) this.options.onThinking?.(delta);
          this.options.onEvent?.('thinking', { charCount: delta.length });
          break;
        }
        case 'toolcall_start':
          // Tool name known at LLM construction time — set before execution events fire
          this.options.onToolStart?.(ae.name ?? ae.toolName ?? 'tool');
          this.options.onEvent?.('toolcall');
          break;
        case 'toolcall_end':
          this.options.onEvent?.('toolcall');
          break;
        case 'done': {
          // Message-level completion (distinct from run-level agent_end)
          const tokenUsage = findTokenUsage(ae);
          const finishReason = findFinishReason(ae);
          this._updateTokenUsage(tokenUsage, 'message_done');
          this._updateFinishReason(finishReason, 'message_done');
          this.options.onEvent?.('message_done');
          break;
        }
      }
    }
  }

  /**
   * Send a JSON command to pi's stdin and return a promise for the response.
   * Each call is assigned a unique ID; concurrent calls are supported.
   */
  private sendCommand(cmd: Record<string, any>, timeoutMs = 30_000): Promise<any> {
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

  getMetrics(): SessionRunMetrics {
    return { ...this._metrics, ...(this._metrics.token_usage ? { token_usage: { ...this._metrics.token_usage } } : {}) };
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
