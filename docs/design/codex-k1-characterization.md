# K1 — Specialists surface characterization

**Bead:** `unitAI-e67up.1`
**Status:** characterization complete; no Codex surface implemented
**Fixture:** [`tests/fixtures/codex-k1/chain-coordinator.json`](../../tests/fixtures/codex-k1/chain-coordinator.json)

This packet records the current Specialists contracts that K3 must extend without changing Pi/Claude behavior or treating `openai-codex/...` as a runtime surface.

## Evidence basis

| Artifact | Revision |
| --- | --- |
| Specialists | `@jaggerxtrm/specialists v3.21.2`, `fce9e4db8616f43fe74a0fec962265c0b39bde9c` |
| Core launcher reference | [`9b823f80d373a4cb82173ec594f525b1f20caa39` / `docs/xt-pi-role.md`](https://github.com/xtrm-dev/core/blob/9b823f80d373a4cb82173ec594f525b1f20caa39/docs/xt-pi-role.md) |
| Shared KAN-127 execution note | [`018e203247f4a9796a1677ec22281e9c7422f880` / `docs/shared/xtrm-codex-kan-127-execution-note.md`](https://github.com/xtrm-dev/xtrm/blob/018e203247f4a9796a1677ec22281e9c7422f880/docs/shared/xtrm-codex-kan-127-execution-note.md) |
| Canonical Specialist config | [`fce9e4db8616f43fe74a0fec962265c0b39bde9c` / `config/specialists/chain-coordinator.specialist.json`](https://github.com/xtrm-dev/specialists/blob/fce9e4db8616f43fe74a0fec962265c0b39bde9c/config/specialists/chain-coordinator.specialist.json) |
| Capture | `chain-coordinator`, bead `unitAI-e67up.1`, context depth `3`, isolated `HOME` with no global overrides |

The external [KAN-127 note](https://github.com/xtrm-dev/xtrm/blob/018e203247f4a9796a1677ec22281e9c7422f880/docs/shared/xtrm-codex-kan-127-execution-note.md) was read from the local xtrm checkout. It is evidence only; this PR changes Specialists only. The fixture uses the canonical repository config with an isolated `HOME`; it does not depend on `~/.config/specialists/user.json`, `.specialists/user/`, or another machine-local override.

## 1. Ownership and seams

| Concern | Current owner and seam | K1 finding |
| --- | --- | --- |
| Specialist role identity | `specialist.metadata.name` and `specialist.execution.interactive` | A role is a named Specialist configuration. Specialists has no Codex role alias. |
| Effective model | `sp view <name> --raw --surface <surface>` → `resolveSurfaceModel()` | `execution.surface_models[surface]` wins; otherwise `execution.model` is returned unchanged. |
| Pi/Claude task rendering | `renderTaskPrompt()` in `src/specialist/task-prompt.ts` | One task assembly path. It excludes `prompt.system`; it adds bead context, boundary rules and mandatory rules. |
| Interactive task envelope | `sp render-task <name> --bead <id> --surface pi|claude` | Read-only JSON envelope. It creates no job, worktree, session, bead, note or status row. |
| Turn-one skill loading | `sp render-skill-prefix <name> --surface pi|claude` | Pi emits `/skill:<name>` commands separated by spaces. Claude emits `/<name>` commands separated by newlines. |
| Human/config inspection | `sp view <name> [--section ...] [--surface ...] [--raw]` | `--raw` emits the merged effective spec used by the launcher. `--surface` is a model selector, not proof that a runtime surface exists. |
| Provider/model execution | `PiAgentSession.create()` and `PiAgentSession.start()` | A slash-qualified `openai-codex/...` model records backend `openai-codex` and starts Pi with `--model <provider/model>`. It is not a surface identifier. |
| Standalone provider helper | `mapSpecialistBackend()` in `src/pi/backendMap.ts` | For `openai-codex/gpt-5.4`, the pass-through result is a helper probe only; it is not the Pi session launch backend for a slash-qualified model. |
| Interactive launch | Core `xt pi --role` / `xt claude --role` | Core owns runtime launch, worktree, tmux and managed configuration. Specialists supplies role/config and task/result semantics. |

## 2. Current Pi/Claude matrix

| Layer | `sp run` | `xt pi --role` | `xt claude --role` |
| --- | --- | --- | --- |
| Effective Specialist config | yes | `sp view --raw --surface pi` | `sp view --raw --surface claude` |
| Task template + bead/dependency context | yes | `sp render-task --surface pi` | `sp render-task --surface claude` |
| Boundary rules | yes | yes | yes |
| Mandatory rules | yes, up to 2,000 estimated tokens | yes; renderer failure is fatal | yes; renderer failure is fatal |
| `prompt.system` on task side | never | never | never |
| Pre-script output | execution-only | omitted | omitted |
| Reviewer git-diff context | reviewer execution-only | omitted | omitted |
| Skill prefix | Pi syntax | Pi syntax | Claude syntax |
| Job/RPC/status creation | yes | no; Core owns its session | no; Core owns its session |
| Prompt hash | over final task body | emitted by `render-task` | emitted by `render-task` |

The shared body components are the same for both role surfaces. The **full** `initial_prompt` is intentionally not byte-identical when skills are declared because the position-zero skill syntax differs. The captured fixture records this: Pi is 2,483 bytes with hash `8d21feaaa0fc5a3c`; Claude is 2,477 bytes with hash `bf983c33eb2e9c45`.

The existing parity tests cover the shared rendering seam and surface-specific prefix behavior. The characterization fixture adds the task envelope from the shared `renderTaskPrompt()` seam, plus view, help and model values for a released Specialists checkout. Because the canonical `chain-coordinator` config has no model, the CLI refuses to load it; the fixture records that CLI probe separately and does not hide the failure behind a machine-local override. Its `view_raw` model and thinking values are the canonical repository values (`null` and `low`).

## 3. Machine-readable output contracts

### `render-task`

Required successful envelope keys:

```text
ok
specialist
bead_id
surface
cwd
context_depth
initial_prompt
prompt_hash
skill_prefix
components
mandatory_rules
skills
```

`components` contains bounded measurements only. It does not expose full prompt bodies outside `initial_prompt`. Stable failure codes are `usage`, `specialist_not_found`, `bead_not_found`, `template_render_failed` and `mandatory_rules_failed`.

### `render-skill-prefix`

Successful output is:

```json
{
  "ok": true,
  "specialist": "<name>",
  "surface": "pi|claude",
  "skill_prefix": "<turn-one block>"
}
```

### `view --raw`

The output is the merged effective Specialist configuration. The fixture captures this command with the canonical repository config and no global override layer. The launcher consumes the execution model, thinking level, system prompt, skills and surface-specific model resolution. `prompt.system` is available here for the runtime launcher, but it is not part of the task-side `render-task` envelope.

## 4. Byte ceilings

| Boundary | Current contract |
| --- | --- |
| Mandatory rules | `renderTaskPrompt()` injects the block only when it is at or below `2,000` estimated tokens; an oversized block is dropped rather than truncated. |
| Specialist prompt override | `execution.prompt_limit_bytes` is optional; `null`/unset inherits the shipped runtime input limit. |
| Script stdout | `execution.stdout_limit_bytes` is optional; `null`/unset inherits the shipped capture limit. |
| Core literal `--prompt` | Core launcher reference caps the combined system/body payload at `50 KiB`. |
| Core rendered `--bead` | Core preserves the rendered task up to the portable Linux argument limit of `131,071` bytes. |
| Captured K1 render | The fixture records 2,483 bytes for Pi and 2,477 bytes for Claude before any Core launch transport. |

The Specialists renderer does not create a prompt file or a job. Core owns transport and its byte guard.

## 5. Launcher behavior relevant to Specialists

The [Core launcher reference](https://github.com/xtrm-dev/core/blob/9b823f80d373a4cb82173ec594f525b1f20caa39/docs/xt-pi-role.md) establishes these compatibility facts:

- `--role` resolves the effective Specialist config for the selected runtime.
- `--bead` and `--prompt` are mutually exclusive.
- `--bead` uses the complete `sp render-task` envelope; a bead pointer is not substituted.
- `--prompt` combines literal text with `sp render-skill-prefix`.
- A role launch owns a distinct worktree and branch.
- Inside tmux, the default is the current pane. Outside tmux, the default is a new session.
- `--new-session --no-attach` prints `session_name:pane_id` and exits successfully.
- Core records role, task-rendered, model, worktree, branch and pane/session metadata; it does not log the full rendered prompt body.
- Core consumes Specialists outcomes. It does not create a second Specialist job/result authority.

These are reference-contract facts, not a live Core launch from this Specialists worktree. K1 does not change Core or xtmux.

## 6. Provider/model versus surface boundary

The following negative proof was captured:

```text
model                                      openai-codex/gpt-5.4
standalone mapSpecialistBackend() result   openai-codex/gpt-5.4  [helper only]
Pi session metadata backend                openai-codex
Pi session provider args                   --model openai-codex/gpt-5.4
surface model (pi)                        openai-codex/gpt-5.4
surface model (claude)                    openai-codex/gpt-5.4
render-task --surface codex               exit 1; usage error
render-skill-prefix codex                 exit 1; usage error
```

Current render APIs accept only `pi` and `claude`. The model spelling `openai-codex/gpt-5.4` passes through as a provider/model string; it never selects a Codex surface. In source, `PiAgentSession.create()` derives session metadata backend `openai-codex` from the slash prefix, while `PiAgentSession.start()` forwards the complete value through `--model`. K3 must add a distinct Codex runtime/surface contract rather than widening this value into an alias.

## 7. K2 outcome fields Specialists must consume

The [KAN-127 K2 note](https://github.com/xtrm-dev/xtrm/blob/018e203247f4a9796a1677ec22281e9c7422f880/docs/shared/xtrm-codex-kan-127-execution-note.md) defines the additive generic launch outcome. The field **names and reason-code enum remain Core-owned**. Specialists must consume the stable contract without inventing a private Codex schema.

The required outcome concepts are:

```text
schema/version
status and stable reason code
runtime and runtime version
thread/session identity
pane/session identity
worktree and branch
readiness
selected safety profile
persistence/mutation result
side effects
exact attach/resume/repair/end argv actions
```

Specialists-facing use is limited to:

- correlate the runtime launch with the Specialist role and bead;
- identify the selected runtime/model and the resulting job/session;
- expose readiness and failure reason without parsing prose;
- preserve worktree/branch ownership and thread/session identity for result retrieval;
- expose exact follow-up actions as data, not reconstructed shell commands;
- preserve schema/version negotiation and unknown-field tolerance.

K2 must define the canonical key names, stable reason-code values, redaction rules and replay/idempotency rules. K1 records the consumer boundary only. It does not implement or vendor the K2 schema.

## 8. K1 handoff

K1 is complete when the fixture and this packet are reviewed against the captured revision. K3 may use this packet to add a distinct Codex surface, but must preserve:

1. Pi and Claude render/view/help behavior.
2. Provider/model spelling as data, including `openai-codex/...`.
3. The read-only render envelope and its stable error codes.
4. Position-zero skill-prefix rules and byte ceilings.
5. Core ownership of launch/worktree/tmux transport.
6. The external K2 outcome contract boundary.

No Codex surface, direct Codex executor, Core launcher, xtmux lifecycle or merge/release behavior is included in this K1 change.
