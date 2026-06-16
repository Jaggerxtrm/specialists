// Forensic FeedSource adapter.
//
// Reads timeline events, projects them through `forensicEventFromTimelineEvent`,
// and renders one console row per event using spec §7.2 layout:
//   seq(4R) · type(18L,bright) · actor(24L,dim) · payload(free,dim)
//
// Payload is rendered through pickAllowedLabels so forbidden Prometheus labels
// (raw_command, prompt, model_output, …) never reach the screen. We intentionally
// surface event_family.event_name in the type column instead of the mock's
// 5-bucket taxonomy (D3 resolved).

import {
  forensicEventFromTimelineEvent,
  pickAllowedLabels,
  type ForensicEvent,
  type TimelineForensicContext,
} from '../../specialist/forensic-events.js';
import type { TimelineEvent } from '../../specialist/timeline-events.js';
import { padL, padR, paint, truncEllipsis } from './theme.js';
import type { FeedEventRow } from './types.js';

const SEQ_W = 4;
const TYPE_W = 18;
const ACTOR_W = 24;

export function timelineToForensicRow(
  event: TimelineEvent,
  ctx: TimelineForensicContext,
  displaySeq: number,
): FeedEventRow {
  const forensic = forensicEventFromTimelineEvent(
    event as unknown as { t: number; seq?: number; type: string; [key: string]: unknown },
    ctx,
  );
  return forensicEventToFeedRow(forensic, ctx, displaySeq);
}

export function forensicEventToFeedRow(
  forensic: ForensicEvent,
  ctx: TimelineForensicContext,
  displaySeq: number,
): FeedEventRow {
  const seqValue = forensic.seq ?? displaySeq;
  const seqText = padL(String(seqValue).slice(-SEQ_W), SEQ_W);
  const typeText = padR(
    truncEllipsis(`${forensic.event_family}.${forensic.event_name}`, TYPE_W),
    TYPE_W,
  );
  const actorRaw = forensic.resource.participant_role ?? 'unknown';
  const jobShort = (forensic.correlation.job_id ?? ctx.jobId).slice(0, 8);
  const actorText = padR(truncEllipsis(`${actorRaw}:${jobShort}`, ACTOR_W), ACTOR_W);
  const payloadText = renderPayloadSummary(forensic);

  const line = [
    paint(seqText, 'dim'),
    paint(typeText, 'bright'),
    paint(actorText, 'dim'),
    paint(payloadText, 'dim'),
  ].join(' ');

  return {
    jobId: ctx.jobId,
    specialist: ctx.specialist,
    beadId: ctx.beadId,
    seq: forensic.seq,
    t: forensic.t_unix_ms,
    type: forensic.event_family,
    line,
  };
}

function renderPayloadSummary(forensic: ForensicEvent): string {
  const safe = pickAllowedLabels(forensic.body);
  const compact = Object.entries(safe)
    .filter(([, v]) => v && v !== 'null' && v !== 'undefined')
    .slice(0, 5)
    .map(([k, v]) => `${k}=${shorten(String(v))}`)
    .join(' ');
  if (compact) return compact;
  // Fall back to severity + redaction status only — never raw body.
  return `severity=${forensic.severity} redaction=${forensic.redaction.status}`;
}

function shorten(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 32 ? cleaned.slice(0, 31) + '…' : cleaned;
}

export const FORENSIC_LAYOUT = { SEQ_W, TYPE_W, ACTOR_W } as const;
