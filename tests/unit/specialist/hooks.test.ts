// tests/unit/specialist/hooks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HookEmitter } from '../../../src/specialist/hooks.js';

describe('HookEmitter', () => {
  let tempDir: string;
  let emitter: HookEmitter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'specialists-hooks-'));
    emitter = new HookEmitter({ tracePath: join(tempDir, 'trace.jsonl') });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes pre_render event to JSONL', async () => {
    await emitter.emit('pre_render', 'inv-1', 'my-spec', '1.0.0', {
      variables_keys: ['prompt'],
      backend_resolved: 'gemini',
      fallback_used: false,
      circuit_breaker_state: 'CLOSED',
      scope: 'project',
    });
    const lines = (await readFile(join(tempDir, 'trace.jsonl'), 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event.hook).toBe('pre_render');
    expect(event.invocation_id).toBe('inv-1');
    expect(event.specialist_name).toBe('my-spec');
  });

  it('appends multiple events with same invocation_id', async () => {
    const base = { variables_keys: [], backend_resolved: 'gemini', fallback_used: false, circuit_breaker_state: 'CLOSED' as const, scope: 'project' };
    await emitter.emit('pre_render', 'inv-1', 'my-spec', '1.0.0', base);
    await emitter.emit('post_execute', 'inv-1', 'my-spec', '1.0.0', { status: 'COMPLETE', duration_ms: 500, output_valid: true });
    const lines = (await readFile(join(tempDir, 'trace.jsonl'), 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).hook).toBe('post_execute');
  });

  it('fires custom handler (fire-and-forget)', async () => {
    const received: unknown[] = [];
    emitter.onHook('post_execute', (e) => received.push(e));
    await emitter.emit('post_execute', 'inv-2', 'my-spec', '1.0.0', { status: 'COMPLETE', duration_ms: 100, output_valid: true });
    await new Promise(r => setTimeout(r, 10)); // let microtask flush
    expect(received).toHaveLength(1);
  });
});
