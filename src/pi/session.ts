// src/pi/session.ts
//
// PiAgentSession wraps the coding-agent CLI as a subprocess in --mode rpc.
// The @mariozechner/pi package on npm (v0.56.3) is the vLLM pods tool — not
// what we need. The actual RpcClient API is from pi-mono/packages/coding-agent
// which is published as @mariozechner/coding-agent. Until a proper RPC SDK is
// published, we model the interface locally and spawn the CLI directly.
//
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { mapSpecialistBackend, getProviderArgs } from './backendMap.js';

export interface AgentSessionMeta {
  backend: string;
  model: string;
  sessionId: string;
  startedAt: Date;
}

export interface PiSessionOptions {
  model: string;          // specialist execution.model ('gemini', 'qwen', etc.)
  systemPrompt?: string;  // written to agents.md in temp dir
  timeoutMs?: number;
}

/**
 * Minimal RpcClient interface — models the pi RPC protocol.
 * Implementation spawns coding-agent CLI via child_process.
 * TODO: replace with official @mariozechner/pi RpcClient once published.
 */
class RpcClient extends EventEmitter {
  private proc?: ChildProcess;
  private pendingResolvers = new Map<string, (data: unknown) => void>();
  private idlePromise?: { resolve: () => void; reject: (e: Error) => void };

  constructor(
    private options: { provider: string; cwd: string; args?: string[] }
  ) {
    super();
  }

  async start(): Promise<void> {
    const cliPath = require.resolve('@mariozechner/coding-agent/dist/cli.js').catch
      ? '@mariozechner/coding-agent/dist/cli.js'
      : '@mariozechner/coding-agent/dist/cli.js';

    const args = [
      '--mode', 'rpc',
      '--provider', this.options.provider,
      ...(this.options.args ?? []),
    ];

    this.proc = spawn('node', [cliPath, ...args], {
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this.emit('event', event);
          if (event.type === 'agent_end') {
            this.idlePromise?.resolve();
            this.idlePromise = undefined;
          }
          if (event.id && this.pendingResolvers.has(event.id)) {
            this.pendingResolvers.get(event.id)!(event);
            this.pendingResolvers.delete(event.id);
          }
        } catch { /* ignore non-JSON */ }
      }
    });
  }

  async prompt(task: string): Promise<void> {
    const msg = JSON.stringify({ type: 'prompt', message: task }) + '\n';
    this.proc?.stdin?.write(msg);
  }

  async waitForIdle(timeoutMs = 120_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Agent idle timeout after ${timeoutMs}ms`)), timeoutMs);
      this.idlePromise = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject,
      };
    });
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pendingResolvers.set(id, resolve);
      const msg = JSON.stringify({ ...command, id }) + '\n';
      this.proc?.stdin?.write(msg);
    });
  }

  stop(): void {
    this.proc?.kill();
    this.proc = undefined;
  }
}

export class PiAgentSession {
  private client: RpcClient;
  private tempDir?: string;
  readonly meta: AgentSessionMeta;

  private constructor(client: RpcClient, meta: AgentSessionMeta, tempDir?: string) {
    this.client = client;
    this.meta = meta;
    this.tempDir = tempDir;
  }

  static async create(options: PiSessionOptions): Promise<PiAgentSession> {
    const provider = mapSpecialistBackend(options.model);
    const args = getProviderArgs(options.model);

    const tempDir = await mkdtemp(join(tmpdir(), 'unitai-'));

    if (options.systemPrompt) {
      await writeFile(join(tempDir, 'agents.md'), options.systemPrompt, 'utf-8');
    }

    const client = new RpcClient({ provider, cwd: tempDir, args });
    const meta: AgentSessionMeta = {
      backend: provider,
      model: options.model,
      sessionId: crypto.randomUUID(),
      startedAt: new Date(),
    };

    return new PiAgentSession(client, meta, tempDir);
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async prompt(task: string): Promise<void> {
    await this.client.prompt(task);
  }

  async waitForIdle(timeoutMs = 120_000): Promise<void> {
    await this.client.waitForIdle(timeoutMs);
  }

  async getLastOutput(): Promise<string> {
    const resp = await this.client.send({ type: 'get_last_assistant_text' }) as any;
    return resp?.data?.text ?? '';
  }

  async executeBash(command: string): Promise<string> {
    const resp = await this.client.send({ type: 'bash', command }) as any;
    return resp?.data?.output ?? resp?.output ?? '';
  }

  kill(): void {
    this.client.stop();
    if (this.tempDir) {
      rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
