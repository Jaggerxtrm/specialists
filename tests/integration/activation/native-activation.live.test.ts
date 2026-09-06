/**
 * Live smoke for NativeActivationHost — bead unitAI-rrdnt.11.
 *
 * unitAI-rrdnt.5 proved the host's STRUCTURE against injected doubles: a stub loader, a
 * stub SDK, a fake forensic sink. That leaves three claims asserted but not observed —
 * PRD acceptance A (a repo override changes the native child through the real
 * SpecialistLoader), a real model turn, and a real row in the real `observability.db`.
 * This file closes that gap by running the actual thing.
 *
 * Gated on SPECIALISTS_LIVE_SMOKE=1 because it needs provider credentials and makes a
 * network call. It skips cleanly rather than failing when they are absent — a red suite on
 * a laptop with no model auth teaches nobody anything.
 *
 *   SPECIALISTS_LIVE_SMOKE=1 \
 *   SPECIALISTS_LIVE_SMOKE_MODEL=<provider/model> \
 *   SPECIALISTS_LIVE_SMOKE_MODEL_ALT=<a different provider/model> \
 *     bun --bun vitest run tests/integration/activation/native-activation.live.test.ts
 *
 * MODEL_ALT is required only by the override case, and only has to RESOLVE — it is never
 * asked to serve a turn. Acceptance A needs two distinct real models because `prompt.system` is a BLOCKED override field (schema.ts) and
 * `execution.model` is the observable field a repo layer is actually permitted to change.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { NativeActivationHost } from '../../../src/activation/native-host.js';
import { createActivationForensicSink } from '../../../src/activation/forensic-sink.js';
import { createObservabilitySqliteClientAtPath } from '../../../src/specialist/observability-sqlite.js';
import { SpecialistLoader } from '../../../src/specialist/loader.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const runLive = process.env.SPECIALISTS_LIVE_SMOKE === '1';
const baseModel = process.env.SPECIALISTS_LIVE_SMOKE_MODEL ?? '';
const altModel = process.env.SPECIALISTS_LIVE_SMOKE_MODEL_ALT ?? '';

const SPECIALIST = 'live-smoke-reader';

/**
 * The documented query for "what did this activation do?". One store, one table — a
 * native activation is answerable exactly like a legacy `sp run` one.
 */
const FORENSIC_QUERY =
  "SELECT event_name FROM specialist_forensic_events WHERE job_id = ? AND event_family = 'activation' ORDER BY seq ASC";

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
}

function specialistSpec(model: string) {
  return {
    specialist: {
      metadata: {
        name: SPECIALIST,
        version: '1.0.0',
        description: 'Live smoke reader for native activation. Not for dispatch.',
        category: 'template',
        tags: ['live-smoke'],
      },
      execution: {
        bare: true,
        mode: 'tool',
        model,
        fallback_model: null,
        timeout_ms: 120000,
        max_retries: 0,
        interactive: false,
        response_format: 'text',
        output_type: 'synthesis',
        permission_required: 'READ_ONLY',
        extensions: { gitnexus: false },
      },
      prompt: {
        system: 'You are a smoke-test probe. Answer in one short sentence and stop. Run no commands.',
        system_prompt_mode: 'replace',
        task_template: '$prompt',
      },
      skills: { paths: [], scripts: [] },
      capabilities: { required_tools: [], external_commands: [] },
      validation: { files_to_watch: [], stale_threshold_days: 30 },
      stall_detection: {},
      mandatory_rules: { template_sets: [] },
      beads_integration: 'auto',
      beads_write_notes: false,
    },
  };
}

/** Every live `*.db` file under a directory. WAL/SHM sidecars are not `.db` and do not count. */
function findDatabases(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.name.endsWith('.db') && statSync(full).size > 0) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

/**
 * Sample the OS process table for descendants of this process named `pi`.
 *
 * The unit suite proves no-subprocess by mocking `node:child_process`, which only proves
 * the host does not call the mocked binding. This proves it at the level that actually
 * matters: no `pi` ever appears in our process tree. Sampling (rather than a single check)
 * is required because a spawned child would be short-lived.
 */
function watchForPiDescendants(rootPid: number): { stop: () => string[] } {
  const seen: string[] = [];

  const sample = () => {
    const ps = spawnSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf-8' });
    if (ps.status !== 0 || !ps.stdout) return;

    const children = new Map<number, Array<{ pid: number; comm: string }>>();
    for (const line of ps.stdout.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) continue;
      const [, pid, ppid, comm] = match;
      const bucket = children.get(Number(ppid)) ?? [];
      bucket.push({ pid: Number(pid), comm: comm.trim() });
      children.set(Number(ppid), bucket);
    }

    const queue = [rootPid];
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const child of children.get(current) ?? []) {
        if (child.comm === 'pi') seen.push(`${child.pid} ${child.comm}`);
        queue.push(child.pid);
      }
    }
  };

  const timer = setInterval(sample, 100);
  sample();
  return {
    stop: () => {
      clearInterval(timer);
      sample();
      return seen;
    },
  };
}

describe('live smoke: native Specialist activation', () => {
  let tempRepo = '';
  let dbPath = '';
  let beadId = '';
  let host: NativeActivationHost;

  beforeAll(async () => {
    if (!runLive) return;
    expect(baseModel, 'SPECIALISTS_LIVE_SMOKE_MODEL is required for the live smoke').not.toBe('');

    tempRepo = await mkdtemp(join(tmpdir(), 'native-activation-live-'));
    // A real git root, so resolveObservabilityDbLocation places a real observability.db
    // here instead of writing into the project's own store.
    expect(run('git', ['init', '-q'], tempRepo).status).toBe(0);
    await writeFile(join(tempRepo, 'README.md'), 'native activation live smoke\n');

    await mkdir(join(tempRepo, 'config', 'specialists'), { recursive: true });
    await writeFile(
      join(tempRepo, 'config', 'specialists', `${SPECIALIST}.specialist.json`),
      JSON.stringify(specialistSpec(baseModel), null, 2),
    );

    dbPath = join(tempRepo, '.specialists', 'db', 'observability.db');
    const observability = createObservabilitySqliteClientAtPath(dbPath);
    expect(observability, 'observability.db could not be opened').not.toBeNull();

    host = new NativeActivationHost({
      cwd: tempRepo,
      forensics: createActivationForensicSink(observability),
    });

    // The Phase 3 bead gate refuses anything that is not a complete task contract, so the
    // throwaway probe bead carries all seven sections and a SCRUTINY level.
    const probeContract = [
      'PROBLEM', 'The native activation host has no observed live run.', '',
      'SUCCESS', 'One short model turn completes in-process.', '',
      'SCOPE', 'Reply with one short sentence confirming you are running, then stop.', '',
      'NON_GOALS', 'No file edits. No commands. No further work.', '',
      'CONSTRAINTS', 'Read-only. One sentence.', '',
      'VALIDATION', 'A non-empty assistant reply.', '',
      'OUTPUT', 'One sentence.', '',
      'SCRUTINY', 'LOW — throwaway smoke probe.',
    ].join('\n');

    const create = run('bd', [
      'create', '--title=native activation live smoke probe', '--type=task',
      `--description=${probeContract}`,
    ], repoRoot);
    expect(create.status).toBe(0);
    beadId = create.stdout.match(/unitAI-[a-z0-9.]+/)?.[0] ?? '';
    expect(beadId).toMatch(/^unitAI-/);
  }, 120_000);

  afterAll(async () => {
    if (beadId) {
      run('bd', ['kv', 'set', `memory-acked:${beadId}`, 'nothing novel:throwaway live-smoke probe bead'], repoRoot);
      run('bd', ['close', beadId, '--reason=native activation live smoke complete'], repoRoot);
    }
    if (tempRepo) await rm(tempRepo, { recursive: true, force: true });
  });

  it.skipIf(!runLive)(
    'acceptance B: with no override the child runs the effective configured model, and the turn completes',
    async () => {
      const watcher = watchForPiDescendants(process.pid);

      const handle = await host.start({
        specialist: SPECIALIST,
        beadId,
        requestedByParticipantId: 'coordinator:live-smoke',
      });

      expect(handle.access).toBe('read');
      expect(handle.resolvedModel).toContain(baseModel.split('/').pop());

      const result = await handle.result;
      const piProcesses = watcher.stop();

      expect(result.status, `activation failed: ${result.validation.errors?.join('; ')}`).toBe('completed');
      expect(String(result.output).trim().length).toBeGreaterThan(0);
      expect(result.modelOverride).toBe(false);

      // Acceptance: no `pi` binary was ever a descendant of this process.
      expect(piProcesses).toEqual([]);

      // Acceptance AJ/AP: the run is answerable from the real observability.db, and no
      // second telemetry database was created anywhere in the workspace.
      const query = run('bun', [
        '-e',
        [
          "import { Database } from 'bun:sqlite';",
          `const db = new Database(${JSON.stringify(dbPath)});`,
          `const rows = db.query(${JSON.stringify(FORENSIC_QUERY)}).all(${JSON.stringify(handle.activationId)});`,
          'console.log(JSON.stringify(rows.map(r => r.event_name)));',
        ].join(' '),
      ], tempRepo);
      expect(query.status, query.stderr).toBe(0);

      const events = JSON.parse(query.stdout.trim()) as string[];
      expect(events).toContain('activation.activation_admitted');
      expect(events).toContain('activation.activation_started');
      expect(events).toContain('activation.activation_completed');

      expect(findDatabases(tempRepo)).toEqual([dbPath]);

      await host.stop(handle.activationId, 'live smoke complete');
    },
    180_000,
  );

  it.skipIf(!runLive || !altModel)(
    'acceptance A: a repo .specialists/user override changes the native child through the real loader',
    async () => {
      // `prompt.system` is deliberately included and deliberately NOT expected to apply:
      // it is a BLOCKED override field, and a repo layer silently gaining control of a
      // child's system prompt is the failure that allowlist exists to prevent.
      const override = specialistSpec(altModel);
      override.specialist.prompt.system = 'OVERRIDDEN SYSTEM PROMPT — must not take effect.';

      await mkdir(join(tempRepo, '.specialists', 'user'), { recursive: true });
      await writeFile(
        join(tempRepo, '.specialists', 'user', `${SPECIALIST}.specialist.json`),
        JSON.stringify(override, null, 2),
      );

      const overridden = new NativeActivationHost({
        cwd: tempRepo,
        forensics: createActivationForensicSink(createObservabilitySqliteClientAtPath(dbPath)),
      });

      const handle = await overridden.start({
        specialist: SPECIALIST,
        beadId,
        requestedByParticipantId: 'coordinator:live-smoke',
      });

      // The override changed the child: the session was created against the repo layer's
      // model, not the package layer's, resolved through the real three-layer loader.
      //
      // This case deliberately does NOT await a completed turn. The override model only
      // has to RESOLVE; requiring it to also be a solvent, reachable provider would make
      // the case fail for billing reasons that say nothing about the loader. The live
      // turn is proven once, in acceptance B.
      expect(handle.resolvedModel).toContain(altModel.split('/').pop());
      expect(handle.resolvedModel).not.toContain(baseModel.split('/').pop());

      const snapshot = overridden.inspect(handle.activationId);
      expect(snapshot?.configuredModel).toContain(altModel.split('/').pop());
      expect(snapshot?.piSessionId, 'no AgentSession was created for the overridden child').toBeTruthy();

      // The blocked field did not propagate: the child keeps the package layer's system
      // prompt even though the repo layer asked to replace it.
      const resolved = await new SpecialistLoader({ projectDir: tempRepo }).get(SPECIALIST);
      expect(resolved.specialist.prompt.system).not.toContain('OVERRIDDEN SYSTEM PROMPT');
      expect(resolved.specialist.execution.model).toBe(altModel);

      await overridden.stop(handle.activationId, 'live smoke complete');
      await handle.result.catch(() => undefined);
    },
    180_000,
  );
});
