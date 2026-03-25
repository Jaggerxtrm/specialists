# Bug Investigation: Job Status Inconsistency Between `specialists feed` and `specialists result`

## Approach: Skill Consultation + Delegation Attempt + Direct Investigation

### Step 1: Read the Skill

Read `/home/dawid/projects/specialists/skills/specialists-usage/SKILL.md`.

The skill guidance is clear: for deep bug investigations that span multiple files, delegate to a specialist. This task matched the criteria:
- It spans multiple files (feed.ts, result.ts, supervisor.ts, timeline-events.ts, timeline-query.ts, runner.ts, pi/session.ts)
- It would take >5 minutes of focused work
- A fresh perspective adds value

Decision: **delegate to the `bug-hunt` specialist**.

### Step 2: Delegation Attempt

Created a bead for tracking:
```
bd create --title "Investigate: job status inconsistency between specialists feed and specialists result" --type task --priority 2
# -> unitAI-s82l
```

Updated with description:
```
bd update unitAI-s82l --description "Intermittent failures: specialist jobs show status 'done' in 'specialists feed' output but 'specialists result' says they are still running..."
```

Discovered that `--prompt` and `--bead` cannot be combined (run exits with error). Used `--bead` only:
```
specialists run bug-hunt --bead unitAI-s82l --background
# -> bcyvkirdh (background job ID in Claude Code's subagent system)
```

**Important observation**: The `--background` flag here refers to Claude Code's internal background subagent system, NOT the `Supervisor`-managed `.specialists/jobs/` system. The ID `bcyvkirdh` is a Claude Code task ID, not a Supervisor job ID. So `specialists result bcyvkirdh` correctly returned "No job found" — the job was never in `.specialists/jobs/`.

The specialist timed out after 5 minutes (300000ms). Since the delegation did not produce results, I proceeded with direct investigation.

### Step 3: Direct Source Code Investigation

Read all relevant files:
- `/home/dawid/projects/specialists/src/cli/feed.ts`
- `/home/dawid/projects/specialists/src/cli/result.ts`
- `/home/dawid/projects/specialists/src/cli/format-helpers.ts`
- `/home/dawid/projects/specialists/src/specialist/supervisor.ts`
- `/home/dawid/projects/specialists/src/specialist/timeline-events.ts`
- `/home/dawid/projects/specialists/src/specialist/timeline-query.ts`
- `/home/dawid/projects/specialists/src/specialist/runner.ts`
- `/home/dawid/projects/specialists/src/pi/session.ts`

---

## Root Cause Analysis

### The Two State Stores

The job lifecycle uses two separate state stores:

1. **`status.json`** — mutable snapshot, read by `specialists result` via `supervisor.readStatus()`
2. **`events.jsonl`** — append-only timeline, read by `specialists feed` via `readAllJobEvents()`

These are written independently and there is no atomicity guarantee between them.

### The Normal Write Sequence (in `supervisor.run()`)

```
# After runner.run() completes:
line 261: writeFileSync(result.txt, result.output)
line 265-272: updateStatus(id, { status: 'done', ... })   ← status.json -> 'done'
line 275-279: appendTimelineEvent(createRunCompleteEvent(...))  ← events.jsonl gets run_complete
line 282: writeFileSync(ready marker)
```

In the normal path, `status.json` is set to `done` BEFORE `run_complete` is written to `events.jsonl`. This means `result` would work before `feed` shows done — no bug in the happy path.

### The Race Condition (Root Cause)

The bug is caused by a late-firing `onEvent` callback that **overwrites `status.json` back to `running` after it has been set to `done`**.

In `supervisor.run()`, the `onEvent` callback is:

```typescript
(eventType) => {
  const now = Date.now();
  this.updateStatus(id, {
    status: 'running',  // ← ALWAYS writes 'running', unconditionally
    current_event: eventType,
    last_event_at_ms: now,
    elapsed_s: Math.round((now - startedAtMs) / 1000),
  });
  // ...map and append to events.jsonl...
}
```

The `updateStatus` method does a read-modify-write:
```typescript
private updateStatus(id: string, updates: Partial<SupervisorStatus>): void {
  const current = this.readStatus(id);
  if (!current) return;
  this.writeStatusFile(id, { ...current, ...updates });
}
```

**The race sequence:**

1. `runner.run()` resolves (all events have been observed)
2. `supervisor.run()` calls `updateStatus({status: 'done'})` — status.json now says `done`
3. `appendTimelineEvent(run_complete)` — events.jsonl now has `run_complete`
4. A **late `onEvent` callback fires** (queued in the event loop before `await runner.run()` returned but dispatched after)
5. The late callback calls `updateStatus({status: 'running'})`:
   - `readStatus()` reads the current `done` status
   - spreads `{ ...current, ...{ status: 'running' } }` — **overwrites `done` back to `running`**
   - writes the overwritten status back to `status.json`

**Result state after the race:**
- `events.jsonl`: contains `run_complete` event → `feed` shows job as **done**
- `status.json`: was overwritten to `running` → `result` reports job is **still running**

### Why It's Intermittent

This race depends on event loop scheduling. The `onEvent` callback is called synchronously from within `PiAgentSession`'s stdout data handler (`session.ts`). However:

1. The `agent_end` event fires `_doneResolve?.()` which resolves the `_donePromise`
2. `waitForDone()` in runner.ts awaits this promise
3. Due to microtask/macrotask ordering, there can be pending `onEvent` callbacks from late `tool_execution_end` or `text_delta` events that were buffered in the same or following stdout chunk

Additionally, the `close()` call in runner.ts (line 213) awaits `_donePromise` again after `waitForDone()`, and the process `close` event can fire additional event handlers.

### Secondary Observation: `agent_end` Suppressed From events.jsonl

In `mapCallbackEventToTimelineEvent`, the `agent_end` callback event is explicitly **suppressed** (returns `null`). So `events.jsonl` never contains `agent_end`. The `isCompletionEvent` function in feed.ts checks for `agent_end`, but this can never be true for events read from disk. This is correct behavior by design, but means the only completion signal in `events.jsonl` is `run_complete`.

### Where to Fix

The fix should be in `supervisor.ts`'s `onEvent` callback. It should not overwrite `status` back to `running` if the status has already been transitioned to `done` or `error`:

```typescript
// Proposed guard in the onEvent callback:
(eventType) => {
  const current = this.readStatus(id);
  if (!current || current.status === 'done' || current.status === 'error') return; // guard
  // ...rest of update logic...
}
```

Alternatively, `updateStatus` could be made terminal-status-aware:

```typescript
private updateStatus(id: string, updates: Partial<SupervisorStatus>): void {
  const current = this.readStatus(id);
  if (!current) return;
  // Don't overwrite terminal states unless explicitly transitioning to one
  if ((current.status === 'done' || current.status === 'error') && !updates.status) return;
  this.writeStatusFile(id, { ...current, ...updates });
}
```

---

## Summary

| Aspect | Detail |
|--------|--------|
| **Bug type** | Race condition / state store inconsistency |
| **Root cause** | Late-firing `onEvent` callbacks overwrite `status.json` from `done` back to `running` after the job has completed |
| **Why intermittent** | Depends on event loop scheduling; only occurs when event callbacks are queued but not yet flushed at the time `runner.run()` returns |
| **feed shows done because** | `events.jsonl` gets `run_complete` written before any late event can append (events.jsonl is append-only and `run_complete` is written after `status.json`) |
| **result says running because** | `status.json` is read-modify-written by the late callback, which spreads `{status: 'running'}` over the already-written `{status: 'done'}` |
| **Key files** | `src/specialist/supervisor.ts` (lines 226-245, 265-272), `src/cli/result.ts` (line 27), `src/cli/feed.ts` (line 170-172) |
| **Fix location** | `supervisor.ts` `onEvent` callback — add guard to skip status update if terminal state already set |

---

## Delegation vs Direct Work Reflection

The skill correctly guided delegation as the right approach for this multi-file investigation. The delegation attempt failed due to:
1. Specialist timeout (300s) — the `bug-hunt` specialist did not start within the timeout window
2. The background job ran in Claude Code's subagent system, not the Supervisor job system, so `specialists result <id>` correctly could not find it in `.specialists/jobs/`

Since delegation failed, direct investigation was the fallback. The investigation required reading 8 source files and tracing the complete lifecycle across the `PiAgentSession` → `SpecialistRunner` → `Supervisor` → `feed/result CLI` stack.
