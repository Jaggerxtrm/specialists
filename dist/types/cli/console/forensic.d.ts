import { type ForensicEvent, type TimelineForensicContext } from '../../specialist/forensic-events.js';
import type { TimelineEvent } from '../../specialist/timeline-events.js';
import type { FeedEventRow } from './types.js';
export declare const FORENSIC_LAYOUT: {
    readonly SEQ_W: number;
    readonly TYPE_W: number;
    readonly ACTOR_W: number;
};
export declare function timelineToForensicRow(event: TimelineEvent, ctx: TimelineForensicContext, displaySeq: number): FeedEventRow;
export declare function forensicEventToFeedRow(forensic: ForensicEvent, ctx: TimelineForensicContext, displaySeq: number): FeedEventRow;
//# sourceMappingURL=forensic.d.ts.map