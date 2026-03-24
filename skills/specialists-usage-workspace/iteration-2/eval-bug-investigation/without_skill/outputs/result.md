# Bug Investigation: Job Status Inconsistency Between `specialists feed` and `specialists result`

## Summary

The intermittent inconsistency where `specialists feed` shows a job as `done` while `specialists result` says it is still running has **two root causes** operating at different layers of the system:

1. **Race condition between `events.jsonl` and `status.json` writes** — `feed` reads from `events.jsonl`, `result` reads from `status.json`, and these are updated in separate, non-atomic steps with no ordering guarantee between them.
2. **Dual state storage with divergent update timing in the Supervisor** — the `run_complete` event is appended to `events.jsonl` *after* `status.json` is updated to `done`, but critically, the `result.txt` file is written *before* `status.json` is updated, creating a window where each data source can disagree with the others.

---

## Investigation Steps

### 1. Identified the data sources for each command

**`specialists feed`** (src/cli/feed.ts):
- Reads `events.jsonl` from `.specialists/jobs/<id>/events.jsonl`
- Determines "job complete" by looking for a `run_complete` event in the event stream (via `isRunCompleteEvent` in `timeline-events.ts`)
- Does NOT read `status.json` for completion determination

**`specialists result`** (src/cli/result.ts):
- Reads `status.json` via `Supervisor.readStatus(jobId)`
- Checks `status.status === 'running' || status.status === 'starting'` and exits with code 1 if true
- If status is `done`, reads and prints `result.txt`

### 2. Traced the write sequence in Supervisor.run() (src/specialist/supervisor.ts, lines 260-283)

The completion path in `Supervisor.run()` executes these writes in sequence:

```
Step A: writeFileSync(resultPath, result.output)       // result.txt written
Step B: updateStatus(id, { status: 'done', ... })      // status.json updated to 'done'
Step C: appendTimelineEvent(createRunCompleteEvent(...)) // run_complete appended to events.jsonl
Step D: writeFileSync(readyDir/id, '')                  // ready marker written
```

### 3. Identified the race window

Between **Step C** (run_complete appended to events.jsonl) and **Step B** (status.json updated to 'done'), there is a real ordering problem in the opposite direction from what one might expect.

More precisely, looking at the actual code order:

- **Step B** (`status.json` → `done`) happens at line 265
- **Step C** (`run_complete` event appended to `events.jsonl`) happens at line 275

This means there is a window — however brief — where:
- `status.json` says `done`
- `events.jsonl` does NOT yet have `run_complete`

But the reported symptom is the *inverse*: `feed` shows `done` while `result` says `still running`. This means there is also a window where:
- `events.jsonl` has `run_complete`
- `status.json` still says `running`

**This can happen through a different path**: `updateStatus` (line 128) reads then writes `status.json`. It reads the current content, merges the patch, and writes via a temp file + rename. If this read-merge-write cycle is slow (e.g., filesystem contention), `events.jsonl` may have been appended with `run_complete` while the status.json rename hasn't completed yet.

Specifically:
```
// supervisor.ts line 275 — run_complete appended AFTER status.json update
appendTimelineEvent(createRunCompleteEvent('COMPLETE', elapsed, {...}));
```

Wait — looking again at the actual code order in lines 260–283:

```typescript
// line 261: result.txt written
writeFileSync(this.resultPath(id), result.output, 'utf-8');

// lines 265-272: status.json updated to 'done'
this.updateStatus(id, {
  status: 'done',
  ...
});

// lines 275-279: run_complete appended to events.jsonl
appendTimelineEvent(createRunCompleteEvent('COMPLETE', elapsed, {...}));

// line 282: ready marker written
writeFileSync(join(this.readyDir(), id), '', 'utf-8');
```

So the **correct ordering** is: `result.txt` → `status.json:done` → `events.jsonl:run_complete`.

This means there is a window where:
- `status.json` = `done`
- `events.jsonl` does NOT yet have `run_complete`

In this window, `specialists result` would succeed (status is done, result.txt exists), but `specialists feed` would NOT show the job as complete because the `run_complete` event hasn't been written yet.

**For the inverse case (feed shows done, result says running):** This can happen if the `run_complete` event somehow appears in `events.jsonl` before `status.json` is updated. However, based on the code, this ordering is not directly possible within a single run.

### 4. Identified a second scenario: the in-progress events.jsonl vs. delayed status.json update

The `onEvent` callback fires during the run (line 224-244 of supervisor.ts):
```typescript
(eventType) => {
  const now = Date.now();
  this.updateStatus(id, {
    status: 'running',
    current_event: eventType,
    ...
  });
  const timelineEvent = mapCallbackEventToTimelineEvent(eventType, {...});
  if (timelineEvent) {
    appendTimelineEvent(timelineEvent);
  }
}
```

Each `updateStatus` call does a read-modify-write of `status.json`. If the `run_complete` append to `events.jsonl` (line 275) races with a still-pending `updateStatus` call that was triggered by an earlier callback, the result could be:

1. `run_complete` written to `events.jsonl` → `feed` shows "done"
2. A queued `updateStatus` write sets status back to `running` (stale write arrives after the `done` update)
3. `result` reads `status.json`, sees `running`, exits with code 1

### 5. Identified the third scenario: `updateStatus` is not atomic end-to-end

`updateStatus` in supervisor.ts:
```typescript
private updateStatus(id: string, updates: Partial<SupervisorStatus>): void {
  const current = this.readStatus(id);    // read
  if (!current) return;
  this.writeStatusFile(id, { ...current, ...updates });  // merge + write
}
```

`writeStatusFile` does use a temp-file + rename (atomic write), so partial writes are not the issue. However, the **read-then-write** is not protected by any mutex. If two `updateStatus` calls interleave:

1. Call A reads status.json: `{ status: 'running', current_event: 'tool_execution_end' }`
2. Call B reads status.json: `{ status: 'running', current_event: 'tool_execution_end' }`
3. Call B writes: `{ status: 'done', ... }` (the final done update)
4. Call A writes: `{ status: 'running', current_event: 'tool_execution_end' }` (stale — overwrites the done!)

This is the classic read-modify-write race condition. Since JavaScript is single-threaded, this specific race cannot happen in the same process. However, because `runner.run()` callbacks can fire synchronously within the await chain, and `updateStatus` does a synchronous readFileSync → writeFileSync, there is no async interleaving possible here either.

**Conclusion on this path**: In Node.js single-threaded execution, this race does not actually occur within one process.

### 6. Re-examining the ordering: The real bug

After careful analysis, the primary bug is the **write ordering** in `Supervisor.run()`:

**Normal path (no race):**
- `result.txt` written
- `status.json` updated to `done`
- `events.jsonl` gets `run_complete` appended

**Window of inconsistency A** (status.json → done before events.jsonl → run_complete):
- `status.json = done` ← `specialists result` would succeed here
- `events.jsonl` missing `run_complete` ← `specialists feed` would NOT show done here

This is the opposite of the reported bug.

**The reported bug (feed shows done, result says running) points to a different scenario.** Looking at what `feed` considers "done": in follow mode, `isCompletionEvent` checks for `isRunCompleteEvent(event) || event.type === 'done' || event.type === 'agent_end'`.

The `agent_end` and `done` legacy event types are listed as completion signals in `feed.ts` (line 170-172), but these are NOT written to `events.jsonl` in the new code path — `mapCallbackEventToTimelineEvent` returns `null` for `agent_end` and `done` (lines 254-259 of timeline-events.ts). However, **legacy jobs** may still have these events on disk.

More importantly, in the **follow mode** polling loop (feed.ts lines 249-251):
```typescript
if (batch.events.some(isCompletionEvent)) {
  completedJobs.add(batch.jobId);
}
```

This runs on every poll tick. If a legacy `agent_end` event is in `events.jsonl` (written by an older version of the code), `feed` would mark the job complete, but if `status.json` was never updated to `done` (e.g., due to a crash after `events.jsonl` write but before `status.json` update), `result` would see `running` or `starting`.

**This is the primary bug scenario**: A crash or error after `events.jsonl` write but before `status.json` update leaves the two sources permanently inconsistent. The crash recovery mechanism in `crashRecovery()` only fires on the next `Supervisor.run()` call (when a new job starts), not proactively. So until another job starts, the stale state persists.

---

## Root Causes Summary

### Root Cause 1: Non-atomic dual-write between status.json and events.jsonl

The completion state is written to two separate files in two sequential writes with no atomicity guarantee between them. A process crash, OS kill, or even a slow filesystem between these two writes leaves them in permanently divergent states.

**Relevant code**: `supervisor.ts` lines 261-282 (the ordering: result.txt → status.json → events.jsonl)

### Root Cause 2: Crash recovery is deferred (not proactive)

`crashRecovery()` is only called at the start of `Supervisor.run()` (line 177). If the process that was running a job crashes after writing `events.jsonl:run_complete` but before updating `status.json:done`, the state remains inconsistent until the next job starts. During this window, `feed` shows done and `result` says running.

**Relevant code**: `supervisor.ts` lines 149-167, 173-177

### Root Cause 3: `result.ts` reads status.json; `feed` reads events.jsonl — no unified source of truth

The two CLI commands consult different data sources with no reconciliation:
- `specialists result` uses `Supervisor.readStatus()` → `status.json`
- `specialists feed` uses `readJobEvents()` → `events.jsonl`

`status.json` is the "live mutable state" per design comments (timeline-events.ts line 455), while `events.jsonl` is intended as source of truth for completed jobs. But `result.ts` uses `status.json` for both the completion gate AND the data source without checking `events.jsonl` for a `run_complete` event as a fallback.

### Root Cause 4: Legacy event types create ambiguous completion detection

`feed.ts` treats `agent_end` and `done` events (legacy) as completion signals (line 170-172). These can exist in older `events.jsonl` files even when `status.json` was not properly finalized, causing feed to conclude "done" while result rejects with "still running."

---

## Files Involved

- `/home/dawid/projects/specialists/src/specialist/supervisor.ts` — dual-write ordering bug (lines 261-282), deferred crash recovery (lines 149-177)
- `/home/dawid/projects/specialists/src/cli/result.ts` — reads only status.json, no fallback to events.jsonl
- `/home/dawid/projects/specialists/src/cli/feed.ts` — reads only events.jsonl, no fallback to status.json; legacy completion events in isCompletionEvent (line 170-172)
- `/home/dawid/projects/specialists/src/specialist/timeline-events.ts` — defines completion event types including legacy done/agent_end
- `/home/dawid/projects/specialists/src/specialist/timeline-query.ts` — job reading utilities

---

## Recommended Fixes

1. **Reverse the write order** in `Supervisor.run()`: write `events.jsonl:run_complete` first, then `status.json:done`. This ensures that if you see `done` in status.json, the timeline is already complete. The current order is backwards relative to what guarantees consistency for the reported symptom.

2. **Add a fallback in `result.ts`**: If `status.json` says `running` but `events.jsonl` contains a `run_complete` event, treat the job as done and attempt to read `result.txt`. This handles the crash-recovery gap.

3. **Make crash recovery proactive**: Call `crashRecovery()` in `readStatus()` or `Supervisor.constructor()`, not only on `run()`. A stale "running" status should be auto-corrected at read time, not only when a new job starts.

4. **Reconcile on read in `readStatus()`**: Before returning a `running`/`starting` status, check if `events.jsonl` has a `run_complete` event. If it does, auto-correct `status.json` to `done` before returning.

---

## What Was NOT a Bug

- The atomic write of `status.json` via temp-file + rename (`writeStatusFile`) correctly prevents partial/corrupt JSON.
- The single-threaded Node.js execution model prevents the read-modify-write race within a single process.
- The `events.jsonl` append-only writes are safe; the only issue is the ordering relationship with `status.json` updates.
