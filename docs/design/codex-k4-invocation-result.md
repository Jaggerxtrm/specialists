# K4 — Codex invocation, launcher handoff and result retrieval parity

**Bead:** `unitAI-e67up.4`
**Stacks on:** K3 native Codex role/render surface (`docs/design/codex-k3-surface.md`, merged)
**Contract consumed:** `xtrm.command-outcome.v1` at merged Core commit
`1ed512a49efaf75f3e84c128f9d82958ece09d3a` (gate bead `unitAI-e67up.6`;
Core owns the schema, field names and reason-code enums)

K3 proved the render slice. K4 completes the parity-required invocation,
launcher-handoff and result-retrieval behavior on top of it, with
package-compatible contracts and current operator documentation. The codex
surface remains experimental until K5 promotion; the programme `GATE-IFACE`
has already passed, and K5 requires the completed K3/K4 parity evidence plus
that passed gate. No release or promotion promise exists before K4/K5; the
compatibility release is K6 work.

## 1. Invocation and handoff chain

The supported handoff is the contracted seam between the two repositories.
Specialists supplies read-only inputs; Core owns launch, worktree, tmux
transport, readiness and the structured outcome.

```text
sp render-task <role> --bead <id> --surface codex     (K3, unchanged)
sp view <role> --raw --surface codex                  (K3, unchanged)
        │  envelope + effective spec (data only)
        ▼
Core `xt codex <role>` launcher                       (Core K2/K3-Core owned)
        │  creates worktree/branch, tmux pane, session
        ▼
detached xtrm.command-outcome.v1 JSON                 (Core owned)
        │
        ▼
sp launch-outcome <file>                              (K4, this change)
        ok envelope: readiness, runtime, identity,
        Core-owned worktree/branch, exact argv actions
```

Role invocation is complete by contract: the rendered codex role is invoked
through the Core launcher, and Specialists consumes the structured outcome.
Specialists never spawns `codex exec` — direct Codex execution as a
Specialist backend stays out of scope and is not a required backend. The
surface is still selected only by `--surface`; `openai-codex/...` remains a
Pi provider/model spelling and never appears in the outcome contract.

## 2. What changed

| Concern | Seam | K4 change |
| --- | --- | --- |
| Outcome consumer | `src/specialist/launch-outcome.ts` (new) | Validates `xtrm.command-outcome.v1`: required fields, enums, ceilings and control-char rejection; refuses unknown `schema_version`; tolerates unknown fields (forward compatibility) and never echoes them. |
| Launcher-handoff verb | `sp launch-outcome <file>` (new, read-only) | Emits `{ ok: true, …projection }` or `{ ok: false, error: { code, message } }`; stable codes `usage`, `file_not_read`, `invalid_json`, `unsupported_schema`, `invalid_outcome`. Creates no job, worktree, session, bead, note or status row. |
| Library surface | `src/lib.ts` | Additive exports of the consumer API and types. |
| Fixtures | `tests/fixtures/codex-k4/` | Codex-ready, pi-unverified (parity pair) and wrong-schema outcomes, captured against the Core schema at the gate commit. |
| Help | `specialists launch-outcome --help` | Contract version, read-only nature, stable error codes, K5 status. |

The projection is a whitelist rebuild of the validated outcome — redaction by
construction. The contract has no slot for prompts, credentials, transcripts
or terminal capture, and unknown fields are dropped rather than echoed.

## 3. Result retrieval parity

Result retrieval needs, per K1 §7: readiness and failure reason without prose
parsing, thread/session identity, Core-owned worktree/branch identity, and
exact follow-up actions as data. `sp launch-outcome` exposes exactly those
fields, and the projection key sets are identical for `pi` and `codex`
outcomes (pinned in `tests/unit/specialist/launch-outcome.test.ts` and
`tests/unit/cli/codex-k4-handoff.test.ts`).

`sp result` remains the only specialist job-result authority and is
surface-independent by construction; K4 adds no second result authority. The
role/bead correlation is the Core-owned worktree branch, which a role launch
owns distinctly.

## 4. Package compatibility

- `package.json` `files` is unchanged; the design docs and fixtures are not
  packaged payload. The payload assertion (`scripts/assert-package-payload.sh`)
  passes without modification.
- `dist/` is rebuilt (tracked); the consumer ships in `dist/index.js`,
  `dist/lib.js` and the generated declarations.
- `src/lib.ts` gains exports only; existing Node consumers are untouched.
- No config asset changes, so `dist/asset-contract.json` content is stable.

## 5. Out of scope at K4

Direct `codex exec` as a Specialist backend, Core worktree ownership, xtmux
lifecycle domains, native Codex subagents, MCP/plugin bundles, Serena cleanup,
a second job/result authority, and the compatibility release (K6). Field names
and reason-code enums stay Core-owned; Specialists must not re-own them.

## 6. Evidence index

- Module contract: `tests/unit/specialist/launch-outcome.test.ts`
- CLI contract: `tests/unit/cli/launch-outcome-cli.test.ts`
- Fixture provenance + provider separation: `tests/unit/fixtures/codex-k4-outcome.test.ts`
- End-to-end handoff chain + pi parity: `tests/unit/cli/codex-k4-handoff.test.ts`
- Help pin: `tests/unit/cli/command-help.test.ts`
- K1/K3 regression goldens: `tests/unit/fixtures/codex-k1-characterization.test.ts`,
  `tests/unit/cli/render-codex-surface.test.ts`, `tests/unit/fixtures/codex-k3-separation.test.ts`
