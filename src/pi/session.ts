// src/pi/session.ts
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
import { EventEmitter } from 'node:events';
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
  timeoutMs?: number;
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

export class PiAgentSession {
  private proc?: ChildProcess;
  private _lastOutput = '';
  private idleResolve?: () => void;
  private idleReject?: (e: Error) => void;
  readonly meta: AgentSessionMeta;

  private constructor(
    private options: PiSessionOptions,
    meta: AgentSessionMeta,
  ) {
    this.meta = meta;
  }

  static async create(options: PiSessionOptions): Promise<PiAgentSession> {
    const provider = mapSpecialistBackend(options.model);
    const meta: AgentSessionMeta = {
      backend: provider,
      model: options.model,
      sessionId: crypto.randomUUID(),
      startedAt: new Date(),
    };
    return new PiAgentSession(options, meta);
  }

  async start(): Promise<void> {
    const model = this.options.model;
    const extraArgs = getProviderArgs(model);

    // Full model IDs (e.g. "google/gemini-2.0-flash", "anthropic/claude-sonnet-4-6")
    // are passed directly as --model; pi infers the provider from the prefix.
    // Short aliases (e.g. "gemini", "anthropic") use --provider so pi picks its
    // configured default model for that provider.
    const providerArgs: string[] = model.includes('/')
      ? ['--model', model]
      : ['--provider', mapSpecialistBackend(model)];

    const args = [
      '--mode', 'rpc',
      ...providerArgs,
      '--no-session',
      '--print',
      ...extraArgs,
    ];

    if (this.options.systemPrompt) {
      args.push('--append-system-prompt', this.options.systemPrompt);
    }

    this.proc = spawn('pi', args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        this._handleEvent(line);
      }
    });

    this.proc.on('close', () => {
      this.idleResolve?.();
    });
  }

  private _handleEvent(line: string): void {
    let event: Record<string, any>;
    try { event = JSON.parse(line); } catch { return; }

    const { type } = event;

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
      this.options.onEvent?.('done');
      this.idleResolve?.();
      this.idleResolve = undefined;
      this.idleReject = undefined;
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

  async prompt(task: string): Promise<void> {
    const msg = JSON.stringify({ type: 'prompt', message: task }) + '\n';
    this.proc?.stdin?.write(msg);
  }

  async waitForIdle(timeoutMs = 120_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Agent idle timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
      this.idleResolve = () => { clearTimeout(timer); resolve(); };
      this.idleReject = reject;
    });
  }

  async getLastOutput(): Promise<string> {
    return this._lastOutput;
  }

  async executeBash(command: string): Promise<string> {
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      const handler = (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          try {
            const ev = JSON.parse(line);
            if (ev.id === id) {
              this.proc?.stdout?.off('data', handler);
              resolve(ev.output ?? ev.data?.output ?? '');
            }
          } catch { /* ignore */ }
        }
      };
      this.proc?.stdout?.on('data', handler);
      this.proc?.stdin?.write(JSON.stringify({ type: 'bash', command, id }) + '\n');
    });
  }

  kill(): void {
    this.proc?.kill();
    this.proc = undefined;
  }
}
