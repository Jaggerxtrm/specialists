// src/specialist/hooks.ts
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

type HookType = 'pre_render' | 'post_render' | 'pre_execute' | 'post_execute';
type CBState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

interface HookPayloads {
  pre_render: {
    variables_keys: string[];
    backend_resolved: string;
    fallback_used: boolean;
    circuit_breaker_state: CBState;
    scope: string;
  };
  post_render: {
    prompt_hash: string;
    prompt_length_chars: number;
    estimated_tokens: number;
    system_prompt_present: boolean;
  };
  pre_execute: {
    backend: string;
    model: string;
    timeout_ms: number;
    permission_level: string;
  };
  post_execute: {
    status: 'COMPLETE' | 'IN_PROGRESS' | 'BLOCKED' | 'ERROR' | 'CANCELLED';
    duration_ms: number;
    output_valid: boolean;
    error?: { type: string; message: string };
  };
}

export class HookEmitter {
  private tracePath: string;
  private customHandlers = new Map<HookType, Array<(event: unknown) => void>>();
  private ready: Promise<void>;

  constructor(options: { tracePath: string }) {
    this.tracePath = options.tracePath;
    this.ready = mkdir(dirname(options.tracePath), { recursive: true }).then(() => {});
  }

  async emit<T extends HookType>(
    hook: T,
    invocationId: string,
    specialistName: string,
    specialistVersion: string,
    payload: HookPayloads[T],
  ): Promise<void> {
    await this.ready;
    const event = {
      invocation_id: invocationId,
      hook,
      timestamp: new Date().toISOString(),
      specialist_name: specialistName,
      specialist_version: specialistVersion,
      ...payload,
    };
    await appendFile(this.tracePath, JSON.stringify(event) + '\n', 'utf-8');
    for (const handler of this.customHandlers.get(hook) ?? []) {
      Promise.resolve().then(() => handler(event)).catch(() => {});
    }
  }

  onHook(hook: HookType, handler: (event: unknown) => void): void {
    if (!this.customHandlers.has(hook)) this.customHandlers.set(hook, []);
    this.customHandlers.get(hook)!.push(handler);
  }
}
