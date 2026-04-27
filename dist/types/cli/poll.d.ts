/**
 * CLI command: specialists poll <job-id>
 *
 * Machine-readable job status polling.
 * DB-backed in normal runtime; file reads remain legacy/operator-only.
 * Designed for programmatic consumption (Claude Code, scripts).
 *
 * Output (JSON mode):
 *   {
 *     "job_id": "abc123",
 *     "status": "running" | "done" | "error" | "cancelled" | "waiting",
 *     "elapsed_ms": 45000,
 *     "cursor": 1523,
 *     "output": "...",          // full output when done
 *     "output_delta": "...",    // new output since cursor
 *     "events": [...],          // new events since cursor
 *     "current_event": "text",
 *     "current_tool": "read",
 *     "model": "claude-sonnet-4-6",
 *     "backend": "anthropic",
 *     "bead_id": "unitAI-123"
 *   }
 */
export declare function run(): Promise<void>;
//# sourceMappingURL=poll.d.ts.map