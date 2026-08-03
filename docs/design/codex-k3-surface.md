# K3 — Native Codex role/render surface

**Bead:** `unitAI-e67up.2`
**Status:** implemented; experimental until K5 promotion (GATE-IFACE has already passed)
**Characterization baseline:** [`docs/design/codex-k1-characterization.md`](codex-k1-characterization.md) (K1, `unitAI-e67up.1`)
**Separation fixture:** [`tests/fixtures/codex-k3/provider-surface-separation.json`](../../tests/fixtures/codex-k3/provider-surface-separation.json)

K3 adds the smallest native Codex interactive surface on the existing Specialists
seams identified by K1. Pi and Claude behavior is unchanged. The surface is a
read-only render/role contract: Core owns launch, worktree, tmux transport, and
the structured launch outcome.

## 1. What changed

| Concern | Seam | K3 change |
| --- | --- | --- |
| Surface type | `Surface` in `src/specialist/task-prompt.ts` and `src/cli/render-task.ts` | `'pi' \| 'claude' \| 'codex'` |
| Turn-1 skill syntax | `buildSkillPrefix()` in `src/specialist/task-prompt.ts` | Codex emits `$<name>` references separated by spaces, followed by one blank line (`$a $b\n\n`). Pi (`/skill:<name>`, spaces) and Claude (`/<name>`, newlines) are unchanged. |
| Task render | `sp render-task <name> --bead <id> --surface codex` | Same shared assembly (`renderTaskPrompt()`), same envelope keys, same stable error codes. |
| Roleless render | `sp render-bead <id> --surface codex` | Accepted; `skill_prefix` stays `""` by construction. |
| Skill prefix | `sp render-skill-prefix <name> --surface codex` | Emits the `$<name>` block, byte-identical to `render-task`'s `skill_prefix` metadata. |
| Model validation | `loadSpecialistForSurface()` in `src/cli/render-task.ts` | Pi/Claude keep the historical `loader.get()` gate exactly (hard-fail on null/empty `execution.model`). Codex resolves `execution.surface_models.codex` first, else `execution.model`; a config with neither fails with the canonical `SpecialistMissingModelError` shape under error code `specialist_not_found`. |
| View | `sp view <name> [--raw] --surface codex` | Unchanged code path: `resolveSurfaceModel()` already prefers `execution.surface_models[name]` for any surface name and passes the model through verbatim as data. |
| Help | `render-task`/`render-bead`/`render-skill-prefix`/`view` help blocks | Codex documented and marked experimental until K5 promotion; K1-pinned help lines preserved byte-for-byte. |

## 2. Parity and byte ceilings

The task body is the one shared assembly for all three surfaces: task_template +
bead context + boundary rules → MANDATORY_RULES (dropped, never truncated, above
the 2,000-estimated-token budget) → hash. The only approved difference is the
position-0 skill syntax; with no declared skills all three surfaces are
byte-identical. `prompt.system` never reaches the task side on any surface.
Component measurements in the envelope are surface-independent.

## 3. Provider/surface separation (negative proof)

`openai-codex/...` remains a Pi provider/model spelling:

- the surface is selected ONLY by the `--surface` flag; the default stays `pi`;
- `--surface openai-codex`, `--surface openai-codex/gpt-5.4`, and any other
  non-surface value fail with the `usage` error
  `--surface must be 'pi', 'claude' or 'codex' (got '<value>')`;
- a specialist whose `execution.model` is `openai-codex/gpt-5.4` renders an
  identical task body on `pi` and `codex`; the spelling is data in
  `view --raw` and never selects a surface;
- a codex-only config (`execution.model: null`, `surface_models.codex` set)
  renders on the codex surface but still fails on pi/claude with the K1-pinned
  missing-model error.

Executable evidence: `tests/unit/cli/render-codex-surface.test.ts`,
`tests/unit/fixtures/codex-k3-separation.test.ts`, and the fixture named above.

## 4. Core K2 boundary

Core K2 is consumable at merged Core commit
`1ed512a49efaf75f3e84c128f9d82958ece09d3a` with schema
`xtrm.command-outcome.v1` (gate bead `unitAI-e67up.6`). Field names and
reason-code enums remain Core-owned. At K3, Specialists consumes nothing from
the outcome: it supplies `render-task`, `render-bead`, `render-skill-prefix`,
and `view --raw` to the Core launcher, and Core owns launch, worktree, tmux
transport, readiness, and the structured outcome. Specialists does not parse
Core prose. Outcome consumption (readiness/failure surfacing, result
retrieval) belongs to K4/K5. K4 delivered the consumer seam:
[`docs/design/codex-k4-invocation-result.md`](codex-k4-invocation-result.md).

## 5. Out of scope at K3

Direct `codex exec` as a Specialist backend, Core worktrees, xtmux lifecycle
domains, native Codex subagents, MCP/plugin bundles, a second job/result
authority, and production promotion. The surface stays backward-compatible and
remains experimental until K5 promotion. GATE-IFACE has already passed; K5
requires completed K3/K4 parity evidence plus that passed gate. Source merge
may occur after K3 evidence; no release or promotion promise exists before
K4/K5.
