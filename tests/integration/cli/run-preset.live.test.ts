// Live HOME strategy for smoke: temp HOME keeps specialist overrides scoped via XDG_CONFIG_HOME,
// while leaving real HOME (and ~/.pi credentials) intact.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createLiveSmokeHome, snapshotJobIds, waitForNewJobId } from './live-smoke.helpers';
import type { SupervisorStatus } from '../../../src/specialist/supervisor.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const runLive = process.env.SPECIALISTS_LIVE_SMOKE === '1';
const liveModel = process.env.SPECIALISTS_LIVE_SMOKE_MODEL;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: { ...env, NO_COLOR: '1' },
  });
}

async function readStatus(cwd: string, jobId: string): Promise<SupervisorStatus> {
  const statusPath = join(cwd, '.specialists', 'jobs', jobId, 'status.json');
  if (existsSync(statusPath)) {
    return JSON.parse(await readFile(statusPath, 'utf-8')) as SupervisorStatus;
  }

  const dbPath = join(cwd, '.specialists', 'db', 'observability.db');
  const script = [
    "import { Database } from 'bun:sqlite';",
    `const db = new Database(${JSON.stringify(dbPath)});`,
    `const row = db.query('SELECT status_json FROM specialist_jobs WHERE job_id = ?').get(${JSON.stringify(jobId)});`,
    "if (!row?.status_json) process.exit(2);",
    'console.log(row.status_json);',
  ].join(' ');
  const result = run('bun', ['-e', script], cwd);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `status for ${jobId} not found`);
  return JSON.parse(result.stdout) as SupervisorStatus;
}

async function waitFor<T>(producer: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 60_000, intervalMs = 500): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await producer();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return producer();
}

describe('live smoke: preset resolution', () => {
  let tempHome = '';
  let tempRepo = '';
  let env: NodeJS.ProcessEnv = process.env;
  let beadId = '';

  afterEach(async () => {
    if (beadId) run('bd', ['close', beadId, '--reason=phase-3 preset smoke complete'], repoRoot, env);
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
    if (tempRepo) await rm(tempRepo, { recursive: true, force: true });
  });

  async function writePresetRepo(): Promise<void> {
    await mkdir(join(tempRepo, 'config', 'specialists'), { recursive: true });
    await writeFile(join(tempRepo, 'README.md'), 'preset live smoke repo\n');
    await writeFile(
      join(tempRepo, 'config', 'presets.json'),
      JSON.stringify({
        cheap: {
          description: 'live cheap',
          fields: {
            'specialist.execution.model': liveModel,
          },
        },
      }, null, 2),
      'utf-8',
    );
    await writeFile(
      join(tempRepo, 'config', 'specialists', 'echo.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: {
            name: 'echo',
            version: '1.0.0',
            description: 'live preset smoke',
            category: 'test',
          },
          execution: {
            model: 'placeholder/model',
            timeout_ms: 120000,
            permission_required: 'READ_ONLY',
            response_format: 'json',
          },
          prompt: {
            task_template: 'Reply with JSON {"summary":"ok","status":"success","issues_closed":[],"issues_created":[],"follow_ups":[],"risks":[],"verification":["preset live smoke"]}.',
          },
        },
      }, null, 2),
      'utf-8',
    );
  }

  async function writeUserConfig(model: string): Promise<void> {
    await mkdir(join(tempHome, '.config', 'specialists'), { recursive: true });
    await writeFile(
      join(tempHome, '.config', 'specialists', 'user.json'),
      JSON.stringify({
        echo: {
          execution: {
            model,
            fallback_model: null,
            fallback_models: null,
            timeout_ms: null,
            stall_timeout_ms: null,
            thinking_level: null,
            max_retries: null,
            prompt_limit_bytes: null,
            stdout_limit_bytes: null,
            extensions: { serena: null, gitnexus: null },
          },
          prompt: { system_prompt_mode: null },
          beads_write_notes: null,
          notes_mode: null,
          output_file: null,
          skills: { paths: [] },
        },
      }, null, 2),
      'utf-8',
    );
  }

  it.skipIf(!runLive)('resolves @preset/cheap, dispatches with resolved model, logs preset_resolved event', async () => {
    expect(liveModel).toBeTruthy();
    ({ tempHome, env } = await createLiveSmokeHome('specialists-live-preset-home-'));
    tempRepo = await mkdtemp(join(tmpdir(), 'specialists-live-preset-repo-'));

    expect(run('git', ['init', '-b', 'main'], tempRepo).status).toBe(0);
    await writePresetRepo();
    await writeUserConfig('@preset/cheap');

    const create = run('bd', ['create', '--title=phase-3 preset smoke', '--type=task'], repoRoot, env);
    expect(create.status).toBe(0);
    beadId = create.stdout.match(/unitAI-[a-z0-9]+/)?.[0] ?? '';
    expect(beadId).toMatch(/^unitAI-/);
    expect(run('bd', ['update', beadId, '--claim'], repoRoot, env).status).toBe(0);

    const knownJobIds = await snapshotJobIds(tempRepo);
    const smoke = run('bun', ['run', join(repoRoot, 'src/index.ts'), 'run', 'echo', '--bead', beadId, '--background', '--no-bead-notes'], tempRepo, env);
    expect(smoke.status).toBe(0);
    const observedJobId = smoke.stdout.trim();
    const jobId = observedJobId || (await waitForNewJobId(tempRepo, knownJobIds));
    expect(jobId).toMatch(/^[a-f0-9]{6}$/);

    const status = await waitFor(
      () => readStatus(tempRepo, jobId),
      value => value.status === 'done' || value.status === 'error',
    );
    expect(status.status).toBe('done');
    expect(status.model).toBe(liveModel);

    const log = run('bun', ['run', join(repoRoot, 'src/index.ts'), 'log', jobId, '--all-events'], tempRepo, env);
    expect(log.status).toBe(0);
    const presetLines = log.stdout.split('\n').filter(line => line.includes('preset_resolved'));
    expect(presetLines.length).toBeGreaterThanOrEqual(1);
    expect(presetLines.join('\n')).toContain('"field":"specialist.execution.model"');
    expect(presetLines.join('\n')).toContain('"preset_name":"cheap"');
    expect(presetLines.join('\n')).toContain(`"resolved_value":"${liveModel}"`);
    expect(presetLines.join('\n')).toContain('"depth":1');
  }, 180_000);

  it.skipIf(!runLive)('fails fast on unknown preset before llm dispatch', async () => {
    expect(liveModel).toBeTruthy();
    ({ tempHome, env } = await createLiveSmokeHome('specialists-live-preset-home-'));
    tempRepo = await mkdtemp(join(tmpdir(), 'specialists-live-preset-repo-'));

    expect(run('git', ['init', '-b', 'main'], tempRepo).status).toBe(0);
    await writePresetRepo();
    await writeUserConfig('@preset/typo');

    const create = run('bd', ['create', '--title=phase-3 preset sad smoke', '--type=task'], repoRoot, env);
    expect(create.status).toBe(0);
    beadId = create.stdout.match(/unitAI-[a-z0-9]+/)?.[0] ?? '';
    expect(beadId).toMatch(/^unitAI-/);
    expect(run('bd', ['update', beadId, '--claim'], repoRoot, env).status).toBe(0);

    const smoke = run('bun', ['run', join(repoRoot, 'src/index.ts'), 'run', 'echo', '--bead', beadId, '--no-bead-notes'], tempRepo, env);
    expect(smoke.status).not.toBe(0);
    expect(smoke.stderr).toContain('preset "typo"');
    expect(smoke.stderr).toContain('echo.specialist.execution.model');
    expect(smoke.stderr).toContain('Known presets: cheap');
  }, 180_000);
});
