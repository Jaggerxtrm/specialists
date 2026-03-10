# Specialists System — Restructure Findings

> Status: In-progress thinking. Adversarial critique running via overthinker specialist.
> Updated: 2026-03-10

---

## 1. The Core Problem

The current execution layer is wrong in two ways:

1. **`PiAgentSession` manually reimplements what `RpcClient` already provides** — raw subprocess + manual NDJSON line buffering, custom `agent_end` detection, `proc.stdin.end()` hack. This is the source of the split-chunk bug (2.1.5 hotfix) and every future pi protocol change breaking the integration.

2. **MCP is request-response only** — there is no mechanism for the MCP server to push events to Claude. `poll_specialist` requires Claude to call repeatedly, generating tool call noise on every poll, burning context window, and producing a degraded UX.

---

## 2. What Pi Actually Provides

Source: `badlogic/pi-mono/packages/coding-agent` + direct spec analysis.

### RpcClient (subprocess wrapper)

```typescript
import { RpcClient } from '@mariozechner/pi/rpc';

const pi = new RpcClient({ provider: 'anthropic', cwd: sessionDir });
await pi.start();
await pi.prompt('Do the task');
await pi.waitForIdle();                           // blocks until agent_end
const { data } = await pi.send({ type: 'get_last_assistant_text' });
```

Key methods the current code reimplements manually:
- `onEvent(listener)` — subscribe to all pi events as they arrive
- `waitForIdle(timeout?)` — waits for `agent_end`, no polling
- `collectEvents(timeout?)` — gathers all events until completion
- `getLastAssistantText()` — clean output retrieval

### AgentSession SDK (in-process, no subprocess)

```typescript
import { createAgentSession } from '@mariozechner/pi-coding-agent';

const session = await createAgentSession({ provider: 'anthropic', cwd: '.' });
session.subscribe((event) => { /* native callbacks, no JSON parsing */ });
await session.prompt('Do the task');
```

`AgentSession` is the core that all pi modes (interactive, print, RPC) attach to. It can be used **directly as a library** — no subprocess, no NDJSON, no line buffering. Events are native TypeScript callbacks.

### Session Persistence

- Sessions stored as branching JSONL in `~/.pi/agent/sessions/`
- `get_state` RPC → returns `sessionFile` path
- Resume: `pi --session <path>` CLI flag, or `switch_session` RPC command
- Fork from any point: `{ type: 'fork', entryId }`
- Multi-turn: call `prompt()` multiple times on the same instance — full context retained

---

## 3. The Polling Problem

### Why it exists

MCP is request-response. Claude calls `poll_specialist` → MCP server responds → Claude calls again. There is no server-push. The pi process runs fine, but Claude has no way to receive events without asking.

### What we observed in testing

A 30-second specialist run produces 30+ `poll_specialist` tool calls in the conversation. Each call:
- Appears in Claude's tool history (context pressure)
- Costs tokens
- Shows in the Claude Code UI as noise

### wait_ms (long-polling) — does NOT solve async

Adding `wait_ms` to `poll_specialist` reduces call frequency but Claude **still blocks** during each poll. From Claude's perspective it's just `use_specialist` cut into N-second chunks. The specialist runs async; Claude does not.

### Why MCP cannot be fixed here

MCP notifications exist but cover meta-level events (capability changes), not arbitrary data push. Claude Code does not expose them to Claude as tool inputs. This is a protocol constraint, not an implementation gap.

---

## 4. How Overstory Solves It

Overstory bypasses MCP for execution entirely:
- `Bash(ov sling ...)` → spawns agent in a **tmux session** (returns immediately)
- SQLite mail system for inter-agent communication
- **`UserPromptSubmit` hook** injects pending results as a priority banner on next user message
- Watchdog daemon for health monitoring

Key insight: **hooks are a push channel MCP doesn't have**. The Claude Code hook system can inject context into Claude on any event, including `UserPromptSubmit`. This is the only mechanism available for the server to communicate to Claude without Claude asking first.

---

## 5. Architecture Options

### Option A: Daemon + JSONL files (proposed)

```
specialists daemon  ←  owns all RpcClient/AgentSession instances
    │ onEvent()         writes .specialists/jobs/<id>/events.jsonl
    ↓
MCP tools           ←  thin file readers (poll = instant buffer read)
    ↓
specialists feed    ←  tails JSONL, shows live event stream + beads status
```

**For**: Survives MCP restarts. Pi sessions persist. True background execution. `specialists feed` becomes natural output. Works with `RpcClient` or `AgentSession` SDK.

**Against** (to be validated by overthinker run): Daemon complexity. File-based IPC is fragile. What happens when daemon crashes? Two processes to manage instead of one. Does this actually solve Claude's polling UX or just the server-side lifecycle?

### Option B: AgentSession SDK in-process

Use `createAgentSession()` directly inside the MCP server — no subprocess at all. Events are native callbacks. No NDJSON parsing. Session persistence via `SessionManager`.

**For**: Simplest path. No daemon. No IPC. Events are TypeScript callbacks.
**Against**: Sessions die when MCP server restarts. No true background execution. Same polling problem for Claude.

### Option C: CLI background + hook notification (Overstory-inspired)

```bash
specialists run <name> --prompt "..." > .specialists/jobs/<id>/output.jsonl &
echo $!   # returns immediately
# Hook: UserPromptSubmit reads .specialists/ready/ and injects banner
# Claude calls poll_specialist ONCE to retrieve
```

**For**: True background. No daemon complexity. Reuses existing `specialists run` CLI. Only 1 retrieval call needed.
**Against**: Output only available on next user message (not mid-turn). Requires Claude to remember job_id between turns.

---

## 6. Multi-Turn Capability

Pi natively supports multi-turn — send multiple `prompt()` calls to the same session, full context retained. This is **not currently exposed** in the MCP API.

Missing MCP tool: `resume_specialist(job_id, followup_prompt)` — continues an existing session. Would enable:
```
start_specialist → job_id → (specialist runs) → poll (done)
resume_specialist(job_id, "Now critique your own output") → follows up in same session
```

Session file path must be saved at job creation (`get_state` after `start`).

---

## 7. What Needs to Happen

Regardless of which architecture wins, two things are clearly correct:

1. **Replace `PiAgentSession` with `RpcClient` or `AgentSession` SDK** — eliminates the manual reimplementation, fixes split-chunk class of bugs, gives access to the full pi feature surface (sessions, forking, compaction, model switching).

2. **Fix the polling UX** — whether via daemon+JSONL, hook notification, or long-polling, the current 30-call-per-run pattern is unacceptable.

The adversarial critique from the overthinker specialist (job `50bbf162`) will inform which architecture to actually pursue.

---

## 8. Open Questions

- Is `AgentSession` exported as a stable public API from `@mariozechner/pi-coding-agent`, or is it internal?
- Does the daemon need to be a separate process, or can it be a long-lived singleton inside the MCP server with session recovery on restart?
- Can `UserPromptSubmit` hook reliably surface notifications even when Claude is mid-task (not waiting for user input)?
- Is `specialists run` CLI sufficient for all interactive use cases, making the async MCP path only needed for true background/parallel jobs?
