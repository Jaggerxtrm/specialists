# Pi v0.84.1 compatibility audit

**Status:** design and compatibility audit  
**Audit date:** 2026-08-08  
**Audited repository:** `xtrm-dev/specialists`, package version `3.21.2`, `master` snapshot observed on the audit date  
**Upstream baseline:** `earendil-works/pi` release `v0.84.1`, published 2026-08-07  
**Primary surface:** Pi subprocess execution through `pi --mode rpc`  
**Secondary surfaces:** `sp --json`, script/service execution, Docker runtime, Pi compatibility CI, schema and vendored protocol references

## 1. Executive conclusion

`specialists` is not safely compatible with Pi `v0.84.1` as an end-to-end runtime contract.

The basic subprocess path remains viable: the required CLI flags still exist, the JSONL framing in `src/pi/session.ts` is sound, and the internal streaming parser already consumes text and thinking deltas rather than depending on cumulative message snapshots. A simple one-shot run with no retry, no compaction recovery and no queued continuation may therefore appear healthy.

The full lifecycle is not safe. The repository currently spans two Pi generations:

1. The Docker image and compatibility workflow still install the legacy package name `@mariozechner/pi-coding-agent`, while Pi `v0.84.1` is published as `@earendil-works/pi-coding-agent`.
2. `PiAgentSession` treats `agent_end` as final completion, while current Pi treats it as the end of one low-level run and emits `agent_settled` only after retry, compaction recovery and queued continuations are exhausted.
3. The public Pi-compatible JSON projector still emits the pre-0.84 cumulative `message_update` shape removed by Pi `0.84.0`.
4. Compaction events are parsed under names and field locations that do not match the Pi RPC protocol.
5. Specialists rejects Pi's supported `max` thinking level.
6. Vendored RPC types and documentation are no longer a reliable representation of the supported upstream protocol.

The first remediation must be atomic. Updating only the npm package name would expose the current lifecycle bug immediately. Conversely, changing lifecycle semantics without ensuring the runtime actually installs the intended Pi release would leave the compatibility claim unverifiable.

## 2. Severity model

| Severity | Meaning in this audit |
| --- | --- |
| P0 | Can cause execution against the wrong runtime generation, premature terminal state, wrong canonical output or suppression of Pi recovery behavior. |
| P1 | Wire-contract or observability incompatibility that can break strict consumers or make runtime behavior materially unreconstructable. |
| P2 | Supported upstream capability is rejected, integration metadata is lost, or repository-owned reference material is materially stale. |
| P3 | Safe improvement or maintenance opportunity that does not currently invalidate the core RPC run. |

## 3. Findings summary

| ID | Severity | Finding | Primary consequence |
| --- | --- | --- | --- |
| PI-COMPAT-001 | P0 | Docker and `pi-compat` install the legacy package namespace and use an unpinned `latest`. | The image and canary do not prove compatibility with Pi `v0.84.1`. |
| PI-COMPAT-002 | P0 | `agent_end` is treated as session-final instead of waiting for `agent_settled`. | Retry, compaction recovery and queued work can be cut off; a non-final answer can become canonical. |
| PI-COMPAT-003 | P1 | `sp --json` still emits cumulative `message_update.message` and `assistantMessageEvent.partial`. | Strict Pi 0.84 clients receive a removed wire shape. |
| PI-COMPAT-004 | P1 | Compaction lifecycle parser expects `auto_compaction_*` and top-level result fields. | Compaction metrics and causal history are missing or wrong. |
| PI-COMPAT-005 | P2 | Specialists schemas do not accept thinking level `max`. | Valid Pi configurations for GPT-5.6 and adaptive Claude models are rejected before launch. |
| PI-COMPAT-006 | P2 | Vendored RPC types/docs remain tied to older package names and protocol semantics. | Repository documentation can mislead maintainers and generate incorrect clients. |
| PI-COMPAT-007 | P2 | `extension_error` parsing loses upstream extension path and event identity; CI does not load the production extension set. | Extension regressions can be hard to attribute and TypeBox/API drift can escape the canary. |
| PI-COMPAT-008 | P3 | `sp doctor` does not use the new `pi auth check` readiness surface; Pi version is not persisted as runtime evidence. | Authentication and provenance diagnostics are weaker than current Pi permits. |
| PI-COMPAT-009 | P3 | Direct `@earendil-works/pi-tui` dependency remains pinned to `0.75.5`. | Not an RPC blocker, but the Specialists TUI is intentionally separated from current Pi TUI behavior and needs its own upgrade assessment. |

## 4. Audit method and evidence boundary

The audit compares the Specialists implementation and tests against the exact Pi `v0.84.1` source and documentation. The principal Specialists evidence is:

- [`Dockerfile`](../../Dockerfile)
- [`.github/workflows/pi-compat.yml`](../../.github/workflows/pi-compat.yml)
- [`src/pi/session.ts`](../../src/pi/session.ts)
- [`src/specialist/runner.ts`](../../src/specialist/runner.ts)
- [`src/specialist/script-runner.ts`](../../src/specialist/script-runner.ts)
- [`src/specialist/timeline-events.ts`](../../src/specialist/timeline-events.ts)
- [`src/cli/pi-json-output.ts`](../../src/cli/pi-json-output.ts)
- [`src/specialist/schema.ts`](../../src/specialist/schema.ts)
- [`src/specialist/global-config.ts`](../../src/specialist/global-config.ts)
- [`tests/unit/pi/session.test.ts`](../../tests/unit/pi/session.test.ts)
- [`tests/unit/cli/pi-json-output.test.ts`](../../tests/unit/cli/pi-json-output.test.ts)
- [`pi/rpc/rpc-types.ts`](../../pi/rpc/rpc-types.ts)
- [`pi/pi-rpc.md`](../../pi/pi-rpc.md)
- [`package.json`](../../package.json)

The principal upstream evidence is pinned to `v0.84.1`:

- [coding-agent package metadata](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/package.json)
- [coding-agent changelog](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/CHANGELOG.md)
- [RPC documentation](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/docs/rpc.md)
- [RPC command and response types](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/modes/rpc/rpc-types.ts)
- [official subprocess RPC client](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/modes/rpc/rpc-client.ts)
- [JSON wire-event projection](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/modes/json-event.ts)
- [coding-agent session events](https://github.com/earendil-works/pi/blob/v0.84.1/packages/coding-agent/src/core/agent-session.ts)
- [agent-core lifecycle and tool contracts](https://github.com/earendil-works/pi/blob/v0.84.1/packages/agent/src/types.ts)

This is a static contract audit. No authenticated model invocation was run from the connector environment. The P0 conclusions do not depend on model behavior: they follow directly from package identity and deterministic event semantics in the two codebases. A live compatibility lane remains required before release.

## 5. Compatibility matrix

| Surface | Current status against Pi v0.84.1 | Notes |
| --- | --- | --- |
| `pi --mode rpc` subprocess architecture | Compatible | RPC remains a supported public surface. No immediate SDK migration is required. |
| Required launch flags | Compatible | Current Pi retains the isolation, provider/model, tools, thinking, skills, extension and system-prompt flags used by Specialists. |
| Strict LF-delimited JSONL reading | Compatible | Specialists buffers partial stdout chunks and splits on `\n`, matching current Pi framing requirements. |
| Internal text/thinking delta ingestion | Compatible | `src/pi/session.ts` consumes `assistantMessageEvent.delta` and does not require the removed cumulative snapshot. |
| Final completion boundary | Incompatible, P0 | Specialists resolves on `agent_end`; Pi declares `agent_settled` as the session-level idle boundary. |
| Auto-retry and overflow recovery | Incompatible, P0 | The current runner can read and persist the pre-retry output and close Pi before recovery completes. |
| Compaction lifecycle observability | Incompatible, P1 | Event names and field nesting do not match the upstream protocol. |
| `sp --json` Pi event projection | Incompatible, P1 | It emits fields removed in Pi 0.84. |
| Docker runtime package | Incompatible, P0 | It requests the legacy package scope rather than the current release package. |
| Compatibility CI | Insufficient | It checks flag presence and container health, not the exact package identity or RPC lifecycle. |
| `max` thinking level | Unsupported, P2 | Valid in Pi but rejected by Specialists schemas. |
| External extension compatibility | Unverified | Pi 0.83 removed deprecated TypeBox APIs; the canary does not load the extension set used by Specialists. |
| Vendored RPC references | Stale, P2 | They should not be treated as a source of truth in their current form. |
| Direct Pi TUI dependency | Deliberately old | Separate from subprocess correctness; requires a dedicated TUI migration lane. |

## 6. PI-COMPAT-001 — current package is not installed or tested

### 6.1 Evidence

The runtime stage in `Dockerfile` declares:

```dockerfile
ARG PI_VERSION=latest
RUN npm install -g "@mariozechner/pi-coding-agent@${PI_VERSION}"
```

The compatibility workflow repeats the same package name:

```bash
npm install -g "@mariozechner/pi-coding-agent@${{ steps.pi.outputs.version }}"
```

Pi `v0.84.1` declares its package as:

```json
{
  "name": "@earendil-works/pi-coding-agent",
  "version": "0.84.1"
}
```

The repository documentation already says that the service installs `@earendil-works/pi-coding-agent`, so the documented deployment and actual Dockerfile have drifted.

### 6.2 Why this is P0

The current image does not request the package that owns Pi `v0.84.1`. A passing build, flag grep or `/healthz` check therefore cannot substantiate the claim that Specialists works against the current Pi release.

The use of `latest` is independently non-deterministic. Even after correcting the package namespace, a production image built on two different dates can contain different Pi runtimes without a Specialists source change.

### 6.3 Required correction

The supported runtime lane should install an exact package and version:

```dockerfile
ARG PI_VERSION=0.84.1
RUN npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}"
```

The workflow should have two distinct lanes:

1. `supported`: blocking, exact `0.84.1`, used for release evidence.
2. `upstream-latest`: initially informational or non-blocking, used as an early-warning lane for the next Pi release.

Both lanes must assert the exact output of `pi --version`. Flag presence alone is not a compatibility test.

### 6.4 Atomicity requirement

This package correction must land with PI-COMPAT-002. Updating the package first would move the runtime to the lifecycle in which `agent_end` is explicitly non-terminal while leaving Specialists coded to terminate on that event.

## 7. PI-COMPAT-002 — `agent_end` is no longer terminal

### 7.1 Upstream contract

Current Pi distinguishes two boundaries:

- `agent_end`: one low-level agent run completed. The event includes `willRetry`; Pi may continue with automatic retry, compaction recovery or queued continuation.
- `agent_settled`: the complete session-level run is idle. No automatic retry, compaction retry or queued continuation remains.

The official Pi RPC client implements `waitForIdle()` by waiting for `agent_settled`.

### 7.2 Current Specialists behavior

`src/pi/session.ts` handles `agent_end` by:

1. selecting the last assistant message as `_lastOutput`;
2. collecting usage and finish reason;
3. setting `_agentEndReceived = true`;
4. clearing the stall watchdog;
5. resolving the done promise.

`waitForDone()` therefore returns at the first low-level completion. `SpecialistRunner` then calls `getLastOutput()` and can close the Pi process. `agent_settled` is not handled.

The process-close handler is also permissive: a zero or null exit code resolves the session even when no authoritative terminal protocol event was observed. That behavior can mask an unexpectedly truncated RPC lifecycle.

### 7.3 Failure sequences

#### Automatic retry

```text
agent_start
turn_start
...
agent_end { willRetry: true }
auto_retry_start
agent_start
...
agent_end { willRetry: false }
agent_settled
```

Specialists currently resolves after the first `agent_end`. The first run's error or incomplete response can be returned and persisted as the job result. Closing stdin can prevent the retry from completing.

#### Overflow compaction and retry

```text
agent_end { willRetry: true }
compaction_start { reason: "overflow" }
compaction_end { willRetry: true, ... }
agent_start
...
agent_end { willRetry: false }
agent_settled
```

The same early completion can suppress the recovery turn. The watchdog has already been cleared, so even a Pi process that continues is no longer supervised correctly.

#### Queued follow-up

Pi can emit an `agent_end`, drain a queued follow-up and start another run before `agent_settled`. Specialists can report the first answer as final before the queued work is executed.

### 7.4 Required state model

`PiAgentSession` should separate low-level completion from final settlement. A minimal model is:

```text
last assistant output       updated at every agent_end/message_end
last agent willRetry        captured from agent_end
session settled             set only by agent_settled
close requested             distinguishes intentional EOF from unexpected exit
killed/stalled              existing cancellation path
```

The required behavior is:

1. `agent_end` updates output, usage, finish reason and observability, but does not resolve `waitForDone()` and does not clear the stall timer.
2. `agent_settled` clears the watchdog, marks the session settled and resolves the done promise.
3. `getLastOutput()` is read only after settlement for a normal one-shot run.
4. A process exit before settlement rejects with a protocol/process error unless it followed an explicit close or kill operation.
5. `resume()` resets settlement state for the next user turn, not merely `_agentEndReceived`.
6. Keep-alive ownership remains with the caller only after the initial turn has settled.

### 7.5 Version policy

Do not infer legacy behavior from the temporary absence of `agent_settled`. That would recreate a race: the client cannot know whether the event is absent because an old Pi is installed or because current Pi has not settled yet.

The clean policy is to declare and enforce a supported Pi range. For the immediate migration:

```text
production pin: 0.84.1
supported range: >=0.84.0 <0.85.0
```

The upper bound should move only after the `upstream-latest` lane and a contract review pass.

## 8. PI-COMPAT-003 — obsolete JSON `message_update` shape

### 8.1 Upstream breaking change

Pi `0.84.0` removed the cumulative fields from JSON and RPC `message_update` events:

```text
message_update.message
message_update.assistantMessageEvent.partial
```

Current wire events contain only the delta-bearing `assistantMessageEvent`. Clients reconstruct a live partial message between `message_start` and `message_end`; `message_end.message` is authoritative.

### 8.2 Internal RPC parser status

The core Specialists parser is already compatible with this change. It reads:

```typescript
const ae = event.assistantMessageEvent;
const delta = ae.delta;
```

It does not require `event.message` or `ae.partial` for streamed text or thinking. Full assistant output is captured from `message_end` and `agent_end`.

### 8.3 Public projector drift

`src/cli/pi-json-output.ts` claims to project persisted Specialists events into Pi's documented JSON stream, but it still emits the old shape:

```typescript
{
  type: 'message_update',
  message,
  assistantMessageEvent: {
    type: 'text_delta',
    contentIndex: 0,
    delta,
    partial: message,
  },
}
```

A strict Pi 0.84 consumer can reject this or accidentally continue depending on fields that no longer exist upstream.

### 8.4 Required correction

The projector should emit delta-only updates:

```typescript
{
  type: 'message_update',
  assistantMessageEvent: {
    type: 'text_delta',
    contentIndex: 0,
    delta,
  },
}
```

`message_start.message` supplies the initial structure and `message_end.message` supplies the final authoritative message. The tests must explicitly assert that neither removed field is present.

The projector already emits a synthetic `agent_settled` after canonical `run_complete`; that part aligns with current Pi and should be retained.

## 9. PI-COMPAT-004 — compaction parser does not match RPC

### 9.1 Current Specialists behavior

`src/pi/session.ts` listens for:

```text
auto_compaction_start
auto_compaction_end
```

It expects fields such as `tokensBefore`, `summary` and `firstKeptEntryId` directly on the event. `src/specialist/timeline-events.ts` maps the same callback names into the compact feed model.

### 9.2 Upstream contract

Pi emits:

```text
compaction_start
compaction_end
```

`compaction_start` carries a `reason` of `manual`, `threshold` or `overflow`.

`compaction_end` carries lifecycle fields at the top level and the compaction payload under `result`:

```typescript
{
  type: 'compaction_end',
  reason,
  result: {
    summary,
    firstKeptEntryId,
    tokensBefore,
    estimatedTokensAfter,
    usage,
    details,
  } | undefined,
  aborted,
  willRetry,
  errorMessage?,
}
```

Pi also exposes summarization retry events:

```text
summarization_retry_scheduled
summarization_retry_attempt_start
summarization_retry_finished
```

### 9.3 Consequences

The current parser can leave `auto_compactions` at zero and omit the causal chain explaining why another run followed an apparent completion. It also loses:

- manual versus threshold versus overflow reason;
- aborted state;
- whether Pi will retry;
- compaction failure text;
- estimated post-compaction size;
- compaction usage and cost metadata;
- summarization retry lifecycle.

This is primarily an observability defect today, but it interacts with PI-COMPAT-002 because correct settlement depends on understanding that an `agent_end` can be followed by recovery work.

### 9.4 Required correction

The session parser and timeline model should accept the actual Pi names and project:

```text
phase
reason
aborted
will_retry
error_message
result.summary
result.firstKeptEntryId
result.tokensBefore
result.estimatedTokensAfter
result.usage
```

The compatibility layer may accept the old internal callback aliases for historical test fixtures, but the Pi wire parser must be grounded in `compaction_start` and `compaction_end`.

Summarization retry events should be represented explicitly or, at minimum, mapped into a typed retry category distinct from assistant-turn auto retry.

## 10. PI-COMPAT-005 — `max` thinking level is rejected

Pi added `max` above `xhigh` in `0.80.6`, including CLI, SDK and RPC support. Current Pi exposes it where the selected model supports it, including GPT-5.6 and adaptive Claude models.

Specialists restricts `execution.thinking_level` to:

```text
off, minimal, low, medium, high, xhigh
```

The same restriction exists in the global override schema. A valid specification using `max` therefore fails validation before Pi starts.

The correction must be applied consistently to:

- `ExecutionSchema` in `src/specialist/schema.ts`;
- `OverrideExecutionSchema` in `src/specialist/global-config.ts`;
- generated global templates and documentation;
- specialist authoring docs and creator/setup skills;
- schema, loader and global override tests.

This is additive and does not require changing existing specialist defaults.

## 11. PI-COMPAT-006 — vendored RPC references are stale

The repository carries a local protocol snapshot under `pi/rpc/` plus `pi/pi-rpc.md`. These files still contain older package imports and do not consistently model the current command and event surface. Examples of upstream additions or changes not reliably represented include:

- current `@earendil-works/*` package names;
- `agent_settled` terminal semantics;
- delta-only `message_update` wire events;
- `get_available_thinking_levels`;
- `clone`;
- `get_entries` and `get_tree`;
- `max` thinking;
- current compaction and summarization retry lifecycle.

A manually maintained protocol copy is high-risk because it can look authoritative while drifting independently from both the runtime parser and upstream Pi.

Two acceptable strategies exist:

1. Remove the snapshot and link to the exact supported Pi tag from repository documentation.
2. Generate the snapshot from an exact upstream tag, place provenance metadata at the top of each file and add CI that fails when the generated output differs.

The current hybrid state should not remain. `src/pi/session.ts` and tests must be the executable compatibility contract; vendored documentation must either be generated from the same version or clearly marked historical and non-authoritative.

## 12. PI-COMPAT-007 — extension compatibility and error attribution

### 12.1 Error shape drift

Specialists currently searches `extension`, `extensionName` or `name` when parsing an `extension_error`. Current Pi emits fields centered on:

```text
extensionPath
event
error
```

The error text is often retained because `error` is searched, but extension identity and the event hook that failed are lost. The timeline schema then stores only a generic optional `extension` and `error_message`.

The parser and timeline event should preserve at least:

```text
extension_path
event
error_message
```

### 12.2 Production extension set is absent from the canary

`src/pi/session.ts` can selectively load:

- quality-gates;
- service-skills;
- caveman;
- NVIDIA NIM provider extension;
- `pi-gitnexus`;
- the generated worktree-boundary extension.

Pi `0.83.0` upgraded TypeBox and removed deprecated APIs. A bare `pi --help` smoke does not prove these extensions can load against the current Pi runtime.

The compatibility workflow needs an extension lane that loads a controlled fixture extension and the production extensions available in CI. At minimum it must verify startup and one RPC request with the generated boundary extension plus a representative npm extension. Failures must report the exact extension path and hook.

## 13. PI-COMPAT-008 — readiness and provenance opportunities

Pi `0.84.1` provides `pi auth check` for provider/model readiness. `sp doctor` currently infers provider availability primarily through `pi --list-models`. Model listing is useful but is not equivalent to validating that credentials are currently usable or refreshable.

A version-gated doctor check should:

1. run `pi --version` and report the exact supported/unsupported status;
2. use `pi auth check` where available for configured specialist models or providers;
3. preserve the existing list-models fallback only for older Pi versions;
4. never print resolved credentials unless the operator explicitly requests the upstream credential-output option.

Pi also sets `AI_AGENT=pi` in CLI and RPC child-process environments. Specialists can improve provenance by recording the Pi package version and runtime identity in the startup snapshot or meta event. This is additive evidence and should not replace the Specialists job, participant or model identity fields.

## 14. PI-COMPAT-009 — direct Pi TUI dependency is a separate lane

`package.json` pins `@earendil-works/pi-tui` to `0.75.5`, while Pi `v0.84.1` uses its corresponding `0.84.1` TUI package and includes substantial fullscreen, rendering and native addon changes.

This does not invalidate the subprocess RPC runtime because Specialists bundles and uses its direct TUI dependency for its own console/chat surfaces; it is not importing the TUI from the spawned Pi process. Updating it inside the P0 compatibility patch would unnecessarily couple two risk domains.

The correct treatment is a separate PR with:

- direct API/import diff review;
- console and chat regression tests;
- terminal resize, input and shutdown smokes;
- Linux/macOS/Windows native addon packaging checks where supported.

## 15. Stable areas and explicit non-recommendations

### 15.1 Subprocess RPC remains an acceptable architecture

Pi's documentation continues to support `pi --mode rpc` and provides an official subprocess client. Specialists does not need to migrate immediately to direct `AgentSession`, `PiClient`, CBOR or remote-session APIs to solve this compatibility problem.

The new remote client stack is experimental and addresses a broader transport/session problem. Adopting it now would expand scope without removing the need to understand settlement, retries and event semantics.

### 15.2 JSONL framing is implemented correctly

Specialists accumulates stdout chunks, splits only on LF and retains the incomplete tail for the next chunk. This is important because large `agent_end` records can exceed a single pipe chunk. It also matches Pi's warning not to use generic line readers that treat Unicode separators as record boundaries.

### 15.3 Streaming delta ingestion is already forward-compatible

The internal handler uses `assistantMessageEvent` deltas and full message-boundary events. The 0.84 cumulative-snapshot removal does not require redesigning internal token callbacks. The required change is concentrated in the public JSON projector and its tests.

### 15.4 Existing process-group cleanup remains relevant

Waiting for `agent_settled` does not remove the need for detached process groups and the SIGKILL backstop. The cleanup path should be retained, but its state transitions must distinguish normal settlement, explicit close, cancellation and unexpected process exit.

## 16. Recommended implementation sequence

### 16.1 PR A — atomic runtime compatibility patch

This is the release-blocking change and should include:

- `Dockerfile`: current package namespace and exact supported version;
- `.github/workflows/pi-compat.yml`: supported and upstream-latest lanes;
- `src/pi/session.ts`: `agent_settled` completion, `willRetry`, process-exit discipline, current compaction events and extension-error fields;
- `src/specialist/timeline-events.ts`: current compaction/retry/error metadata;
- `src/cli/pi-json-output.ts`: delta-only 0.84 wire events;
- unit tests for every changed protocol sequence;
- an RPC process smoke using the exact installed Pi version;
- a version policy check exposed through doctor or a dedicated compatibility helper.

No Pi package upgrade should merge separately from the lifecycle correction.

### 16.2 PR B — additive schema and reference cleanup

After PR A is green:

- add `max` thinking throughout schema and global overrides;
- update authoring/setup/creator documentation;
- remove or generate vendored RPC references;
- add a compatibility provenance block identifying the supported Pi tag;
- adopt `pi auth check` in doctor;
- persist Pi version in run metadata.

### 16.3 PR C — Pi TUI dependency assessment

Upgrade the direct TUI dependency only after a dedicated API and terminal behavior audit. It should not block the RPC correctness patch unless a security issue requires an immediate update.

## 17. Required acceptance tests

### 17.1 Settlement contract

A test sequence must prove that this does not resolve:

```text
agent_end { willRetry: true }
```

and that it resolves only after:

```text
agent_end { willRetry: false }
agent_settled
```

The final output must be the assistant output from the last completed run.

### 17.2 Automatic retry sequence

Inject:

```text
agent_start
turn_start
message_start
message_end
turn_end
agent_end { willRetry: true }
auto_retry_start
auto_retry_end
agent_start
turn_start
message_start
message_end
turn_end
agent_end { willRetry: false }
agent_settled
```

Assert:

- one session-level completion;
- two low-level completion observations;
- retry metrics preserved;
- watchdog active until settlement;
- second answer canonical.

### 17.3 Compaction overflow sequence

Inject `compaction_start` and `compaction_end` using the exact upstream nesting. Assert preservation of:

```text
reason = overflow
aborted
willRetry
result.summary
result.tokensBefore
result.firstKeptEntryId
result.estimatedTokensAfter
```

Then prove that the recovery run completes before settlement.

### 17.4 Summarization retry sequence

Inject the three summarization retry event classes and verify they remain observable and count as protocol activity without being confused with assistant-turn auto retry.

### 17.5 JSON wire format

For every `message_update` projected by `sp --json`, assert:

```text
message is absent
assistantMessageEvent.partial is absent
```

Assert that `message_end.message` contains the final reconstructed content and that `agent_settled` follows canonical `run_complete` exactly once.

### 17.6 Exact runtime identity

The Docker/CI lane must fail unless:

```text
package = @earendil-works/pi-coding-agent
pi --version = 0.84.1
```

The value must be printed into the workflow summary and available as an artifact or log line suitable for release evidence.

### 17.7 Real RPC round trip

The compatibility job must start Pi in RPC mode, send a JSONL command such as `get_state`, correlate the response by request id and then close the process cleanly. A model-authenticated turn should be a separate opt-in live smoke; protocol startup and state retrieval should not depend on paid credentials.

### 17.8 Extension startup lane

Start RPC mode with:

- the generated worktree-boundary extension;
- one controlled fixture extension;
- representative production extension packages available in CI.

Assert no `extension_error`, or assert the fully attributed error when the fixture deliberately fails.

### 17.9 Schema acceptance

Validate a specialist and a global override containing:

```json
{ "thinking_level": "max" }
```

and prove the launch argv contains `--thinking max` unchanged.

### 17.10 Unexpected exit discipline

A clean child-process exit before `agent_settled` must reject unless the caller explicitly initiated close or kill. This prevents exit code zero from becoming a substitute for a missing protocol terminal event.

## 18. Proposed version and rollout policy

The following policy minimizes ambiguity:

```text
supported production package: @earendil-works/pi-coding-agent
production version:            0.84.1
accepted runtime range:        >=0.84.0 <0.85.0
future-release lane:           @latest, non-blocking until audited
```

The exact version belongs in container labels or run metadata as well as CI logs. A future `0.85.x` release should not be accepted merely because flag smoke tests remain green; the changelog, RPC types and lifecycle tests must be reviewed first.

Rollout should proceed through:

1. unit protocol tests;
2. container RPC state round trip;
3. extension startup lane;
4. authenticated one-shot model smoke;
5. forced retry or fault-injection smoke;
6. keep-alive/resume smoke;
7. service deployment canary before broad release.

## 19. Definition of done

The Pi `v0.84.1` compatibility work is complete only when all of the following are true:

- the exact current package is installed in production and CI;
- `waitForDone()` means session settlement, not one low-level agent completion;
- retry, compaction and queued continuation cannot be cut off by the runner;
- unexpected pre-settlement process exit is an error;
- internal and public JSON event shapes match Pi 0.84 contracts;
- compaction and summarization recovery are reconstructable from the Specialists timeline;
- `max` thinking is accepted and passed through;
- external extensions are exercised in compatibility CI;
- vendored protocol material is generated, pinned or removed;
- the supported Pi version is visible in doctor output and runtime evidence.

Until these conditions hold, passing one-shot runs should be described as partial operational compatibility, not full Pi `v0.84.1` compatibility.
