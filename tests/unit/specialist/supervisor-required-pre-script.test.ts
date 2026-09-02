import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RequiredPreScriptError } from '../../../src/specialist/runner.js';
import { Supervisor } from '../../../src/specialist/supervisor.js';

const supervisors: Supervisor[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(supervisors.splice(0).map(supervisor => supervisor.dispose()));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Supervisor required pre-script failure persistence', () => {
  it('persists a terminal error and ERROR run_complete event', async () => {
    vi.stubEnv('SPECIALISTS_JOB_FILE_OUTPUT', 'on');
    const root = mkdtempSync(join(tmpdir(), 'supervisor-required-pre-script-'));
    tempDirs.push(root);
    const failure = new RequiredPreScriptError(
      'Required pre-script "preflight.sh" failed with exit code 5.\nstderr:\nvalidation failed',
    );
    const runner = { run: vi.fn().mockRejectedValue(failure) };
    const supervisor = new Supervisor({
      jobsDir: join(root, 'jobs'),
      runner: runner as never,
      runOptions: { name: 'test-specialist', prompt: 'test', workingDirectory: root },
    });
    supervisors.push(supervisor);

    await expect(supervisor.run()).rejects.toBe(failure);

    const [status] = supervisor.listJobs();
    expect(status).toMatchObject({
      status: 'error',
      error: failure.message,
    });
    expect(runner.run).toHaveBeenCalledOnce();

    const events = readFileSync(join(root, 'jobs', status.id, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'run_complete',
      status: 'ERROR',
      error: failure.message,
      exit_reason: 'RequiredPreScriptError',
      final: true,
    }));
  });
});
