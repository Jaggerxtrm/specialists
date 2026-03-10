# Specialists System — Restructure Findings

> Status: Decision reached. See Section 7 for the chosen path.
> Updated: 2026-03-10
> Adversarial critique: overthinker specialist, job `50bbf162`, Sonnet 4.6, 169s

---

## 1. The Core Problem

The current execution layer has two issues:

1. **`PiAgentSession` manually reimplements what pi already provides** — raw subprocess + manual NDJSON line buffering, custom `agent_end` detection, `proc.stdin.end()` hack. Source of the split-chunk bug (2.1.5 hotfix) and fragility against any pi protocol change.

2. **MCP is request-response only** — no server-push. `poll_specialist` requires Claude to call repeatedly, generating tool call noise, burning context window, cluttering the UI.

---

## 2. What Pi Actually Provides

Source: `badlogic/pi-mono/packages/coding-agent` wiki + direct spec analysis.

### RpcClient (subprocess wrapper)

```typescript
import { RpcClient } from '@mariozechner/pi/rpc';

const pi = new RpcClient({ provider: 'anthropic', cwd: sessionDir });
await pi.start();
await pi.prompt('Do the task');
await pi.waitForIdle();
const { data } = await pi.send({ type: 'get_last_assistant_text' });
```

Methods the current code reimplements manually:
- `onEvent(listener)` — subscribe to all pi events as they arrive
- `waitForIdle(timeout?)` — waits for `agent_end`, no manual polling
- `collectEvents(timeout?)` — gathers all events until completion
- `getLastAssistantText()` — clean output retrieval

### AgentSession SDK (in-process, no subprocess)

```typescript
import { createAgentSession } from '@mariozechner/pi-coding-agent';

const session = await createAgentSession({ provider: 'anthropic', cwd: '.' });
session.subscribe((event) => { /* native TypeScript callbacks */ });
await session.prompt('Do the task');
```

`AgentSession` is the core that all pi modes (interactive, print, RPC) attach to. **Verification required**: whether this is a stable public export or internal only — this determines whether `PiAgentSession` can be replaced cleanly or just improved.

### Session Persistence

- Sessions stored as branching JSONL in `~/.pi/agent/sessions/`
- `get_state` RPC → returns `sessionFile` path
- Resume: `pi --session <path>` CLI flag, or `switch_session` RPC command
- Multi-turn: call `prompt()` multiple times on same instance — full context retained

---

## 3. The Polling Problem

### Why it exists

MCP is request-response. No server-push mechanism. Claude calls `poll_specialist` → MCP server responds → Claude calls again. A 30-second specialist produces 30+ tool calls, each appearing in the conversation history.

### wait_ms (long-polling) — does NOT solve async

Reduces frequency but Claude still blocks during each poll. From Claude's perspective it's `use_specialist` cut into N-second chunks. Specialist runs async; Claude does not.

### MCP cannot be fixed at the protocol level

MCP notifications exist but cover meta-level events only. This is a constraint, not an implementation gap.

---

## 4. How Overstory Solves It (Reference)

Overstory bypasses MCP for execution:
- `Bash(ov sling ...)` → spawns agent in tmux (returns immediately)
- SQLite mail for inter-agent communication
- `UserPromptSubmit` hook injects completion notifications
- Watchdog daemon for health monitoring

Key insight: hooks are a push channel MCP doesn't have. But the architecture requires tmux, a watchdog daemon, and a SQLite mail system — significant infrastructure.

---

## 5. Architecture Options Evaluated

### Option A: Daemon + JSONL files ❌ REJECTED

```
specialists daemon → owns RpcClient instances → writes events.jsonl
MCP tools → thin file readers
specialists feed → tails JSONL
```

**Rejected because** (from adversarial critique):
- Two processes = two failure modes + one interaction failure mode
- File-based IPC (`queue.jsonl`) is non-atomic, misses events, reinvents a message queue badly. Unix socket is the right tool; function calls are better still.
- `poll_specialist` as file reader is strictly worse than memory reads (O(1) → O(n) per poll)
- Daemon startup question unsolved: child of MCP = dies with MCP (no gain); system service = breaks the "just add to .mcp.json" UX
- Event file accumulation with no GC is silent technical debt
- Complexity budget: 3–5x more code for problems that are partially invented

### Option B: AgentSession SDK in-process + file-backed registry ✅ CHOSEN

See Section 7.

### Option C: CLI background + hook notification (Overstory-inspired) — Deferred

```bash
specialists run <name> --prompt "..." > .specialists/jobs/<id>/output.jsonl &
# UserPromptSubmit hook reads .specialists/ready/, injects banner
# Claude calls poll_specialist ONCE to retrieve
```

Valid for true fire-and-forget background jobs. Deferred — not a prerequisite for the core rewrite.

---

## 6. Adversarial Critique — Overthinker Output

> Full run: job `50bbf162`, Sonnet 4.6, 169 seconds, ~12% context used.

### Key findings from Phase 2 (Devil's Advocate)

**Against the daemon:**
1. Two processes, two failure modes, one interaction failure mode — reconnection protocol unspecified
2. File-based IPC non-atomic, inotify unreliable, no delivery guarantee
3. Writing 15,000+ events/run to disk: thousands of syscalls vs current zero I/O
4. `poll_specialist` as file reader: `open + lseek + read + close + JSONL parse` vs `hashmap lookup + string.slice`
5. Claude Code IS the scheduler — polling is how it works for long-running operations
6. Pi SDK may be internal, not exported — assumption may be a mirage
7. No GC for job files — silent technical debt

### Phase 4 verdict (verbatim)

> **Do not build the daemon.** It solves real problems with a solution whose complexity budget far exceeds the problems' severity.
>
> **One-line verdict:** The daemon is a distributed system solution to a persistence problem. Persistence is solved by writing files. Write files from where you already are.

---

## 7. Decision — The Chosen Path

### File-backed in-memory registry (Priority 1 — low risk, high value)

`JobRegistry` stays in memory. Add file writes as a non-blocking side-effect:

```
On job start:    open .specialists/jobs/<id>/events.jsonl for append
On every event:  fs.appendFile(eventsPath, JSON.stringify(event) + '\n')  ← async, non-blocking
On completion:   write .specialists/jobs/<id>/result.json
On MCP startup:  scan job files → recover done jobs → mark in-progress as crashed
poll_specialist: memory (fast path) → result.json fallback for post-restart reads
```

**What this gives for free:**
- ✅ `specialists feed` CLI: formatted `tail -f .specialists/jobs/*/events.jsonl`
- ✅ Audit trail and debugging
- ✅ Completed job recovery across MCP restarts
- ✅ O(1) polling preserved (in-memory primary, file is secondary)
- ✅ Zero daemon, zero IPC, zero lifecycle complexity
- ✅ GC: TTL-based cleanup on MCP startup (e.g. delete job files >7 days)

### Replace PiAgentSession with RpcClient/SDK (Priority 2 — verify first)

**Before touching code:** confirm whether `RpcClient` or `AgentSession` is a stable public export from `@mariozechner/pi-coding-agent`.

- If **exported**: clean swap — same subprocess behavior, native event callbacks, `waitForIdle()` replaces manual detection, `getLastAssistantText()` replaces output accumulation. Eliminates the split-chunk class of bugs.
- If **internal only**: keep the subprocess, clean up the NDJSON parsing with a proper line buffer utility. Still worthwhile.

### `specialists feed` CLI (Priority 3 — falls out from Priority 1)

Once events.jsonl exists per job:
```bash
specialists feed           # all active jobs, formatted event stream
specialists feed --job <id>  # single job
specialists feed --follow    # live tail
```

Shows per job: specialist name, beadId, model, tool calls (type only), duration, status.

### Polling UX (Priority 4 — defer)

The adversarial critique is right: Claude polling IS the pattern for long-running MCP operations. The UX problem is real but not blocking. Hook notification (Option C) remains available as a follow-up once the core rewrite is stable.

---

## 8. What Does NOT Change

- The 8 MCP tool signatures — identical to consumers
- `SpecialistRunner` orchestration logic
- `CircuitBreaker`
- Beads lifecycle integration
- The `.specialist.yaml` schema

---

## 9. Open Questions (Remaining)

- Is `RpcClient`/`AgentSession` a stable public export? → Verify against `@mariozechner/pi-coding-agent` package.json `exports` field
- What event granularity to write to events.jsonl? All events (including thinking deltas) or only lifecycle events? Thinking deltas at 50/sec = significant I/O. Likely: lifecycle + tool events only, full text on completion.
- `specialists feed` output format — match `specialists status` style or a new live-updating TUI?
- Multi-turn (`resume_specialist` tool) — separate milestone once session file path is saved at job creation
