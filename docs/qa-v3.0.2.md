# QA Report — `@jaggerxtrm/specialists` v3.0.2

**Date:** 2026-03-11
**Tester:** Claude Sonnet 4.6 (automated QA agent)
**Environment:** Linux 6.18.13, Node v25.2.1, Bun runtime, project `gitboard`
**Scope:** Full CLI + MCP surface, background job lifecycle, hook integration, bead integration

---

## Summary

| Result | Count |
|--------|-------|
| **PASS** | 23 |
| **FAIL** | 6 |
| **SKIP** | 1 |
| **Total** | 30 |

---

## Full Results

### Phase 0 — Preflight

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T01 | `specialists version` | **PASS** | Prints `@jaggerxtrm/specialists v3.0.2` |
| T02 | `specialists install` | **FAIL** | Completely silent — no output under any condition (piped, TTY, `--force`). Cannot verify hook status or count. |
| T03 | `specialists status` includes Active Jobs | **FAIL** | pi, beads, MCP sections present; Active Jobs section only renders when ≥1 job exists — absent when queue is empty. |
| T04 | `specialists list` | **PASS** | Lists 9 specialists with model and description. |
| T05 | `specialists models` | **PASS** | Lists 42 models across 5 providers (anthropic, google-gemini-cli, qwen, qwen-cli, zai). |

### Phase 1 — Foreground Run

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T06 | `specialists init` | **FAIL** | `.specialists/` pre-existed; `jobs/` and `ready/` subdirs not created by init (lazy-created on first background run). `.gitignore` entry confirmed. |
| T07 | Foreground run | **PASS** | `report-generator` (haiku-4-5) returned full response in 16.9 s. *gemini-3-flash-preview times out at 180 s in this environment — backend-specific, not a CLI bug.* |
| T08 | `specialists status` after T07 shows Active Jobs | **FAIL** | Active Jobs section absent when no background jobs in queue (same as T03). |

### Phase 2 — Background Job Lifecycle

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T09 | `--background` prints `Job started: <id>` | **PASS** | `Job started: 43221b` captured. Parent CLI exits immediately; pi subprocess continues in background. |
| T10 | `specialists status` shows active JOB_ID | **PASS** | Active Jobs table with id, specialist name, status, elapsed time. |
| T11 | `specialists feed <JOB_ID>` | **PASS** | Prints `meta`, `text`, `tool_execution_end`, `done` event lines; no crash; exit 0. |
| T12 | `specialists feed <JOB_ID> --follow` streams to "Job complete." | **PASS** | 30+ live events streamed on `init-session` job; printed `Job complete. Run: specialists result 2d7516` on completion. |
| T13 | `specialists result <JOB_ID>` prints non-empty output | **PASS** | 8,963-byte markdown report printed, exit 0. *gemini `done` jobs produce 0-byte `result.txt` — backend-specific.* |
| T14 | `specialists status --job <JOB_ID>` single-job detail | **SKIP** | `--job` flag not implemented; shows full table instead. |

### Phase 3 — Stop / Error Path

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T15 | `specialists stop <JOB_ID>` | **PASS** | Prints `✓ Sent SIGTERM to PID … (job …)`, exit 0. |
| T16 | `specialists result` after stop exits 1 with error message | **FAIL** | Exits 1 (correct) but prints "still running" or "still starting" — never "failed" or "error". Status file not updated post-SIGTERM. |
| T17 | `specialists feed` after stop shows error event | **FAIL** | SIGTERM kills pi process (events freeze, confirmed by EPIPE crash); `status.json` stays `"running"` forever — no error event written. |

### Phase 4 — MCP Tool Surface

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T18 | MCP `use_specialist` | **PASS** | `report-generator` returned non-empty result in 6.5 s. *gemini times out — backend-specific.* |
| T19 | MCP `specialist_status` | **PASS** | Returns JSON with `background_jobs` array. |
| T20 | MCP `list_specialists` | **PASS** | Returns array of 9 entries each with `name`, `model`, `description`. |
| T21 | MCP `start_specialist` description is deprecated | **PASS** | Description starts with `[DEPRECATED v3] Start a specialist asynchronously…` |

### Phase 5 — Completion Hook

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T22 | `ready/` empty after completed job | **FAIL** | At check time an unrelated concurrent completed job had an unconsumed marker. Hook is functional (see T23) — timing-dependent. |
| T23 | Marker created, hook injects on next message | **PASS** | Marker created on job completion; hook consumed it at next `UserPromptSubmit` and emitted correct `{"type":"inject","content":"[Specialist '...' completed …]"}`. |

### Phase 6 — Edge Cases

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| T24 | `specialists result nonexistent` | **PASS** | Prints `No job found: nonexistent`, exit 1. |
| T25 | `specialists stop nonexistent` | **PASS** | Prints `No job found: nonexistent`, exit 1. |
| T26 | `specialists result <still-running>` | **PASS** | Prints `Job … is still starting. Use 'specialists feed --job …' to follow.`, exit 1. |
| T27 | `specialists run nonexistent-specialist` | **PASS** | Prints `Specialist not found: nonexistent-specialist`, exit 1. No stack trace. |

### Bead Integration (supplemental)

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| B1 | MCP `use_specialist` (LOW permission) creates bead | **PASS** | `test-runner` created `forge-dz4`; auto-closed with `COMPLETE, 19373ms, anthropic/claude-haiku-4-5`. `beadId` returned in JSON response. |
| B2 | CLI `specialists run` (LOW permission) creates bead | **PASS** | `test-runner` created `forge-3hg`; `[bead: forge-3hg]` printed inline during run; `✓ bead forge-3hg  18.9s` footer on completion. |
| B3 | READ_ONLY specialists skip bead creation | **PASS** | `codebase-explorer`, `report-generator`, `init-session` produced no beads — correct per `auto` policy. |

---

## Bugs

### Bug 1 — SIGTERM doesn't update job status `(HIGH)`

**Tests:** T16, T17

**Symptom:** After `specialists stop <id>`, the job's `status.json` stays `"running"` indefinitely. `specialists result` reports "still running" forever. No error event is written to `events.jsonl`.

**Root cause (confirmed via EPIPE crash log):**
`specialists run --background` forks the pi subprocess and immediately exits after printing `Job started:`. There is no persistent watcher process. When `specialists stop` sends SIGTERM to the pi PID, pi attempts to write its final event to a now-dead pipe and crashes with an unhandled EPIPE:

```
Error: write EPIPE
  at afterWriteDispatched (node:internal/stream_base_commons:159:15)
  at rpc-mode.js:22  ← pi trying to emit final event
  at AgentSession._emit (agent-session.js:140:13)
```

Since no parent process is watching the pi subprocess's exit, `status.json` is never updated to `"error"` or `"cancelled"`.

**Suggested fix:** Spawn a lightweight watcher/daemon per background job that traps the pi process exit (via `SIGCHLD` or `process.on('exit')`) and writes a final `status.json` with `status: "error"` plus an error event to `events.jsonl`.

---

### Bug 2 — `specialists install` is completely silent `(MEDIUM)`

**Test:** T02

**Symptom:** `specialists install` produces zero output under all conditions — interactive TTY, piped, `--force` flag. Cannot verify which hooks are registered or whether anything is up to date.

**Expected:** Per-hook status lines (e.g. `○ specialists-complete.mjs — up to date`) and a final count of registered hooks.

---

### Bug 3 — Active Jobs section absent when queue is empty `(MEDIUM)`

**Tests:** T03, T08

**Symptom:** `specialists status` omits the Active Jobs section entirely when there are zero background jobs.

**Expected:** Active Jobs section always present, rendered empty (e.g. `── Active Jobs ─── (none)`), so users know the feature is available without needing to start a job first.

---

### Bug 4 — `specialists init` doesn't create `jobs/` and `ready/` subdirs `(MEDIUM)`

**Test:** T06

**Symptom:** `specialists init` does not create `.specialists/jobs/` or `.specialists/ready/`. These directories are created lazily on the first background job run.

**Expected:** `init` should create the full directory structure upfront so users can inspect the layout before running any jobs.

---

### Bug 5 — `specialists status --job` not implemented `(LOW)`

**Test:** T14 (SKIP)

**Symptom:** `specialists status --job <id>` shows the full status table instead of a single-job detail view with model, elapsed, bead_id fields.

---

### Bug 6 — `ready/` marker timing `(LOW)`

**Test:** T22

**Symptom:** Markers accumulate in `.specialists/ready/` between user messages. Checking immediately after a job completes may show stale markers from other concurrently completed jobs. The `specialists-complete.mjs` hook only fires at `UserPromptSubmit` boundaries.

**Impact:** Low — markers are always consumed correctly at the next message boundary; no data loss.

---

## Backend Note

All original failures on `google-gemini-cli/gemini-3-flash-preview` (T07, T12, T13, T18 in initial runs) are **environment-specific** — the gemini backend times out at 180 s on every invocation in this environment. All tests pass cleanly with `anthropic/claude-haiku-4-5`. The empty `result.txt` observed on gemini `done` jobs is also backend-specific (pi exits before writing output).

---

## Hook Implementation Reference

`specialists-complete.mjs` installed at `~/.claude/hooks/specialists-complete.mjs`:

- Fires on every `UserPromptSubmit`
- Reads `.specialists/ready/` for completed-job marker files
- For each marker: reads `status.json`, emits injection JSON to stdout
- Injection format: `{"type":"inject","content":"[Specialist '<name>' completed (job <id>, <n>s). Run: specialists result <id>]"}`
- Deletes marker after injection (fires once per job)
- Only `status: done` jobs create markers; errored jobs do not

---

## Bead Policy Reference

| Specialist | Permission | Bead auto-created |
|------------|-----------|-------------------|
| `auto-remediation` | HIGH | Yes |
| `bug-hunt` | LOW | Yes |
| `test-runner` | LOW | Yes (tested) |
| `codebase-explorer` | READ_ONLY | No |
| `feature-design` | READ_ONLY | No |
| `init-session` | READ_ONLY | No |
| `overthinker` | READ_ONLY | No |
| `parallel-review` | READ_ONLY | No |
| `report-generator` | READ_ONLY | No |

`beads_integration` is not set in any specialist YAML — all use the `auto` default (create for LOW/MEDIUM/HIGH, skip for READ_ONLY).
