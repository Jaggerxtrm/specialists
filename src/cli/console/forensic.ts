// Forensic FeedSource adapter for the console.
//
// Delegates ForensicEvent → row mapping + redaction to the shared
// `src/specialist/forensic-renderer.ts` module. This file only applies the
// console's theme paint and shapes the result into FeedEventRow for the
// view-model. Per bead unitAI-ctb4u.13 there must be exactly ONE mapper in
// the codebase; this file is the second consumer alongside `sp log`.

import {
  forensicEventToRow,
  formatRenderedRowColumns,
  SPEC_72_LAYOUT,
  type ColumnLayout,
  type RenderedRow,
} from '../../specialist/forensic-renderer.js';
import {
  forensicEventFromTimelineEvent,
  type ForensicEvent,
  type TimelineForensicContext,
} from '../../specialist/forensic-events.js';
import type { TimelineEvent } from '../../specialist/timeline-events.js';
import { paint } from './theme.js';
import type { FeedEventRow } from './types.js';

// Console terminal width (120+ cols) is much wider than the 72-col `sp log`
// surface, so the type column must accommodate the longest current
// event_family.event_name (~26 chars: `gitnexus.detect_changes`) plus
// headroom. typeW=32 covers all known labels without truncation;
// actorW/seqW match the shared spec. SPEC_72_LAYOUT remains canonical
// for `sp log` (see specialist/forensic-renderer.ts).
const CONSOLE_LAYOUT: ColumnLayout = { seqW: SPEC_72_LAYOUT.seqW, typeW: 32, actorW: SPEC_72_LAYOUT.actorW };

export const FORENSIC_LAYOUT = {
  SEQ_W: CONSOLE_LAYOUT.seqW,
  TYPE_W: CONSOLE_LAYOUT.typeW,
  ACTOR_W: CONSOLE_LAYOUT.actorW,
} as const;

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
  const row = forensicEventToRow(forensic);
  // Display sequence falls back to position when the event has no seq.
  const renderRow: RenderedRow = { ...row, seq: row.seq ?? displaySeq };
  const cols = formatRenderedRowColumns(renderRow, CONSOLE_LAYOUT);
  const line = [
    paint(cols.seq, 'dim'),
    paint(cols.type, 'bright'),
    paint(cols.actor, 'dim'),
    paint(cols.payload, 'dim'),
  ].join(' ');
  return {
    jobId: ctx.jobId,
    specialist: ctx.specialist,
    beadId: ctx.beadId,
    seq: row.seq,
    t: row.ts,
    type: forensic.event_family,
    line,
  };
}
