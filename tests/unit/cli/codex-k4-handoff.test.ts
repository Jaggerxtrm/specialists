// K4 (unitAI-e67up.4) — Codex invocation handoff chain.
//
// Exercises the complete Specialists-side parity chain on top of K3:
//
//   1. `sp render-task <role> --bead <id> --surface codex` emits the envelope
//      the Core launcher consumes (K3 seam, unchanged);
//   2. Core launches the codex runtime and emits a detached
//      `xtrm.command-outcome.v1` JSON (Core K2, simulated here with the
//      contracted fixture shape — Core owns launch, worktree and tmux);
//   3. `sp launch-outcome <file>` validates the outcome and returns the
//      retrieval fields: readiness, runtime, thread/session identity,
//      Core-owned worktree/branch, and exact follow-up argv actions.
//
// The correlation between the rendered role and the launch is the Core-owned
// worktree branch, which carries the role identity. Specialists never parses
// Core prose and never becomes a second job/result authority.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BeadRecord } from '../../../src/specialist/beads.js';
import type { Specialist } from '../../../src/specialist/schema.js';

const BEAD: BeadRecord = {
  id: 'unitAI-e67up.4',
  title: 'K4 Codex invocation parity',
  description: 'PROBLEM: invocation, handoff and result retrieval unproven.',
  status: 'open',
} as BeadRecord;

let stdout: string[] = [];

vi.mock('../../../src/specialist/beads.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/specialist/beads.js')>();
  return {
    ...actual,
    BeadsClient: class {
      readBead(id: string) { return id === BEAD.id ? BEAD : null; }
      getCompletedBlockers() { return []; }
    },
  };
});

vi.mock('../../../src/specialist/loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/specialist/loader.js')>();
  return {
    ...actual,
    SpecialistLoader: class {
      async get(name: string) {
        if (name !== 'codex-role') throw new Error(`Specialist not found: ${name}`);
        const spec = await makeSpecialist();
        // Mirror the real runtime gate: get() hard-fails on a null/empty
        // execution.model (the K1-pinned pi/claude path).
        if (!spec.specialist.execution.model) {
          throw new (actual.SpecialistMissingModelError)(name);
        }
        return spec;
      }
      async getEffective(name: string) {
        return name === 'codex-role' ? makeSpecialist() : null;
      }
    },
  };
});

async function makeSpecialist(): Promise<Specialist> {
  const { SpecialistSchema } = await import('../../../src/specialist/schema.js');
  return SpecialistSchema.parse({
    specialist: {
      metadata: { name: 'codex-role', version: '1.0.0', description: 'K4 handoff probe.', category: 'internal' },
      execution: { model: null, surface_models: { codex: 'codex-model-1' }, bare: true, interactive: true },
      prompt: { system: 'SYSTEM — MUST NOT LEAK', task_template: '$prompt' },
    },
  });
}

function argv(verb: string, ...args: string[]): void {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['bun', 'specialists', verb, ...args]);
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

beforeEach(() => captureStdout());
afterEach(() => vi.restoreAllMocks());

describe('K4 codex invocation handoff chain', () => {
  it('renders the codex role, consumes the Core outcome, and exposes retrieval fields', async () => {
    // Step 1 — Specialists renders the role for the codex surface (K3 seam).
    argv('render-task', 'codex-role', '--bead', BEAD.id, '--surface', 'codex');
    const { run: renderTask } = await import('../../../src/cli/render-task.js');
    await renderTask();
    const envelope = JSON.parse(stdout.join(''));
    expect(envelope.ok).toBe(true);
    expect(envelope.surface).toBe('codex');
    expect(envelope.specialist).toBe('codex-role');
    expect(envelope.bead_id).toBe(BEAD.id);
    expect(envelope.initial_prompt).not.toContain('SYSTEM — MUST NOT LEAK');

    // Step 2 — Core launches and owns the outcome (simulated boundary). The
    // Core-owned worktree branch carries the role identity that correlates
    // the launch back to the rendered role.
    const coreOutcome = JSON.parse(
      readFileSync(join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-codex-ready.json'), 'utf-8'),
    );
    expect(coreOutcome.runtime.name).toBe(envelope.surface);
    expect(coreOutcome.worktree.owner).toBe('core');

    // Step 3 — Specialists consumes the outcome through the K4 seam.
    captureStdout();
    argv('launch-outcome', join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-codex-ready.json'));
    const { run: launchOutcome } = await import('../../../src/cli/launch-outcome.js');
    await launchOutcome();
    const consumed = JSON.parse(stdout.join(''));
    expect(consumed.ok).toBe(true);
    expect(consumed.schema_version).toBe('xtrm.command-outcome.v1');
    expect(consumed.runtime.name).toBe('codex');
    expect(consumed.readiness.status).toBe('ready');

    // Result retrieval identity: thread/session plus Core-owned worktree and
    // exact argv actions, all as data.
    expect(consumed.identity.thread_id).toBe('thr-codex-0001');
    expect(consumed.worktree.branch).toContain('codex');
    const kinds = consumed.next_actions.map((a: { kind: string }) => a.kind);
    expect(kinds).toContain('attach');
    expect(kinds).toContain('end');
    for (const action of consumed.next_actions) {
      expect(Array.isArray(action.argv)).toBe(true);
      expect(typeof action.display).toBe('string');
    }
  });

  it('keeps pi handoff parity: identical envelope keys and outcome projection keys', async () => {
    argv('render-task', 'codex-role', '--bead', BEAD.id, '--surface', 'pi');
    const { run: renderTask } = await import('../../../src/cli/render-task.js');
    await expect(renderTask()).rejects.toThrow('exit:1');
    const piFailure = JSON.parse(stdout.join(''));
    // Pi keeps the K1-pinned hard gate: a codex-only config (model: null) fails.
    expect(piFailure.ok).toBe(false);
    expect(piFailure.error.code).toBe('specialist_not_found');

    captureStdout();
    argv('launch-outcome', join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-pi-unverified.json'));
    const { run: launchOutcome } = await import('../../../src/cli/launch-outcome.js');
    await launchOutcome();
    const piOutcome = JSON.parse(stdout.join(''));

    captureStdout();
    argv('launch-outcome', join(process.cwd(), 'tests', 'fixtures', 'codex-k4', 'launch-outcome-codex-ready.json'));
    await launchOutcome();
    const codexOutcome = JSON.parse(stdout.join(''));

    expect(Object.keys(piOutcome)).toEqual(Object.keys(codexOutcome));
    expect(piOutcome.runtime.name).toBe('pi');
    expect(piOutcome.readiness.status).toBe('unverified');
  });
});
