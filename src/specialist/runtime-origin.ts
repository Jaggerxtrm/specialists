// RuntimeOriginV1 — xtmux runtime-origin capture for Specialists.
// Spec: docs/xtmux-gaps.md sections 11, 13.1-13.4, 15, 16.
//
// Failure behavior is non-negotiable: EVERY function on this module returns
// undefined (or an { error } for the validator) on any failure. NEVER throws.
// NEVER fabricates a binding. NEVER logs prompt/command/terminal text.

import { spawnSync } from 'node:child_process';

export const SPECIALISTS_RUNTIME_ORIGIN_V1 = 'SPECIALISTS_RUNTIME_ORIGIN_V1';
export const MAX_ORIGIN_JSON_BYTES = 16 * 1024;
export const DEFAULT_CAPTURE_TIMEOUT_MS = 500;

const SCHEMA_VERSION = 'xtrm.runtime-origin.v1' as const;
const KIND_AGENT_INSTANCE = 'xtmux.agent_instance' as const;
type CaptureSource = 'xtmux-context' | 'propagated';

export interface RuntimeOriginV1 {
  schema_version: typeof SCHEMA_VERSION;
  kind: typeof KIND_AGENT_INSTANCE;
  host_id: string;
  tmux_server_id?: string;
  tmux_session_id: string;
  tmux_window_id: string;
  tmux_pane_id: string;
  agent_instance_id?: string;
  bead_id?: string;
  parent_session_id?: string;
  captured_at_ms: number;
  capture_source: CaptureSource;
  verified: boolean;
}

export type SpecialistSpawnOriginV1 =
  | { kind: 'xtmux.agent_instance'; runtime_origin: RuntimeOriginV1 }
  | { kind: 'specialist.job'; parent_job_id: string }
  | { kind: 'unknown' };

type SubprocessRunner = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; env: NodeJS.ProcessEnv },
) => { status: number | null; stdout: string; stderr: string; error?: NodeJS.ErrnoException };

function defaultRunner(
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; env: NodeJS.ProcessEnv },
): ReturnType<SubprocessRunner> {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeoutMs,
    env: opts.env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error as NodeJS.ErrnoException | undefined,
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || (typeof v === 'string' && v.length > 0);
}

const ALLOWED_KEYS = new Set<keyof RuntimeOriginV1>([
  'schema_version', 'kind', 'host_id', 'tmux_server_id',
  'tmux_session_id', 'tmux_window_id', 'tmux_pane_id',
  'agent_instance_id', 'bead_id', 'parent_session_id',
  'captured_at_ms', 'capture_source', 'verified',
]);

export function validateRuntimeOrigin(input: unknown): RuntimeOriginV1 | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'not-object' };
  }
  const o = input as Record<string, unknown>;
  if (o.schema_version !== SCHEMA_VERSION) return { error: 'wrong-schema-version' };
  if (o.kind !== KIND_AGENT_INSTANCE) return { error: 'wrong-kind' };
  if (!isNonEmptyString(o.host_id)) return { error: 'invalid-host-id' };
  if (!isNonEmptyString(o.tmux_session_id)) return { error: 'invalid-tmux-session-id' };
  if (!isNonEmptyString(o.tmux_window_id)) return { error: 'invalid-tmux-window-id' };
  if (!isNonEmptyString(o.tmux_pane_id)) return { error: 'invalid-tmux-pane-id' };
  if (!isOptionalString(o.tmux_server_id)) return { error: 'invalid-tmux-server-id' };
  if (!isOptionalString(o.agent_instance_id)) return { error: 'invalid-agent-instance-id' };
  if (!isOptionalString(o.bead_id)) return { error: 'invalid-bead-id' };
  if (!isOptionalString(o.parent_session_id)) return { error: 'invalid-parent-session-id' };
  if (typeof o.captured_at_ms !== 'number' || !Number.isFinite(o.captured_at_ms) || o.captured_at_ms < 0) {
    return { error: 'invalid-captured-at-ms' };
  }
  if (o.capture_source !== 'xtmux-context' && o.capture_source !== 'propagated') {
    return { error: 'invalid-capture-source' };
  }
  if (typeof o.verified !== 'boolean') return { error: 'invalid-verified' };

  // Strict allowlist: reject unknown top-level keys. Forward-compat is handled
  // via a schema version bump, not by silently pass-through unknown fields.
  for (const key of Object.keys(o)) {
    if (!ALLOWED_KEYS.has(key as keyof RuntimeOriginV1)) {
      return { error: `unknown-field:${key}` };
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    kind: KIND_AGENT_INSTANCE,
    host_id: o.host_id,
    tmux_server_id: o.tmux_server_id as string | undefined,
    tmux_session_id: o.tmux_session_id,
    tmux_window_id: o.tmux_window_id,
    tmux_pane_id: o.tmux_pane_id,
    agent_instance_id: o.agent_instance_id as string | undefined,
    bead_id: o.bead_id as string | undefined,
    parent_session_id: o.parent_session_id as string | undefined,
    captured_at_ms: o.captured_at_ms,
    capture_source: o.capture_source,
    verified: o.verified,
  };
}

function logLine(fields: Record<string, string | number | undefined>): void {
  const parts = ['[specialists] component=runtime-origin'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    parts.push(`${k}=${v}`);
  }
  console.warn(parts.join(' '));
}

export interface CaptureRuntimeOriginOptions {
  subprocess?: SubprocessRunner;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export async function captureRuntimeOrigin(
  opts: CaptureRuntimeOriginOptions = {},
): Promise<RuntimeOriginV1 | undefined> {
  const started = Date.now();
  const runner = opts.subprocess ?? defaultRunner;
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;

  if (!env.TMUX_PANE) {
    logLine({ event: 'capture', outcome: 'skipped', reason: 'outside-tmux', duration_ms: Date.now() - started });
    return undefined;
  }

  let result;
  try {
    result = runner('xtmux', ['context', '--current', '--json'], { timeoutMs, env });
  } catch (err) {
    logLine({ event: 'capture', outcome: 'unavailable', reason: `runner-throw:${String((err as Error).message).slice(0, 60)}`, duration_ms: Date.now() - started });
    return undefined;
  }

  if (result.error?.code === 'ENOENT') {
    logLine({ event: 'capture', outcome: 'unavailable', reason: 'binary-missing', duration_ms: Date.now() - started });
    return undefined;
  }
  if (result.status !== 0) {
    logLine({ event: 'capture', outcome: 'unavailable', reason: `exit-${result.status ?? 'null'}`, duration_ms: Date.now() - started });
    return undefined;
  }
  if (result.stdout.length > MAX_ORIGIN_JSON_BYTES) {
    logLine({ event: 'capture', outcome: 'malformed', reason: 'payload-too-large', duration_ms: Date.now() - started });
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    logLine({ event: 'capture', outcome: 'malformed', reason: 'json-parse', duration_ms: Date.now() - started });
    return undefined;
  }

  const validated = validateRuntimeOrigin(parsed);
  if ('error' in validated) {
    logLine({ event: 'reject', outcome: 'malformed', reason: validated.error, duration_ms: Date.now() - started });
    return undefined;
  }

  logLine({
    event: 'capture',
    outcome: 'ok',
    pane: validated.tmux_pane_id,
    agent: validated.agent_instance_id?.slice(0, 8) ?? '-',
    verified: String(validated.verified),
    duration_ms: Date.now() - started,
  });
  return validated;
}

export function decodePropagatedOrigin(env: NodeJS.ProcessEnv): RuntimeOriginV1 | undefined {
  const raw = env[SPECIALISTS_RUNTIME_ORIGIN_V1];
  if (!raw) return undefined;
  if (raw.length > MAX_ORIGIN_JSON_BYTES) {
    logLine({ event: 'reject', outcome: 'malformed', reason: 'propagated-too-large' });
    return undefined;
  }

  let jsonText = raw;
  const trimmed = raw.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      jsonText = Buffer.from(trimmed, 'base64url').toString('utf-8');
    } catch {
      logLine({ event: 'reject', outcome: 'malformed', reason: 'base64url-decode' });
      return undefined;
    }
    if (jsonText.length > MAX_ORIGIN_JSON_BYTES) {
      logLine({ event: 'reject', outcome: 'malformed', reason: 'propagated-decoded-too-large' });
      return undefined;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    logLine({ event: 'reject', outcome: 'malformed', reason: 'propagated-json-parse' });
    return undefined;
  }

  const validated = validateRuntimeOrigin(parsed);
  if ('error' in validated) {
    logLine({ event: 'reject', outcome: 'malformed', reason: `propagated:${validated.error}` });
    return undefined;
  }

  const propagated: RuntimeOriginV1 = { ...validated, capture_source: 'propagated' };
  logLine({
    event: 'propagate',
    outcome: 'ok',
    pane: propagated.tmux_pane_id,
    agent: propagated.agent_instance_id?.slice(0, 8) ?? '-',
    verified: String(propagated.verified),
  });
  return propagated;
}

export function encodePropagatedOrigin(origin: RuntimeOriginV1): string {
  return Buffer.from(JSON.stringify(origin), 'utf-8').toString('base64url');
}
