// src/pi/session.ts
import { RpcClient } from '@mariozechner/pi';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    const resp = await this.client.send({ type: 'get_last_assistant_text' });
    return (resp as any).data?.text ?? '';
  }

  kill(): void {
    this.client.stop();
    if (this.tempDir) {
      rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
