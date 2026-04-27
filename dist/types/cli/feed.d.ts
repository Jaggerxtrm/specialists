/**
 * Feed v2: unified chronological timeline for specialists jobs.
 *
 * Usage:
 *   specialists|sp feed [options]
 *
 * Options:
 *   --job <id>         Filter to a specific job
 *   --specialist <name> Filter by specialist name
 *   --node <node-ref>  Filter by node id (unique prefix allowed)
 *   --since <timestamp> Start time (ISO 8601 or milliseconds ago like '5m', '1h')
 *   --from <job:seq>   Show only events at/after cursor tuple (job_id:seq)
 *   --limit <n>        Max recent events to show (default: 100)
 *   --follow, -f       Live follow mode (append new events at bottom)
 *   --forever          Stay open even when all jobs complete
 *   --json             Output as NDJSON
 */
export declare function run(): Promise<void>;
//# sourceMappingURL=feed.d.ts.map