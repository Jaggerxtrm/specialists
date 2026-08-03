// Core K2 launch-outcome consumer — `xtrm.command-outcome.v1`.
//
// K4 (unitAI-e67up.4). Core owns the launcher, the worktree, the tmux
// transport, and this contract's field names and reason-code enums (merged
// Core commit 1ed512a49efaf75f3e84c128f9d82958ece09d3a, gate bead
// unitAI-e67up.6). Specialists consumes the stable contract boundary only:
//
// - no prose parsing — structured fields only;
// - schema/version negotiation — an unknown `schema_version` is refused with
//   a stable code instead of guessed at;
// - unknown-field tolerance — forward compatibility for additive Core
//   changes; unrecognized keys validate but never reach output;
// - whitelist projection — the emitted shape is redaction by construction:
//   only contracted keys pass, so prompts, credentials, transcripts and
//   terminal capture (which have no contract slot) cannot leak through here;
// - no second job/result authority — this module never touches jobs, status
//   rows, beads or notes. `sp result` stays the only specialist result seam.
//
// Specialists-facing use (K1 §7, docs/design/codex-k1-characterization.md):
// correlate the launch with role/bead via the Core-owned worktree branch,
// expose readiness and failure reason as data, preserve thread/session and
// worktree identity for result retrieval, and surface exact follow-up
// actions as argv data.

/** The only schema version this consumer accepts. Core owns the name. */
export const LAUNCH_OUTCOME_SCHEMA_VERSION = 'xtrm.command-outcome.v1';

export type LaunchOutcomeErrorCode = 'invalid_json' | 'unsupported_schema' | 'invalid_outcome';

export class LaunchOutcomeError extends Error {
  constructor(public readonly code: LaunchOutcomeErrorCode, message: string) {
    super(message);
    this.name = 'LaunchOutcomeError';
  }
}

export interface LaunchOutcomeRuntime {
  name: 'pi' | 'claude' | 'codex';
  version: string | null;
}

export interface LaunchOutcomeIdentity {
  thread_id: string | null;
  session_name: string | null;
  tmux_session_id: string | null;
  pane_id: string | null;
}

export interface LaunchOutcomeWorktree {
  path: string;
  branch: string;
  owner: 'core';
}

export interface LaunchOutcomeReadiness {
  status: 'ready' | 'unverified' | 'not_ready';
  source: 'agent.ready' | 'tmux-pane' | 'none';
}

export interface LaunchOutcomeSafetyProfile {
  name: string;
  sandbox: string;
  approvals: string;
  hook_trust: 'preserved';
}

export interface LaunchOutcomeMutationRecord {
  completed: boolean;
  kind: string;
}

export interface LaunchOutcomeSideEffect {
  kind: string;
  status: 'ok' | 'degraded' | 'failed' | 'skipped';
  id?: string | null;
}

export interface LaunchOutcomeAction {
  kind: 'attach' | 'resume' | 'repair' | 'end' | 'wait' | 'inspect';
  required: boolean;
  argv: string[];
  display: string;
  why: string;
  cwd?: string;
}

export interface LaunchOutcome {
  schema_version: string;
  status: 'ok' | 'degraded' | 'noop' | 'rejected' | 'failed';
  reason_code: string;
  summary: string;
  runtime: LaunchOutcomeRuntime | null;
  identity: LaunchOutcomeIdentity | null;
  worktree: LaunchOutcomeWorktree | null;
  readiness: LaunchOutcomeReadiness | null;
  safety_profile: LaunchOutcomeSafetyProfile | null;
  persistence: LaunchOutcomeMutationRecord | null;
  authoritative_mutation: LaunchOutcomeMutationRecord;
  side_effects: LaunchOutcomeSideEffect[];
  next_actions: LaunchOutcomeAction[];
}

/** The whitelist projection emitted to consumers. Key order is stable. */
export type LaunchOutcomeProjection = LaunchOutcome;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// Pattern ownership stays with Core (packages/contracts/schemas/
// xtrm.command-outcome.v1.json at the gate commit). The consumer mirrors
// them so a hostile or corrupted outcome cannot smuggle arbitrary shapes
// through the contracted fields.
const REASON_CODE_RE = /^[a-z][a-z0-9_]*$/;
const TOKEN_RE = /^[a-z][a-z0-9-]*$/;
const DOTTED_TOKEN_RE = /^[a-z][a-z0-9.-]*$/;
const TMUX_SESSION_ID_RE = /^\$[0-9]+$/;
const PANE_ID_RE = /^%[0-9]+$/;
const STATUSES = ['ok', 'degraded', 'noop', 'rejected', 'failed'] as const;
const RUNTIMES = ['pi', 'claude', 'codex'] as const;
const READINESS_STATUSES = ['ready', 'unverified', 'not_ready'] as const;
const READINESS_SOURCES = ['agent.ready', 'tmux-pane', 'none'] as const;
const ACTION_KINDS = ['attach', 'resume', 'repair', 'end', 'wait', 'inspect'] as const;
const SIDE_EFFECT_STATUSES = ['ok', 'degraded', 'failed', 'skipped'] as const;

function fail(code: LaunchOutcomeErrorCode, message: string): never {
  throw new LaunchOutcomeError(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') fail('invalid_outcome', `${field} must be a string`);
  if (value.length === 0 && !allowEmpty) fail('invalid_outcome', `${field} must be non-empty`);
  if (value.length > maxLength) fail('invalid_outcome', `${field} exceeds ${maxLength} characters`);
  if (CONTROL_CHARS.test(value)) fail('invalid_outcome', `${field} contains control characters`);
  return value;
}

function patternString(value: unknown, field: string, maxLength: number, pattern: RegExp): string {
  const s = boundedString(value, field, maxLength);
  if (!pattern.test(s)) fail('invalid_outcome', `${field} does not match the contracted pattern`);
  return s;
}

function nullablePatternString(value: unknown, field: string, maxLength: number, pattern: RegExp): string | null {
  if (value === null || value === undefined) return null;
  return patternString(value, field, maxLength, pattern);
}

function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail('invalid_outcome', `${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function mutationRecord(value: unknown, field: string): LaunchOutcomeMutationRecord {
  if (!isObject(value)) fail('invalid_outcome', `${field} must be an object`);
  if (typeof value.completed !== 'boolean') fail('invalid_outcome', `${field}.completed must be a boolean`);
  return { completed: value.completed, kind: patternString(value.kind, `${field}.kind`, 96, DOTTED_TOKEN_RE) };
}

export function parseLaunchOutcome(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail('invalid_json', `outcome is not valid JSON: ${(error as Error)?.message ?? String(error)}`);
  }
}

/**
 * Validate an outcome against the Core contract boundary.
 *
 * Required fields and enums follow `xtrm.command-outcome.v1` at the gate
 * commit. Unknown top-level and nested fields are tolerated (forward
 * compatibility) but never projected.
 */
export function validateLaunchOutcome(value: unknown): LaunchOutcome {
  if (!isObject(value)) fail('invalid_outcome', 'outcome must be a JSON object');

  const schemaVersion = value.schema_version;
  if (typeof schemaVersion !== 'string' || schemaVersion.length === 0) {
    fail('unsupported_schema', 'outcome is missing schema_version');
  }
  if (schemaVersion !== LAUNCH_OUTCOME_SCHEMA_VERSION) {
    fail('unsupported_schema', `unsupported schema_version '${schemaVersion}' (this consumer accepts '${LAUNCH_OUTCOME_SCHEMA_VERSION}')`);
  }

  const outcome: LaunchOutcome = {
    schema_version: schemaVersion,
    status: enumValue(value.status, 'status', STATUSES),
    reason_code: patternString(value.reason_code, 'reason_code', 64, REASON_CODE_RE),
    summary: boundedString(value.summary, 'summary', 240),
    runtime: null,
    identity: null,
    worktree: null,
    readiness: null,
    safety_profile: null,
    persistence: null,
    authoritative_mutation: mutationRecord(value.authoritative_mutation, 'authoritative_mutation'),
    side_effects: [],
    next_actions: [],
  };

  if (value.runtime !== undefined) {
    if (!isObject(value.runtime)) fail('invalid_outcome', 'runtime must be an object');
    // Core marks version required whenever runtime exists: an explicit null
    // is legal, an absent key is not.
    if (!('version' in value.runtime)) fail('invalid_outcome', 'runtime.version is required when runtime is present');
    outcome.runtime = {
      name: enumValue(value.runtime.name, 'runtime.name', RUNTIMES),
      version: value.runtime.version === null
        ? null
        : boundedString(value.runtime.version, 'runtime.version', 128),
    };
  }

  if (value.identity !== undefined) {
    if (!isObject(value.identity)) fail('invalid_outcome', 'identity must be an object');
    const identity = value.identity;
    // Core marks all four identity keys required whenever identity exists:
    // explicit nulls are legal, absent keys are not.
    for (const key of ['thread_id', 'session_name', 'tmux_session_id', 'pane_id']) {
      if (!(key in identity)) fail('invalid_outcome', `identity.${key} is required when identity is present`);
    }
    const nullableId = (field: 'thread_id' | 'session_name'): string | null => {
      const v = identity[field];
      if (v === null) return null;
      return boundedString(v, `identity.${field}`, 256);
    };
    outcome.identity = {
      thread_id: nullableId('thread_id'),
      session_name: nullableId('session_name'),
      tmux_session_id: nullablePatternString(identity.tmux_session_id, 'identity.tmux_session_id', 32, TMUX_SESSION_ID_RE),
      pane_id: nullablePatternString(identity.pane_id, 'identity.pane_id', 32, PANE_ID_RE),
    };
  }

  if (value.worktree !== undefined) {
    if (!isObject(value.worktree)) fail('invalid_outcome', 'worktree must be an object');
    if (value.worktree.owner !== 'core') fail('invalid_outcome', "worktree.owner must be 'core' (Core owns launcher worktrees)");
    outcome.worktree = {
      path: boundedString(value.worktree.path, 'worktree.path', 4096),
      branch: boundedString(value.worktree.branch, 'worktree.branch', 4096),
      owner: 'core',
    };
  }

  if (value.readiness !== undefined) {
    if (!isObject(value.readiness)) fail('invalid_outcome', 'readiness must be an object');
    outcome.readiness = {
      status: enumValue(value.readiness.status, 'readiness.status', READINESS_STATUSES),
      source: enumValue(value.readiness.source, 'readiness.source', READINESS_SOURCES),
    };
  }

  if (value.safety_profile !== undefined) {
    if (!isObject(value.safety_profile)) fail('invalid_outcome', 'safety_profile must be an object');
    if (value.safety_profile.hook_trust !== 'preserved') {
      fail('invalid_outcome', "safety_profile.hook_trust must be 'preserved'");
    }
    outcome.safety_profile = {
      name: patternString(value.safety_profile.name, 'safety_profile.name', 64, TOKEN_RE),
      sandbox: patternString(value.safety_profile.sandbox, 'safety_profile.sandbox', 64, TOKEN_RE),
      approvals: patternString(value.safety_profile.approvals, 'safety_profile.approvals', 64, TOKEN_RE),
      hook_trust: 'preserved',
    };
  }

  if (value.persistence !== undefined) {
    outcome.persistence = mutationRecord(value.persistence, 'persistence');
  }

  if (!Array.isArray(value.side_effects)) fail('invalid_outcome', 'side_effects must be an array');
  if (value.side_effects.length > 32) fail('invalid_outcome', 'side_effects exceeds 32 entries');
  for (const [index, effect] of value.side_effects.entries()) {
    if (!isObject(effect)) fail('invalid_outcome', `side_effects[${index}] must be an object`);
    const entry: LaunchOutcomeSideEffect = {
      kind: patternString(effect.kind, `side_effects[${index}].kind`, 96, DOTTED_TOKEN_RE),
      status: enumValue(effect.status, `side_effects[${index}].status`, SIDE_EFFECT_STATUSES),
    };
    if (effect.id !== undefined) entry.id = effect.id === null ? null : boundedString(effect.id, `side_effects[${index}].id`, 256);
    outcome.side_effects.push(entry);
  }

  if (!Array.isArray(value.next_actions)) fail('invalid_outcome', 'next_actions must be an array');
  if (value.next_actions.length > 16) fail('invalid_outcome', 'next_actions exceeds 16 entries');
  for (const [index, action] of value.next_actions.entries()) {
    if (!isObject(action)) fail('invalid_outcome', `next_actions[${index}] must be an object`);
    if (!Array.isArray(action.argv) || action.argv.length === 0) {
      fail('invalid_outcome', `next_actions[${index}].argv must be a non-empty array`);
    }
    if (action.argv.length > 32) fail('invalid_outcome', `next_actions[${index}].argv exceeds 32 entries`);
    if (typeof action.required !== 'boolean') fail('invalid_outcome', `next_actions[${index}].required must be a boolean`);
    const entry: LaunchOutcomeAction = {
      kind: enumValue(action.kind, `next_actions[${index}].kind`, ACTION_KINDS),
      required: action.required,
      argv: action.argv.map((arg, argIndex) => boundedString(arg, `next_actions[${index}].argv[${argIndex}]`, 4096, true)),
      display: boundedString(action.display, `next_actions[${index}].display`, 8192),
      why: boundedString(action.why, `next_actions[${index}].why`, 240),
    };
    if (action.cwd !== undefined) entry.cwd = boundedString(action.cwd, `next_actions[${index}].cwd`, 4096);
    outcome.next_actions.push(entry);
  }

  return outcome;
}

/**
 * Whitelist projection of a validated outcome.
 *
 * Rebuilds the object key-by-key from the typed validation result, so any
 * unrecognized input field is dropped here rather than echoed. This is the
 * consumer-side redaction guarantee.
 */
export function projectLaunchOutcome(outcome: LaunchOutcome): LaunchOutcomeProjection {
  return {
    schema_version: outcome.schema_version,
    status: outcome.status,
    reason_code: outcome.reason_code,
    summary: outcome.summary,
    runtime: outcome.runtime ? { name: outcome.runtime.name, version: outcome.runtime.version } : null,
    identity: outcome.identity
      ? {
          thread_id: outcome.identity.thread_id,
          session_name: outcome.identity.session_name,
          tmux_session_id: outcome.identity.tmux_session_id,
          pane_id: outcome.identity.pane_id,
        }
      : null,
    worktree: outcome.worktree
      ? { path: outcome.worktree.path, branch: outcome.worktree.branch, owner: outcome.worktree.owner }
      : null,
    readiness: outcome.readiness
      ? { status: outcome.readiness.status, source: outcome.readiness.source }
      : null,
    safety_profile: outcome.safety_profile
      ? {
          name: outcome.safety_profile.name,
          sandbox: outcome.safety_profile.sandbox,
          approvals: outcome.safety_profile.approvals,
          hook_trust: outcome.safety_profile.hook_trust,
        }
      : null,
    persistence: outcome.persistence
      ? { completed: outcome.persistence.completed, kind: outcome.persistence.kind }
      : null,
    authoritative_mutation: {
      completed: outcome.authoritative_mutation.completed,
      kind: outcome.authoritative_mutation.kind,
    },
    side_effects: outcome.side_effects.map((effect) => ({
      kind: effect.kind,
      status: effect.status,
      ...(effect.id !== undefined ? { id: effect.id } : {}),
    })),
    next_actions: outcome.next_actions.map((action) => ({
      kind: action.kind,
      required: action.required,
      argv: [...action.argv],
      display: action.display,
      why: action.why,
      ...(action.cwd !== undefined ? { cwd: action.cwd } : {}),
    })),
  };
}
