// Forensic lineage reconstruction (spec docs/xtmux-gaps.md §18).
//
// Pure functional over a stream of `xtrm.forensic.v1` events. Given a set of
// `job.started` events (with the E5 typed links), produce the pane→job and
// job→job map that Console (spec §14) will materialize from
// `specialist_forensic_events` alone — no live sqliteClient, no jobRegistry,
// no tmux queries.

import type { ForensicEvent, ForensicSpawnedByLink, ForensicRootRuntimeOrigin } from './forensic-events.js';

export interface ReconstructedJobNode {
  job_id: string;
  parent_job_id?: string;
  spawned_by?: ForensicSpawnedByLink;
  root_runtime_origin?: ForensicRootRuntimeOrigin;
  root_agent_instance_id?: string;
  spawned_at_ms: number;
}

export type ReconstructedLineage = Map<string, ReconstructedJobNode>;

const RUN_START_EVENT_NAME = 'job.started';

/** Extract the lineage map from a chronologically-ordered forensic event stream. */
export function reconstructLineage(events: ForensicEvent[]): ReconstructedLineage {
  const out: ReconstructedLineage = new Map();
  for (const ev of events) {
    if (ev.event_name !== RUN_START_EVENT_NAME) continue;
    const jobId = ev.correlation.job_id;
    if (!jobId) continue;
    const links = ev.links ?? {};
    const spawnedBy = (links as { spawned_by?: ForensicSpawnedByLink }).spawned_by;
    const rootOrigin = (links as { root_runtime_origin?: ForensicRootRuntimeOrigin }).root_runtime_origin;
    out.set(jobId, {
      job_id: jobId,
      ...(ev.correlation.parent_job_id ? { parent_job_id: ev.correlation.parent_job_id } : {}),
      ...(spawnedBy ? { spawned_by: spawnedBy } : {}),
      ...(rootOrigin ? { root_runtime_origin: rootOrigin, root_agent_instance_id: rootOrigin.agent_instance_id } : {}),
      spawned_at_ms: ev.t_unix_ms,
    });
  }
  return out;
}

/**
 * Redaction sweep — scans every event for forbidden identifiers used as
 * top-level Prometheus labels or for prompt/command/terminal payloads that
 * should never leak (spec §16).
 */
export interface RedactionSweepResult {
  forbidden_label_hits: Array<{ event: string; label: string; where: string }>;
  payload_leaks: Array<{ event: string; field: string; snippet: string }>;
}

const FORBIDDEN_LABEL_KEYS = [
  'parent_job_id',
  'agent_instance_id',
  'host_id',
  'tmux_session_id',
  'tmux_window_id',
  'tmux_pane_id',
] as const;

const PAYLOAD_LEAK_FIELDS = ['prompt', 'raw_command', 'raw_diff', 'model_output', 'raw_error'] as const;

/**
 * Prometheus labels live only at `resource.labels`-shaped surfaces. Nothing in
 * the current forensic emission attaches a `labels` object at the event root,
 * so this sweep primarily protects against future regressions. It checks
 * `resource` for any forbidden key (which would be a promotion error).
 */
export function redactionSweep(events: ForensicEvent[]): RedactionSweepResult {
  const result: RedactionSweepResult = { forbidden_label_hits: [], payload_leaks: [] };
  for (const ev of events) {
    const eventTag = `${ev.event_name}#${ev.correlation.job_id ?? '?'}`;
    for (const key of FORBIDDEN_LABEL_KEYS) {
      if (Object.hasOwn(ev.resource as Record<string, unknown>, key)) {
        result.forbidden_label_hits.push({ event: eventTag, label: key, where: 'resource' });
      }
    }
    for (const field of PAYLOAD_LEAK_FIELDS) {
      const bodyValue = (ev.body as Record<string, unknown>)[field];
      if (typeof bodyValue === 'string' && bodyValue.length > 0) {
        result.payload_leaks.push({
          event: eventTag,
          field: `body.${field}`,
          snippet: bodyValue.slice(0, 40),
        });
      }
    }
  }
  return result;
}
