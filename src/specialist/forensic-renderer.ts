// Shared ForensicEvent → display-row mapper.
//
// Single source of truth for converting a `xtrm.forensic.v1` event into a
// renderable row. Consumed by both `sp log` (default render path) and the
// console FeedView's `forensic` source. Pure: no IO, no color, no terminal
// width assumptions — callers paint and lay out.
//
// Redaction contract: payload is built from pickAllowedLabels(event.body),
// so the Prometheus-forbidden labels (raw_command, prompt, model_output,
// credentials, …) cannot reach the rendered row. Callers MUST NOT add raw
// body fields back; doing so violates the redaction policy enforced by
// FORBIDDEN_PROMETHEUS_LABELS in forensic-events.ts.
//
// Greppable invariant: this is the only module that maps ForensicEvent to a
// row in `src/`. See bead unitAI-ctb4u.13.

import {
  FORENSIC_SCHEMA_VERSION,
  pickAllowedLabels,
  type ForensicCorrelation,
  type ForensicEvent,
  type ForensicSeverity,
} from './forensic-events.js';

export interface RenderedRow {
  ts: number;
  seq?: number;
  type: string;
  actor: string;
  severity: ForensicSeverity;
  payload: string;
  jobId: string;
  beadId?: string;
  schemaWarning?: string;
  correlation?: Pick<ForensicCorrelation, 'chain_id' | 'chain_root_job_id' | 'participant_id'>;
}

export interface RenderOpts {
  includeJobPrefix?: boolean;
  includeBeadPrefix?: boolean;
  maxPayloadFields?: number;
  maxFieldValueChars?: number;
}

const DEFAULT_MAX_PAYLOAD_FIELDS = 5;
const DEFAULT_MAX_FIELD_VALUE_CHARS = 32;

export function forensicEventToRow(ev: ForensicEvent, opts: RenderOpts = {}): RenderedRow {
  const schemaWarning =
    ev.schema_version === FORENSIC_SCHEMA_VERSION
      ? undefined
      : `unknown forensic schema: ${ev.schema_version}`;

  return {
    ts: ev.t_unix_ms,
    seq: ev.seq,
    type: `${ev.event_family}.${ev.event_name}`,
    actor: buildActor(ev),
    severity: ev.severity,
    payload: buildPayload(ev, opts),
    jobId: typeof ev.correlation.job_id === 'string' ? ev.correlation.job_id : '',
    beadId: typeof ev.correlation.bead_id === 'string' ? ev.correlation.bead_id : undefined,
    schemaWarning,
    correlation: {
      chain_id: ev.correlation.chain_id,
      chain_root_job_id: ev.correlation.chain_root_job_id,
      participant_id: ev.correlation.participant_id,
    },
  };
}

function buildActor(ev: ForensicEvent): string {
  const role = ev.resource.participant_role ?? 'unknown';
  const jobId = typeof ev.correlation.job_id === 'string' ? ev.correlation.job_id : '';
  const jobShort = jobId.slice(0, 8) || '-';
  return `${role}:${jobShort}`;
}

function buildPayload(ev: ForensicEvent, opts: RenderOpts): string {
  const maxFields = opts.maxPayloadFields ?? DEFAULT_MAX_PAYLOAD_FIELDS;
  const maxChars = opts.maxFieldValueChars ?? DEFAULT_MAX_FIELD_VALUE_CHARS;
  const safe = pickAllowedLabels(ev.body);
  const entries = Object.entries(safe)
    .filter(([, v]) => v && v !== 'null' && v !== 'undefined')
    .slice(0, maxFields)
    .map(([k, v]) => `${k}=${shortenValue(String(v), maxChars)}`);
  if (entries.length > 0) return entries.join(' ');
  return `severity=${ev.severity} redaction=${ev.redaction.status}`;
}

function shortenValue(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (max <= 1) return cleaned.slice(0, max);
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

// ---------- Column layout (spec §7.2) ----------

export interface ColumnLayout {
  seqW: number;
  typeW: number;
  actorW: number;
}

export const SPEC_72_LAYOUT: ColumnLayout = { seqW: 4, typeW: 18, actorW: 24 };

export interface ColumnStrings {
  seq: string;
  type: string;
  actor: string;
  payload: string;
}

export function formatRenderedRowColumns(
  row: RenderedRow,
  layout: ColumnLayout = SPEC_72_LAYOUT,
): ColumnStrings {
  return {
    seq: padLeft(String(row.seq ?? 0).slice(-layout.seqW), layout.seqW),
    type: padRight(truncEllipsis(row.type, layout.typeW), layout.typeW),
    actor: padRight(truncEllipsis(row.actor, layout.actorW), layout.actorW),
    payload: row.payload,
  };
}

function padLeft(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return ' '.repeat(n - s.length) + s;
}

function padRight(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

function truncEllipsis(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return s.slice(0, n - 1) + '…';
}
