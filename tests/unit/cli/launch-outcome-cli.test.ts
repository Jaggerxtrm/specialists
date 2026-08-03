// K4 (unitAI-e67up.4) — `sp launch-outcome` CLI verb.
//
// Read-only consumer of the Core K2 detached launcher outcome
// (`xtrm.command-outcome.v1`). The verb never creates a job, worktree,
// session, bead, note, or status row — it validates the contract and emits
// the whitelist projection, mirroring the render-task envelope conventions
// (stable error codes, JSON out, exit 1 on failure).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let stdout: string[] = [];
let tmp: string;

function argv(...args: string[]): void {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['bun', 'specialists', 'launch-outcome', ...args]);
}

function captureStdout(): void {
  stdout = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
    throw new Error(`exit:${code}`);
  }) as never);
}

async function runVerb(...args: string[]): Promise<Record<string, any>> {
  argv(...args);
  const { run } = await import('../../../src/cli/launch-outcome.js');
  await run();
  return JSON.parse(stdout.join(''));
}

async function runVerbFailing(...args: string[]): Promise<Record<string, any>> {
  argv(...args);
  const { run } = await import('../../../src/cli/launch-outcome.js');
  await expect(run()).rejects.toThrow('exit:1');
  return JSON.parse(stdout.join(''));
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'codex-k4-'));
  captureStdout();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const CODEX_FIXTURE = join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-codex-ready.json');

describe('sp launch-outcome', () => {
  it('emits the ok envelope with retrieval fields for a valid codex outcome', async () => {
    const out = await runVerb(CODEX_FIXTURE);
    expect(out.ok).toBe(true);
    expect(out.schema_version).toBe('xtrm.command-outcome.v1');
    expect(out.status).toBe('ok');
    expect(out.reason_code).toBe('session_created');
    expect(out.runtime).toEqual({ name: 'codex', version: '0.30.0' });
    expect(out.worktree.owner).toBe('core');
    expect(out.readiness).toEqual({ status: 'ready', source: 'agent.ready' });
    expect(Array.isArray(out.next_actions)).toBe(true);
    expect(out.next_actions[0].argv).toEqual(['xt', 'attach', 'codex/codex-probe']);
  });

  it('emits the same envelope keys for the pi parity fixture', async () => {
    const codex = await runVerb(CODEX_FIXTURE);
    const codexKeys = Object.keys(codex);
    captureStdout();
    const pi = await runVerb(join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-pi-unverified.json'));
    expect(Object.keys(pi)).toEqual(codexKeys);
    expect(pi.runtime.name).toBe('pi');
    expect(pi.identity.thread_id).toBeNull();
  });

  it('fails with usage when no file is given', async () => {
    const out = await runVerbFailing();
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('usage');
    expect(out.error.message).toContain('launch-outcome');
  });

  it('fails with file_not_read for a missing file', async () => {
    const out = await runVerbFailing(join(tmp, 'nope.json'));
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe('file_not_read');
  });

  it('fails with invalid_json for malformed content', async () => {
    const file = join(tmp, 'broken.json');
    writeFileSync(file, '{ nope', 'utf-8');
    const out = await runVerbFailing(file);
    expect(out.error.code).toBe('invalid_json');
  });

  it('fails with unsupported_schema for a wrong schema_version', async () => {
    const out = await runVerbFailing(
      join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-wrong-schema.json'),
    );
    expect(out.error.code).toBe('unsupported_schema');
  });

  it('fails with invalid_outcome when required fields are missing', async () => {
    const file = join(tmp, 'missing.json');
    writeFileSync(file, JSON.stringify({ schema_version: 'xtrm.command-outcome.v1', status: 'ok' }), 'utf-8');
    const out = await runVerbFailing(file);
    expect(out.error.code).toBe('invalid_outcome');
  });
});
