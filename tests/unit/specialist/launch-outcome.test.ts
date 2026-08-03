// K4 (unitAI-e67up.4) — Core K2 launch-outcome consumer.
//
// Proves the Specialists-side consumption of the stable Core contract
// `xtrm.command-outcome.v1` (Core commit 1ed512a49e, gate bead unitAI-e67up.6):
// schema/version negotiation, unknown-field tolerance, hostile-input
// rejection, whitelist projection (redaction by construction), and
// pi/codex retrieval-field parity. No prose parsing, no second job/result
// authority.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LAUNCH_OUTCOME_SCHEMA_VERSION,
  LaunchOutcomeError,
  parseLaunchOutcome,
  projectLaunchOutcome,
  validateLaunchOutcome,
} from '../../../src/specialist/launch-outcome.js';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'codex-k4');
const codexFixture = () => readFileSync(join(FIXTURES, 'launch-outcome-codex-ready.json'), 'utf-8');
const piFixture = () => readFileSync(join(FIXTURES, 'launch-outcome-pi-unverified.json'), 'utf-8');

function errorOf(fn: () => unknown): LaunchOutcomeError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LaunchOutcomeError);
    return error as LaunchOutcomeError;
  }
  throw new Error('expected LaunchOutcomeError');
}

describe('launch-outcome consumer (xtrm.command-outcome.v1)', () => {
  it('pins the consumed schema version constant', () => {
    expect(LAUNCH_OUTCOME_SCHEMA_VERSION).toBe('xtrm.command-outcome.v1');
  });

  it('validates the codex fixture and projects retrieval fields as data', () => {
    const outcome = validateLaunchOutcome(parseLaunchOutcome(codexFixture()));
    expect(outcome.status).toBe('ok');
    expect(outcome.reason_code).toBe('session_created');
    expect(outcome.runtime).toEqual({ name: 'codex', version: '0.30.0' });
    expect(outcome.identity?.thread_id).toBe('thr-codex-0001');
    expect(outcome.worktree).toEqual({
      path: '/tmp/xtrm/worktrees/codex-probe',
      branch: 'codex/codex-probe',
      owner: 'core',
    });
    expect(outcome.readiness).toEqual({ status: 'ready', source: 'agent.ready' });

    const projection = projectLaunchOutcome(outcome);
    // Exact follow-up actions stay argv data, never reconstructed shell text.
    const attach = projection.next_actions.find((a) => a.kind === 'attach');
    expect(attach?.argv).toEqual(['xt', 'attach', 'codex/codex-probe']);
    expect(attach?.required).toBe(false);
    expect(projection.next_actions.every((a) => Array.isArray(a.argv) && a.argv.length > 0)).toBe(true);
  });

  it('validates the pi fixture with a null thread_id (parity pair)', () => {
    const outcome = validateLaunchOutcome(parseLaunchOutcome(piFixture()));
    expect(outcome.runtime).toEqual({ name: 'pi', version: '0.50.0' });
    expect(outcome.identity?.thread_id).toBeNull();
    expect(outcome.readiness).toEqual({ status: 'unverified', source: 'tmux-pane' });
  });

  it('projects identical retrieval key sets for pi and codex outcomes', () => {
    const codex = projectLaunchOutcome(validateLaunchOutcome(parseLaunchOutcome(codexFixture())));
    const pi = projectLaunchOutcome(validateLaunchOutcome(parseLaunchOutcome(piFixture())));
    expect(Object.keys(codex)).toEqual(Object.keys(pi));
    expect(Object.keys(codex.identity ?? {})).toEqual(Object.keys(pi.identity ?? {}));
    expect(Object.keys(codex.worktree ?? {})).toEqual(Object.keys(pi.worktree ?? {}));
    expect(Object.keys(codex.readiness ?? {})).toEqual(Object.keys(pi.readiness ?? {}));
  });

  it('tolerates unknown top-level and nested fields (forward compatibility)', () => {
    const base = JSON.parse(codexFixture());
    base.future_contract_field = { anything: true };
    base.identity.future_identity_field = 'x';
    const outcome = validateLaunchOutcome(base);
    expect(outcome.status).toBe('ok');
    // Whitelist projection drops unknown fields: redaction by construction.
    const projection = projectLaunchOutcome(outcome) as Record<string, unknown>;
    expect('future_contract_field' in projection).toBe(false);
    expect('future_identity_field' in (projection.identity as object)).toBe(false);
  });

  it('rejects a different schema_version with unsupported_schema', () => {
    const raw = readFileSync(join(FIXTURES, 'launch-outcome-wrong-schema.json'), 'utf-8');
    const error = errorOf(() => validateLaunchOutcome(parseLaunchOutcome(raw)));
    expect(error.code).toBe('unsupported_schema');
  });

  it('rejects malformed JSON with invalid_json', () => {
    const error = errorOf(() => parseLaunchOutcome('{ not json'));
    expect(error.code).toBe('invalid_json');
  });

  it('rejects a non-object root with invalid_outcome', () => {
    expect(errorOf(() => validateLaunchOutcome(parseLaunchOutcome('[]'))).code).toBe('invalid_outcome');
    expect(errorOf(() => validateLaunchOutcome(parseLaunchOutcome('"x"'))).code).toBe('invalid_outcome');
  });

  it('rejects missing required fields with invalid_outcome', () => {
    const base = JSON.parse(codexFixture());
    delete base.reason_code;
    expect(errorOf(() => validateLaunchOutcome(base)).code).toBe('invalid_outcome');

    const noMutation = JSON.parse(codexFixture());
    delete noMutation.authoritative_mutation;
    expect(errorOf(() => validateLaunchOutcome(noMutation)).code).toBe('invalid_outcome');
  });

  it('rejects control characters in bounded strings (hostile input)', () => {
    const base = JSON.parse(codexFixture());
    base.summary = 'evil\u0000summary';
    expect(errorOf(() => validateLaunchOutcome(base)).code).toBe('invalid_outcome');

    const action = JSON.parse(codexFixture());
    action.next_actions[0].display = 'evil\u001bdisplay';
    expect(errorOf(() => validateLaunchOutcome(action)).code).toBe('invalid_outcome');
  });

  it('rejects an unknown runtime name (surface enum is closed)', () => {
    const base = JSON.parse(codexFixture());
    base.runtime.name = 'openai-codex';
    expect(errorOf(() => validateLaunchOutcome(base)).code).toBe('invalid_outcome');
  });

  it('rejects a worktree owned by anyone but core', () => {
    const base = JSON.parse(codexFixture());
    base.worktree.owner = 'specialists';
    expect(errorOf(() => validateLaunchOutcome(base)).code).toBe('invalid_outcome');
  });

  it('rejects a next_action without argv or with an empty argv', () => {
    const missing = JSON.parse(codexFixture());
    delete missing.next_actions[0].argv;
    expect(errorOf(() => validateLaunchOutcome(missing)).code).toBe('invalid_outcome');

    const empty = JSON.parse(codexFixture());
    empty.next_actions[0].argv = [];
    expect(errorOf(() => validateLaunchOutcome(empty)).code).toBe('invalid_outcome');
  });

  it('rejects an out-of-enum status', () => {
    const base = JSON.parse(codexFixture());
    base.status = 'exploded';
    expect(errorOf(() => validateLaunchOutcome(base)).code).toBe('invalid_outcome');
  });
});
