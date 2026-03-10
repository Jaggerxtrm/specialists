# Specialists v3 — Implementation Specification

> **Status**: Final spec. Ready for implementation.
> **Date**: 2026-03-11
> **Context**: This spec supersedes the file-backed registry + RpcClient plan from restructure.md.
> **Core decision**: CLI is the execution plane. MCP is the control plane. Bash background jobs replace MCP async polling.

---

## 1. Architecture Overview

### Current (v2)

```
Claude ──MCP──▶ start_specialist ──▶ PiAgentSession (subprocess)
Claude ──MCP──▶ poll_specialist  ──▶ JobRegistry (in-memory) ──▶ delta + status
Claude ──MCP──▶ poll_specialist  ──▶ ...repeat N times...
Claude ──MCP──▶ poll_specialist  ──▶ status: done, full output
```

Problem: N poll calls per run. Each is a visible tool use. Thinking tokens, tool markers,
and text deltas streamed into context window on every poll. 60-second specialist = 30+ tool
calls, tens of thousands of wasted context tokens.

### Target (v3)

```
Claude ──Bash──▶ specialists run overthinker --prompt "..." --background
                   └▶ spawns pi --mode rpc (supervisor stays alive)
                   └▶ writes status.json on lifecycle events
                   └▶ writes events.jsonl (lifecycle + tool events only)
                   └▶ on agent_end: queries get_last_assistant_text → result.txt
                   └▶ queries get_state → session path → session.txt
                   └▶ closes stdin → pi exits → supervisor exits

Claude ──Bash──▶ specialists status                    (one-liner per job, ~30 tokens)
Claude ──Bash──▶ specialists result <id>               (full output, once, when done)
Claude ──Bash──▶ specialists run X --continue <id> --prompt "..."   (multi-turn)
```

Hook notification (optional): UserPromptSubmit hook checks .specialists/jobs/*/status.json
for newly completed jobs, injects one-line banner on next user prompt.

### MCP Role (reduced)

MCP server retains: specialist_init, list_specialists, specialist_status (circuit breaker
health), use_specialist (quick synchronous tasks). The async job tools (start_specialist,
poll_specialist, stop_specialist, run_parallel) are deprecated — their functionality moves
to CLI commands.

---

## 2. File Layout

```
.specialists/                          # project root, parallel to .beads/
  jobs/
    <job-id>/
      status.json                      # overwritten on every lifecycle event
      events.jsonl                     # append-only lifecycle + tool events
      result.txt                       # written once on agent_end (clean assistant text)
      session.jsonl                    # pi writes here directly (--session flag)
  ready/                               # completion markers for hook notification
    <job-id>                           # empty file, existence = "done"
```

### status.json (overwritten per lifecycle event)

```json
{
  "id": "a1b2c3",
  "specialist": "overthinker",
  "status": "running",
  "current_event": "tool_execution",
  "current_tool": "bash(grep -r 'pattern' src/)",
  "model": "anthropic/claude-sonnet-4-6",
  "backend": "anthropic",
  "pid": 48210,
  "started_at_ms": 1710000000000,
  "elapsed_s": 47,
  "last_event_at_ms": 1710000047000,
  "bead_id": "bead-xyz",
  "session_file": ".specialists/jobs/a1b2c3/session.jsonl",
  "error": null
}
```

On completion, status changes to "done" and elapsed_s is final.
On error, status is "error" and error field contains the message.
On cancel, status is "cancelled".
On stall detection, status remains "running" but a "stalled": true field is added.

### events.jsonl (append-only, lifecycle + tool events)

```jsonl
{"ts":1710000000,"event":"starting","specialist":"overthinker","model":"anthropic/claude-sonnet-4-6","id":"a1b2c3"}
{"ts":1710000003,"event":"thinking"}
{"ts":1710000008,"event":"toolcall","tool":"read","args":"src/index.ts"}
{"ts":1710000009,"event":"tool_execution","tool":"read"}
{"ts":1710000009,"event":"tool_execution_end","tool":"read","duration_ms":340}
{"ts":1710000015,"event":"toolcall","tool":"bash","args":"grep -r 'pattern' src/"}
{"ts":1710000016,"event":"tool_execution","tool":"bash"}
{"ts":1710000022,"event":"tool_execution_end","tool":"bash","duration_ms":6100}
{"ts":1710000030,"event":"text"}
{"ts":1710000047,"event":"done","duration_ms":47000,"session_file":".specialists/jobs/a1b2c3/session.jsonl"}
```

NOT captured in events.jsonl: thinking_delta content, text_delta content, message_start,
thinking_end. These are high-frequency events that add noise without diagnostic value.

### result.txt

Plain text. The clean final assistant output extracted from pi's get_last_assistant_text
RPC call. Written once on agent_end. This is what `specialists result <id>` prints.

### session.jsonl

Pi's native session file. Written by pi directly via `--session <path>`. Contains the full
message history (user, assistant, tool calls, tool results) in pi's internal JSONL format.
Used for `--continue` multi-turn resumption. We never read or parse this file — pi owns it.

---

## 3. CLI Commands

### 3.1 specialists run <name> (MODIFIED — add --background)

```
specialists run <name> --prompt "..." [--background] [--model <model>] [--no-beads]
                       [--continue <job-id>] [--timeout <ms>]
```

**Foreground (default, existing behavior)**: Streams pi output to stdout in real time.
Blocks until completion. Exit code reflects success/failure.

**Background (--background, new)**: Spawns pi subprocess, prints job ID to stdout, writes
status/events/result files. The `specialists run` process stays alive as a supervisor
(not a daemon) — Claude backgrounds it with `&` in bash.

**Continue (--continue <job-id>)**: Reads session file path from
`.specialists/jobs/<job-id>/session.txt` or from status.json. Spawns pi with
`--session <path>`. Full context from previous run is available.

Supervisor lifecycle (--background mode):
1. Generate job ID (nanoid or uuid short)
2. Create .specialists/jobs/<id>/ directory
3. Write initial status.json (status: "starting")
4. Run pre-scripts (existing mechanism, unchanged)
5. Spawn pi subprocess with --mode rpc, --session .specialists/jobs/<id>/session.jsonl
6. Print job ID to stdout: "Job started: <id>"
7. Read NDJSON from pi stdout:
   - On lifecycle/tool events → update status.json, append to events.jsonl
   - On thinking_start/text_delta → update current_event in status.json only (no content)
   - Track last_event_at_ms for stall detection
8. On agent_end:
   a. Send {"type": "get_last_assistant_text"} via stdin → read response → write result.txt
   b. Update status.json to "done"
   c. Write done event to events.jsonl
   d. Touch .specialists/ready/<id> (for hook notification)
   e. Close stdin → pi exits
9. Run post-scripts (existing mechanism, unchanged)
10. Close beads issue (if created)
11. Supervisor process exits

Stall detection (in-process, not a daemon):
- Configurable per-specialist via stall_timeout_ms in YAML (default: null = disabled)
- If last_event_at_ms is older than stall_timeout_ms, write "stalled": true to status.json
- Do NOT auto-kill — surface the stall in status, let Claude or the user decide

Error handling:
- Pi process exits non-zero without agent_end → write status "error", close bead as ERROR
- Pi process killed by OOM/signal → same as above, capture exit code in error field
- Pre-script failure → write to status.json, still start pi (pre-script output is context, not a gate)
- Post-script failure → swallow silently (existing behavior, unchanged)

### 3.2 specialists status (MODIFIED — add job status)

```
specialists status [--job <id>] [--json]
```

Without --job: existing system health output (specialist count, pi version, beads status,
MCP registration) PLUS a job summary table:

```
── Active Jobs ───────────────────────────────────────────────────────────
  a1b2c3  overthinker   running  1m12s  tool: bash(grep -r ...)
  d4e5f6  bug-hunt      running  0m34s  thinking
  g7h8i9  init-session  done     0m08s  ✓
```

With --job <id>: detailed single-job view:

```
  overthinker | running | 1m12s | model: anthropic/claude-sonnet-4-6
  Current: tool_execution bash(grep -r 'pattern' src/)
  Bead: bead-xyz
  Session: .specialists/jobs/a1b2c3/session.jsonl
  Events: 14 (5 tool calls)
```

Implementation: reads .specialists/jobs/*/status.json. Pure file reads, no MCP, no
subprocess interaction.

### 3.3 specialists result <id> (NEW)

```
specialists result <id> [--raw]
```

Prints result.txt to stdout. If the job is still running, prints current status and exits
with code 1. --raw skips any formatting/headers and prints only the raw result text.

### 3.4 specialists feed (NEW)

```
specialists feed [--job <id>] [--follow]
```

Formatted tail of events.jsonl files. Without --job, shows all active jobs interleaved
with job ID prefix. --follow keeps tailing (like tail -f).

Output format:
```
[a1b2c3] overthinker  00:12  toolcall    bash(grep -r 'pattern' src/)
[a1b2c3] overthinker  00:18  tool_end    bash  6.1s
[d4e5f6] bug-hunt     00:34  thinking
[a1b2c3] overthinker  00:22  text
[a1b2c3] overthinker  00:47  done        47.0s
```

### 3.5 specialists stop <id> (NEW — CLI equivalent of MCP stop_specialist)

```
specialists stop <id>
```

Reads status.json for the PID, sends SIGTERM. If the supervisor process is still alive,
it detects the child exit, writes "cancelled" status, closes bead. If the supervisor
is gone (orphaned pi process), sends SIGTERM directly to the PID.

### 3.6 specialists run (EXISTING — foreground, unchanged)

Existing behavior preserved. No --background flag = streams to stdout, blocks until done.
Used by humans directly and by Claude for quick synchronous tasks where background
overhead is not worth it.

---

## 4. Pi Subprocess Protocol

### 4.1 Spawn Arguments

```
pi --mode rpc \
   --provider <provider> \
   --model <model> \
   --append-system-prompt <system_prompt> \
   --tools <tool_list>                          # always set — see below
   --skill <path>                               # repeated for each skills.paths entry
   --session .specialists/jobs/<id>/session.jsonl \
   --no-extensions                              # prevent user extensions from emitting UI requests
   <any additional args from specialist config>
```

**--append-system-prompt**: The specialist's prompt.system field. Takes priority over
AGENTS.md. This IS the specialist's identity — its behavioral constraints, output format
requirements, and role definition. Not template-rendered (no variable substitution).

**--no-extensions**: Always set in background mode. User-installed pi extensions can emit
`extension_ui_request` events (dialogs, confirmations) on stdout and block waiting for a
response from stdin. The supervisor never sends these responses — causing a silent hang.
`--no-extensions` disables extension discovery entirely. (`--no-input` does not exist in pi.)

**--tools**: Always set explicitly. Pi's default when no `--tools` flag is passed is
`read,bash,edit,write` — which silently excludes `grep`, `find`, and `ls`. Per-tier mapping:

| Permission | --tools value |
|------------|---------------|
| READ_ONLY  | `read,bash,grep,find,ls` |
| BASH_ONLY  | `bash` |
| LOW        | `read,bash,edit,write,grep,find,ls` |
| MEDIUM     | `read,bash,edit,write,grep,find,ls` |
| HIGH       | `read,bash,edit,write,grep,find,ls` |

`mapPermissionToTools()` in `src/pi/session.ts` must be updated to match this table.

**--skill**: One flag per entry in the specialist's skills.paths array. Paths resolved:
- Absolute paths: passed as-is
- ~/... paths: expanded to home directory
- Relative paths: resolved from project root (cwd)
- Missing paths: logged as warning in events.jsonl, not fatal

**--session**: Always set in --background mode. Points to
.specialists/jobs/<id>/session.jsonl. Pi creates and writes this file. We never read it
directly — it's pi's internal format. We store the path for --continue.

### 4.2 Stdin RPC Commands

The supervisor sends three types of commands via stdin, all as JSON + newline:

**Prompt** (on start):
```json
{"type": "prompt", "message": "<rendered task template>"}
```

> **Important**: Pi's RPC mode responds to `prompt` immediately with
> `{"type":"response","command":"prompt","success":true}` — this is an ack that the command
> was received, NOT a completion signal. The agent starts working asynchronously after this
> ack. The supervisor must NOT treat the prompt response as completion — it must continue
> reading stdout events until `agent_end` arrives.

**Get state** (after agent_end, before close):
```json
{"type": "get_state"}
```
Response includes sessionFile, sessionId, isStreaming, model. We extract sessionFile
to confirm the session path (should match what we passed via --session).

**Get last assistant text** (after agent_end, before close):
```json
{"type": "get_last_assistant_text"}
```
Response: `{"type":"response","command":"get_last_assistant_text","success":true,"data":{"text":"..."|null}}`

`data.text` is `null` if no assistant message exists (e.g. pi crashed before responding).
The supervisor must null-check before writing result.txt — write an empty file or skip
writing entirely if `text` is null.

**Close**: stdin.end() — sends EOF, pi exits. Only called after the above two queries
complete. This replaces the current stdin.end() hack that fires immediately after prompt.

### 4.3 Stdout NDJSON Event Processing

Events read from pi's stdout, one JSON object per line. The supervisor categorizes:

**Status-updating events** (update status.json current_event + current_tool):
- thinking_start, thinking_delta → current_event: "thinking"
- toolcall_start → current_event: "toolcall", current_tool: tool name + args
- tool_execution_start, tool_execution_update → current_event: "tool_execution"
- tool_execution_end → current_event: "tool_execution_end"
- message_update with text_delta → current_event: "text"
- agent_end → triggers finalization sequence (4.2 above)

**JSONL-logged events** (append to events.jsonl):
- thinking_start (not deltas — just the transition)
- toolcall_start (with tool name and args summary)
- tool_execution_end (with tool name and duration)
- text (first text_delta only — marks transition to output)
- agent_end (with duration)

**Dropped events** (not written anywhere):
- thinking_delta (high frequency, content not needed)
- thinking_end (redundant — next event implies it)
- text_delta content (high frequency, full text available via get_last_assistant_text)
- message_start (metadata only, captured elsewhere)

### 4.4 No stdin.end() on prompt

This is the key protocol change from current PiAgentSession. Currently, prompt() calls
stdin.end() immediately to trigger EOF, which makes every session single-turn. In v3:

1. prompt() sends the JSON command via stdin.write(), does NOT close stdin
2. Supervisor reads NDJSON events from stdout until agent_end
3. Supervisor sends get_state and get_last_assistant_text queries via stdin
4. Supervisor calls stdin.end() only after receiving both responses
5. Pi sees EOF, exits cleanly

This enables multi-turn (--continue) because the session file is complete and valid.
Pi wrote the full conversation to the session JSONL during execution.

---

## 5. Schema Changes (.specialist.yaml)

### 5.1 New field: skills.paths

```yaml
skills:
  paths:                                    # NEW — pi --skill injection
    - ~/.agents/skills/docker-patterns/     # user-scope skill directory
    - ./skills/mercury-infra/               # project-scope skill directory
  scripts:                                  # EXISTING — unchanged
    - path: ./scripts/check-env.sh
      phase: pre
      inject_output: true
```

skills.paths is an optional array of strings. Each entry becomes a --skill <path> flag
on the pi command line. Pi loads these as on-demand context (README files, tool
definitions, etc.) that the model can reference without bloating the initial prompt.

Path resolution:
- ~/... → os.homedir() + rest
- ./... → path.resolve(cwd, rest)
- /... → absolute, as-is

Validation: paths are validated at specialist load time (loader.ts). Missing paths
produce a warning log, not a load failure. This allows user-scope skills that may not
exist on every machine.

### 5.2 New field: execution.stall_timeout_ms

```yaml
execution:
  stall_timeout_ms: 30000                   # NEW — optional, default: null (disabled)
```

If set, the supervisor checks last_event_at_ms on a 5-second interval. If no event
received for stall_timeout_ms, writes "stalled": true to status.json. Does NOT auto-kill.
Surfaces in `specialists status` output.

### 5.3 Existing fields — no changes

All existing schema fields remain unchanged:
- metadata (name, version, description, category, tags, updated)
- execution (mode, model, fallback_model, timeout_ms, response_format, permission_required)
- prompt (system, task_template, skill_inherit)
- skills.scripts (path, phase, inject_output)
- communication (publishes)
- beads_integration (auto, always, never)

---

## 6. Hook Notification

### 6.1 Completion hook (NEW — UserPromptSubmit)

File: ~/.claude/hooks/specialists-complete.mjs (installed by `specialists install`)

Trigger: UserPromptSubmit — fires on every user message in Claude Code.

Logic:
1. Scan .specialists/ready/ for any files
2. For each file found:
   a. Read .specialists/jobs/<id>/status.json
   b. Format one-line banner
   c. Delete the ready marker file (prevents repeat notifications)
3. Inject banner(s) into the prompt

Banner format:
```
[Specialist 'overthinker' completed (job a1b2c3, 1m47s). Run: specialists result a1b2c3]
```

Multiple completions produce multiple banners, one per line.

If no ready markers exist, hook exits silently (no injection, no overhead).

### 6.2 Existing hooks — unchanged

The four existing hooks (main-guard, beads-edit-gate, beads-commit-gate, beads-stop-gate)
are unchanged. The new hook is additive.

---

## 7. PiAgentSession Changes

### 7.1 Current interface (SessionFactory — 6 methods)

```typescript
start(): Promise<void>           // spawn subprocess
prompt(task: string): Promise<void>  // send task, currently closes stdin
waitForDone(): Promise<void>     // resolve on agent_end
getLastOutput(): Promise<string> // return final text
kill(): void                     // SIGTERM + cleanup
meta: { backend, model, sessionId, startedAt }
```

### 7.2 Modified interface

```typescript
start(): Promise<void>           // spawn subprocess (unchanged)
prompt(task: string): Promise<void>  // send RPC prompt command, DO NOT close stdin
waitForDone(timeout?: number): Promise<void>  // resolve on agent_end, with timeout
getLastOutput(): Promise<string> // send get_last_assistant_text RPC, return response
getState(): Promise<SessionState>  // send get_state RPC, return session info
close(): Promise<void>           // send EOF (stdin.end()), wait for process exit
kill(): void                     // SIGTERM + cleanup (unchanged, for abort/cancel)
meta: { backend, model, sessionId, startedAt }
```

Changes:
1. prompt() sends {"type": "prompt", "message": task} via stdin.write(), no stdin.end()
2. waitForDone() adds optional timeout parameter — Promise.race with timeout
3. getLastOutput() sends {"type": "get_last_assistant_text"} via stdin, parses response
4. getState() NEW — sends {"type": "get_state"} via stdin, parses response
5. close() NEW — calls stdin.end(), waits for process exit event
6. kill() unchanged — SIGTERM, idempotent

The supervisor sequence becomes:
```
await session.start()
await session.prompt(renderedTask)
await session.waitForDone(timeoutMs)    // blocks until agent_end or timeout
const output = await session.getLastOutput()  // RPC query
const state = await session.getState()        // RPC query
await session.close()                         // EOF → clean exit
```

### 7.3 NDJSON handling — unchanged

The manual line buffer (_lineBuffer + split on \n + process complete lines) is correct
and handles large payloads (100KB+ agent_end events). No change needed. The only
difference: agent_end no longer triggers stdin.end(). It resolves the waitForDone()
promise, and the supervisor decides when to query state and close.

### 7.4 RPC response handling — new

Currently, PiAgentSession only reads events from stdout. It never sends commands via
stdin (except the implicit single prompt via the CLI args). With the new protocol:

After agent_end, stdin is still open. The supervisor sends JSON commands and reads
responses from stdout. Responses are JSON objects with type: "response", keyed by the
command type. The existing NDJSON line reader handles these — they arrive as regular
JSON lines on stdout.

Parsing:
```typescript
// After agent_end, switch to command-response mode
async sendCommand(cmd: object): Promise<any> {
  const line = JSON.stringify(cmd) + '\n';
  this.proc.stdin.write(line);
  // Wait for next complete JSON line on stdout that is a response
  return new Promise((resolve) => {
    this._pendingCommand = resolve;
  });
}
```

The _handleLine method checks: if the parsed JSON has type === "response", resolve
_pendingCommand. Otherwise, process as a normal event.

---

## 8. SpecialistRunner Changes

### 8.1 Background mode support

SpecialistRunner.run() currently blocks until completion. For --background, the CLI's
run command handles the lifecycle — it calls runner.run() with callbacks that write to
files instead of streaming to stdout.

The runner itself does NOT need a "background mode". The CLI command is the supervisor.
Runner provides the execution; the CLI provides the lifecycle management.

### 8.2 Session path passthrough

Runner must accept an optional sessionPath in PiSessionOptions and pass it through to
PiAgentSession.start() as the --session flag. For --continue, the CLI reads the session
path from the previous job's status.json and passes it to the runner.

### 8.3 Skills paths passthrough

Runner must accept an optional skillPaths: string[] in PiSessionOptions and pass each
as a --skill flag. Skills paths come from the specialist's YAML config (skills.paths),
resolved by the loader at discovery time.

### 8.4 Timeout enforcement

Runner should pass execution.timeout_ms to session.waitForDone(timeout). On timeout,
call session.kill() and throw a TimeoutError. Circuit breaker records the failure.

---

## 9. MCP Server Changes

### 9.1 Retained tools

**specialist_init**: Unchanged. Returns available specialists and beads status.

**list_specialists**: Unchanged. Pure read.

**specialist_status**: Modified — add job summary from .specialists/jobs/*/status.json.
Returns circuit breaker health + active/recent job list.

**use_specialist**: Unchanged. Synchronous execution for quick tasks. Calls runner.run()
directly. Appropriate for sub-15-second specialists (init-session, report-generator).

### 9.2 Deprecated tools

**start_specialist**: Deprecated. Replaced by `specialists run --background` via bash.
Keep functional for backward compatibility but add a note in the tool description
suggesting the CLI alternative.

**poll_specialist**: Deprecated. Replaced by `specialists status` and
`specialists result` via bash.

**stop_specialist**: Deprecated. Replaced by `specialists stop` via bash.

**run_parallel**: Deprecated. Claude can run multiple `specialists run --background &`
commands. Or use the synchronous path for quick parallel tasks via use_specialist.

### 9.3 SIGTERM handler (NEW)

```typescript
process.on('SIGTERM', () => {
  // Kill all running pi subprocesses managed by use_specialist (sync path)
  registry.getAllRunning().forEach(job => job.killFn?.());
  process.exit(0);
});
```

Only covers the MCP server's own subprocess (use_specialist sync path). Background
jobs are owned by their supervisor processes, not the MCP server.

---

## 10. Operational Concerns

### 10.1 .gitignore

`specialists init` must add `.specialists/` to .gitignore. Job files can contain full
specialist output, session history, and environment variables from pre-scripts.

### 10.2 Cleanup / GC

On `specialists run --background` start, before creating the new job directory:
scan .specialists/jobs/ and delete any directory older than 7 days. Configurable
via SPECIALISTS_JOB_TTL_DAYS env var. Simple fs.stat + rm -rf.

### 10.3 Beads crash recovery

On `specialists run --background` start (same GC scan): check for jobs with
status "running" that have no live process (PID check). Close their beads as ERROR.
Mark status as "error" with error: "MCP server or supervisor crashed".

### 10.4 File atomicity

status.json: written via write-to-temp + fs.rename. Updated frequently (every lifecycle
event), must never be half-written.

events.jsonl: written via fs.appendFile with O_APPEND. Atomic for writes < 4KB on Linux.
Event lines are well under 4KB.

result.txt: written once via write-to-temp + fs.rename. Single write on completion.

### 10.5 File descriptor management

The supervisor opens events.jsonl for append at job start and keeps the fd open for the
duration. On completion, error, or cancel: fd.close() is called in a finally block.
On supervisor crash: OS closes the fd automatically.

---

## 11. Migration Path

### Phase 1: File layout + background mode (HIGH VALUE, LOW RISK)

1. Create .specialists/ directory structure
2. Add --background flag to `specialists run`
3. Implement supervisor lifecycle (status.json, events.jsonl, result.txt)
4. Add `specialists status` job listing (reads status.json files)
5. Add `specialists result` command
6. Add `specialists feed` command
7. Add `specialists stop` command (CLI)
8. Add .gitignore entry in `specialists init`
9. Add GC on startup

Does NOT touch: PiAgentSession internals, MCP tools, SpecialistRunner.
Uses existing PiAgentSession with its current limitations (single-turn only, no RPC
queries post-completion). result.txt is populated from the existing getLastOutput()
which reads from the in-memory _lastOutput captured at agent_end.

This phase delivers: background execution, lightweight status polling via bash,
full output retrieval, feed/debugging CLI. Everything except multi-turn and RPC queries.

### Phase 2: PiAgentSession protocol upgrade (MEDIUM VALUE, MEDIUM RISK)

1. Remove stdin.end() from prompt() — send RPC JSON command instead
2. Add waitForDone(timeout) with Promise.race
3. Add getState() RPC command
4. Add getLastOutput() via RPC (replaces in-memory capture)
5. Add close() method (explicit EOF)
6. Add --session flag passthrough
7. Add --skill flag passthrough
8. Add stall detection (in-process setInterval in supervisor)
9. Update SpecialistRunner for sessionPath and skillPaths options

Prerequisite: verify that pi --mode rpc accepts JSON commands on stdin (not just
CLI args). The audit's PiAgentSession code and pi's RPC docs both indicate this works,
but test before implementing.

This phase delivers: multi-turn via --continue, session persistence, skill injection,
timeout enforcement, stall detection.

### Phase 3: Hook notification + MCP deprecation (LOW VALUE, LOW RISK)

1. Create specialists-complete.mjs hook
2. Add to `specialists install` hook deployment
3. Add deprecation notes to start_specialist, poll_specialist, stop_specialist,
   run_parallel tool descriptions
4. Add SIGTERM handler to MCP server

### Phase 4: Schema + built-in specialist updates

1. Add skills.paths to schema (zod validation, loader resolution)
2. Add execution.stall_timeout_ms to schema
3. Update built-in specialists to use skills.paths where appropriate
4. Create example skill directories in ~/.agents/skills/

---

## 12. Testing Strategy

### Phase 1 tests

- Supervisor lifecycle: mock PiAgentSession, verify status.json written at each stage
- status.json atomicity: concurrent write + read, verify no partial JSON
- events.jsonl: verify correct events logged, no thinking deltas
- result.txt: verify written only on completion, not on error/cancel
- GC: create old job dirs, verify cleanup
- specialists status: verify reads from file, formats correctly
- specialists result: verify returns result.txt content, error if still running
- specialists stop: verify SIGTERM sent to correct PID

### Phase 2 tests

- RPC prompt command: verify JSON sent via stdin, stdin NOT closed
- RPC get_state: verify command sent after agent_end, response parsed
- RPC get_last_assistant_text: verify command sent, response parsed
- close(): verify stdin.end() called, process exit awaited
- waitForDone(timeout): verify timeout triggers kill + rejection
- Stall detection: verify stalled flag set after configurable interval
- --session flag: verify passed to pi subprocess args
- --skill flag: verify each skills.paths entry becomes a --skill arg
- --continue: verify session path read from previous job, passed to pi

### Phase 1 does NOT require

- Integration tests against real pi subprocess (existing mock-based tests cover this)
- MCP tool handler tests (tools are unchanged in Phase 1)
- NDJSON parser tests (parser is unchanged in Phase 1)

---

## 13. Verification Checklist

All items verified against pi-mono source (packages/coding-agent) and pi --help output.

- [x] `pi --mode rpc` accepts {"type": "prompt", "message": "..."} on stdin
      — confirmed: rpc-mode.ts handleCommand case "prompt"
- [x] `pi --session /arbitrary/path/session.jsonl` accepts paths outside ~/.pi/
      — confirmed: main.ts resolveSessionPath() treats any arg containing "/" as a direct path
- [x] `pi --append-system-prompt "..."` exists and works as expected
      — confirmed: pi --help
- [x] `pi --skill <path>` loads skill directories correctly, repeatable
      — confirmed: pi --help
- [x] After agent_end, pi accepts further stdin commands before stdin is closed
      — confirmed: runRpcMode() never exits on agent_end; loop runs until stdin EOF
- [x] `get_state` response includes sessionFile field
      — confirmed: rpc-mode.ts get_state handler: sessionFile: session.sessionFile
- [x] `get_last_assistant_text` returns clean text
      — confirmed: agent-session.ts getLastAssistantText(); returns null (not empty string)
      when no assistant message exists — null-guard required before writing result.txt

**Additional findings from pi-mono source audit:**

- `--no-input` does not exist in pi — removed from spawn args (section 4.1)
- `prompt` RPC command responds with an immediate ack, not a completion signal — supervisor
  must keep reading stdout until agent_end (see section 4.2 note)
- `--no-extensions` required to prevent user extensions from hanging the supervisor
  via unanswered extension_ui_request events (see section 4.1)
- Pi's `--tools` default (`read,bash,edit,write`) excludes grep/find/ls — all tiers now
  use explicit tool lists in mapPermissionToTools() (see section 4.1 table)