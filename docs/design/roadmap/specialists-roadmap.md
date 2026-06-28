# Specialists Runtime — Architectural Critique, Friction Audit, and Substrate-Aligned Patch Roadmap

> **Document role.** Canonical, consolidated source-of-truth for the specialists-runtime cleanup and substrate-alignment effort. Absorbs and supersedes the previously-separate `specialists-runtime-critique.md` and `specialists-substrate-alignment.md`.
>
> **Revision note (this version).** Reviewed against `substrate.md` revision 10 *after* the step-1/2/3/4/6 integration and the rev10 additions (chain-coordinator §4.3, memory-as-capability §10.2, chain-template-declares-coordinator §6.9.10). Open questions (§11) resolved; the four content adjustments and the runway recalibration applied; every reads-forward retargeted to the sections that now actually exist in the canonical design. **Absorbed (2026-05-27 consolidation):** the prior parallel `specialists-friction-audit.md` (now archived) — its additions are now Opportunities 10 (`--chain` redesign) and 11 (pull-not-push memory recall), §12 (`sp epic` decoration strategy), §13 (chain templates concretized in `docs/design/roadmap/chain-templates/`), and D24–D27 in this §0. Changes are marked inline with **[rev-9/10 author]** where they reflect a decision by the substrate-design author, **[recalibrated]** where the runway changed a prior conclusion, and **[absorbed]** where they came from the friction-audit consolidation.
>
> **Intended consumers.** Operator (decisions now closed — see §0), planning session (produce a phased work plan from this doc), implementer (after plan approved).
>
> **Method.** Direct reading of `.xtrm/reports/2026-05-25..26` across mercury market-data, gitboard, and specialists repos; direct reading of `src/specialist/{chain-identity,supervisor,runner,worktree,control}.ts` + `src/cli/{run,finalize}.ts`; cross-reference against `substrate-design.md` revision 9 and `channels.md`.
>
> **Scope discipline.** This document is *action plan for the existing specialists runtime*, not design. Every patch must (a) reduce concrete friction now, (b) survive substrate's arrival without rework, or (c) be an honest throwaway bridge whose cost is justified by friction-removed-now.

## §0. Decisions closed in this review pass

The prior revision left nine open questions (old §11). They are now resolved. This section is the decision record; the body has been updated to match.

**Runway recalibration (frames everything below).** Substrate may be a month or more away, during which the operator works ~10 repos in parallel. This flips the leverage-per-day math: friction-removed-per-day × days-until-substrate × repos-affected is large, so even an honest throwaway bridge repays its cost many times over before it retires. Crucially, **the bd-layer patches are keepers — they retire only at the substrate §13.7 bd→substrate migration, which is *later* than substrate landing**, not at landing. Two prior conclusions change as a result: the `sp merge` dirty-index diagnostic moves from "skip" to **land**; the reviewer R1–R7 checks move from "build only 2–3" to **build more, but dedupe R5 and first verify which are made redundant by Opportunities 1/2/3**.

**Operator decisions (old §11.1):**

1. **Verb naming — align to substrate, don't invent.** The composition-gate command is **`sp chain review / approve / insert`** (not `plan / dispatch`), matching substrate §6.9.5 `sb chain review/approve/insert` 1:1 so migration is only `sp`→`sb`, no command remapping. `sp chain <bead>` accepts **root beads only**, refusing step-beads with a hint to the root (preempting Asymmetry 5).
2. **Pre-dispatch warning severity — warn-only except data-loss.** Default is **warn-only** (matches substrate's "refuse with reason, allow override" pattern). The **data-loss class is hard-refuse-with-explicit-override**: C1 (cwd-mismatch wipe), R5 (reviewer cwd-mismatch), and stale-base. The discriminant is severity-of-harm, not category — a warning on a small diff is a healthy nudge; "you are about to wipe the executor branch" must stop you.
3. **`--accept-stale-base` rollout — grace period.** Accept the old `--force-stale-base` with a deprecation warning for a release or two, not a hard cut. Rationale is the runway: a hard cut mid-campaign across 10 repos breaks muscle-memory at the worst moment; the grace period costs almost nothing.
4. **Bootstrap skill location — both.** A discoverable `xtrm-tools/skills/repo-bootstrap` skill **and** automatic application on `xt init`. With 10 repos the automatic-on-init path saves repeated manual setup; the standalone skill serves already-existing repos that don't pass through a fresh init.
5. **`sp chain <bead>` — read-once for v0.** Follow mode (`-f`) deferred to v0.5. Don't block the value on the streaming code.
6. **Phase 4 splits (per `xtrm-h9hqg`).** The P0 ticket `xtrm-h9hqg` (IN_PROGRESS) covers **B-A1/A2/A3** — bd auto-stage config flip + pre-commit shim, *and* explicitly the three hooksPath/third-party-hook cases the audit catalogued as A2/A3 (core.hooksPath honored; hooksPath misconfigured at `.beads/hooks`; non-bd pre-commit at target) — *plus* extra scope the audit hadn't listed (bd/gitnexus version + migration verification). It does **not** cover **B-A4** (orphan worktree cleanup), **B-A5** (test-runner `.worktrees/` excludes), **B-A6** (osv-scanner wrapper). Those remain friction-audit-side work: file separately or extend `xtrm-h9hqg`'s scope. (The `xtrm-h9hqg` sweep findings — 12/23 repos patched, 4 stuck on hooksPath misconfig, 7 on third-party hooks, named repos under `~/dev` and `~/projects` — are authoritative operator-environment data.)

**Answers to the prior "questions for the rev-9 author" (old §11.2 / §11.3) — now decided:**

- **[rev-9 author] Workspace identity is internal to substrate, not exposed in the API.** Operations are container-scoped; there is no first-class `workspace_id`. A participant never names a workspace — it is spawned into a container (substrate §7.1), the container holds the worktree and the lease (§6.9.6), substrate resolves the rest. This is the second of the two options the audit posed, and it validates making `--job` a workspace-*pointer* for read-only roles (Opportunity 2) as the step toward removing it. The current half-and-half state (`--job` as both workspace handle and liveness handle) is exactly what produced the six asymmetries; substrate commits to the clean side.
- **[rev-9 author] The containers-table migration shape aligns**, with one correction: the audit's suggested `opened_by: <first-job-id>` for legacy chains conflicts with substrate's model, where `opened_by` is *provenance* — immutable, normally a seed/node/operator (§2.6). For legacy chains with no seed it is acceptable as an approximation **only if marked "synthetic pre-substrate provenance"**, not conflated with the real provenance a seed will later write. Otherwise the mechanical migration (synthetic `kind: chain` container per chain-identity row, members re-linked via `container_id`) is correct, and the bridge's value holds: the alignment work makes the data already substrate-shaped, so migration is a rename pass, not a shim.

**Canonical reads-forward (retargeted to sections that now exist):**

| Bridge | Reads forward to (canonical, rev-9) |
|---|---|
| Opp 1 worktree lease | §6.9.6 worktree lease |
| Opp 2 READ_ONLY path-binding | §6.9.6 read-only steps don't acquire the lease |
| Opp 3 persisted chain shape | §6.9.2 resolved shape persisted; container row §13.3 (`resolved_chain_json`) |
| Opp 4 `sp chain review/approve/insert` | §6.9.5 composition gate + §11.1 `sb chain review/approve/insert` |
| Opp 5 step-bead conventions | §6.9.2 dual contract (change vs step) + §6.2.1 class |
| Opp 6 chain-derived naming | §6.9.7 names from membership |
| Opp 7 `--accept-stale-base --reason` | §6.4 precondition gate + channels.md §10.2 envelope |
| Opp 8 `step_completed` event | §3.1 daemon advances on `agent_end` (same payload) |
| Opp 9 composition-nudge YAML | §6.9.5 L1 nudges (same matcher) |
| `sp finalize` removal + `sp merge` diagnostic | §6.10 close-as-derivation |
| Hook hard-codes "the six workflows" | §6.9.10 the six shipped default templates |

**Four content adjustments applied to the body:**
- **R5 deduplicated** — the cwd-mismatch check appeared in both §5.3 and §7 (as R5); it is now one check, referenced from both.
- **[discipline] Opportunity 5 step-detection** — the `kind:step` **tag is the truth**; the `<role>:<root-id>` title pattern is only a *hint* for the hook proposing a template, never the source of the step-vs-root decision (substrate §6.9.7: the name is not the semantics).
- **D2 elevated to principle** — moving `tests_pass` off the executor onto an independent gate is not a small adjacent fix; it is the runtime application of "verification authority belongs to an independent gate, not the verified actor" (substrate §3.1 advance-on-persisted-evidence + §6.9.2 a gate is `done` only when *satisfied*).
- **Opportunity 3 JSON shape aligned** to `resolved_chain_json` (§6.9.2: Layer-1 steps + Layer-2 gates, reached/pending per step) so the migration is a true rename, not a content transform.

**[absorbed] Decisions D23–D27 (from the consolidated friction-audit work):**

- **D23 — `recommended_template` on the planner (§D of the reconciliation).** Pass-2 of the planner annotates each child root bead with `recommended_template: <one of the 13 formula names | on-the-run>`. Validated against live `bd formula list`. Proposal, not materialization — resolved at `sp chain review` / `bd mol pour`, not at planning time. **Prereq (D26)**: edit `config/specialists/planner.specialist.json` output_schema + update `config/skills/planning/SKILL.md` to teach Pass-2 — both required before D23 ships.
- **D24 — `sp chain <bead>` v0 shape.** Read-once, human-viewable + `--json` flag. `-f` follow mode deferred to a dedicated small-CLI/TUI design pass (naive repaint has the same flicker pattern as `sp ps -f`). **New chain-lifecycle events from Phases 1–3 surface in `sp log`** — every new event kind ships with its `sp log` formatter in the same PR; no event ships dark.
- **D25 — `xtrm-h9hqg` status.** **CLOSED 2026-05-27** (verified in xtrm-tools: bd auto-stage patch in `xt init`/`xt update`, dependency-maintenance checks, `--all-repos` sweep mode, tests, dist smoke). B-A1/A2/A3 done; B-A4/A5/A6 remain friction-audit-side (Phase 4 row 14).
- **D26 — Planner-spec + planning-skill prereq for D23.** Adding `recommended_template` requires: (a) `config/specialists/planner.specialist.json` — extend `output_schema` with `recommended_template: enum(<13 formula names> | 'on-the-run')` (validated against `bd formula list` at runtime); (b) `config/skills/planning/SKILL.md` — teach Pass-1 (epic + root beads) + Pass-2 (annotate each child root bead with `recommended_template`; do **not** materialize step beads at planning time — that's `sp chain review`'s job). **[absorbed D29]** `planning/SKILL.md` includes a "How to write a change-contract" section with 2 worked + 1 anti-example, CoT prefill template, and critique-before-commit pattern (premortem-style). Single PR; both files are package-tier, so direct JSON / Markdown edits per the CLAUDE.md gotcha. **[updated 2026-05-27]** Moved from Phase 3 row 11b to **Phase 0 (bootstrap)** rows 0.b/0.c — Phase 2 Pass-2 planning cannot run without D26 shipped. `config/skills/planning/SKILL.md` does not exist today as canonical (only `.xtrm/skills/default/planning/SKILL.md` deployed mirror); Phase 0 creates the canonical file.
- **D28 — Skills revamp: `using-specialists-v4` as new canonical (Phase 6).** After Phases 1–5 ship, the discipline has fundamentally changed (`--chain` replaces `--worktree`/`--job`; `sp chain review/approve` is composition gate; `kind:step` is label-as-truth; R-checks fire at dispatch; pull-not-push memory replaces auto-injection; sp epic is decoration-only). v3 was structured around the pre-roadmap mental model — patching it in place produces contradictory text. **v4 is created from scratch as the new canonical**, frontmatter `status: canonical (post-roadmap)`, **written in XML semantic structure** per Anthropic prompt-improving research (action-decision sections as `<workflow>` / `<prohibitions>` / `<smoke-checkpoints>` etc.). v3 is **frozen** with banner `status: legacy — superseded by v4`, preserved for cold-start sessions. Auto-mode mirrors v4. **[absorbed D29]** v4 includes an "Orchestration Discipline" section teaching contract-creation: CoT prefill + 2 worked + 1 anti-example for both root and step contracts; critique-before-commit pattern; explicit reference to the `contract-discipline.md` mandatory rule for the same content from the specialist-emitting side. **[absorbed 2026-05-29 from backlog]** v4 ALSO includes a new section "Issue relationship graph navigation" teaching specialists when and how to walk the **bd dependency edges** — `bd dep add <a> <b> --type <validates|informs|blocks-on|discovered-from|parent-child|related|supersedes|...>` and `bd dep tree <id>` for visualization. **Important framing:** v4 ships pre-substrate (Phase 6, months before substrate lands per §10.7), so the runtime concrete is bd-edges-on-bd-issues, not substrate's §6.7 9-edge relationship rows. The vocabulary is the same (bd's typed edges are what substrate §6.7 formalizes), so when substrate lands the skill prose stays valid by rename — bd issues become substrate issues, bd dep edges become substrate relationship rows. Concrete patterns v4 teaches today: reviewer runs `bd dep tree <root-bead>` to see `validates` predecessors and confirm gate ordering held; debugger walks `discovered-from` ancestry via `bd show <bead> --json | jq '.dependencies[] | select(.type=="discovered-from")'` to see what prior chain surfaced the bug; planner queries `parent-child` (epic → chain-molecule → step beads, per §13.3) to understand the hierarchy before composing; orchestrator-as-specialist queries `related` via `bd dep list <bead>` to find sibling work that might collide. The bd primitives are complete (already 9+ typed edge kinds, verified); the runtime gap is *teaching specialists to USE them fluently* — the backlog 28/05/26 critique "substrate manca tutto il sistema relationship tra issues, va meglio integrato con specialists" reframes accurately as a skills-layer gap (not a primitives gap, neither bd nor substrate side). **v4 is NOT gated on channels v0 or substrate landing** (those are months out, outside this roadmap); channels/substrate-aware surfaces live as a clearly-marked "Future surfaces" section inside v4. Future `using-specialists-v5` is the receiver when channels v0 ships, but it does not block v4.
- **D29 — Contract-creation discipline (CoT + multishot + critique-before-commit, XML structure).** All contract creators (planner Pass-1, orchestrator-as-specialist spawning follow-ups, executor spawning `discovered-from` beads, overthinker opening cleanup beads, Claude Code hook on `bd create`) must follow a uniform discipline when authoring change-contracts (root) or step-contracts (step beads). Rationale: contract quality is the highest-leverage point in the system — substrate §6.4 dispatcher refuses under-specified contracts; better contracts upfront = fewer refusal round-trips = faster chains end-to-end. The discipline has three components: **(a) chain-of-thought prefill** — draft contract inside `<thinking>` tags before commit, focusing on negative-space (NON_GOALS), falsifiable VALIDATION, glob-vs-file-list SCOPE; **(b) multishot in the meta-prompt** — 2 worked examples + 1 anti-example of common failure modes (e.g., "SCOPE glob too wide → matched 10 chains in dispatcher", "VALIDATION 'looks good' → unverifiable"); **(c) critique-before-commit** (premortem-style, Anthropic published pattern) — ask "what's WRONG with this draft" before committing, not "is this draft good". The discipline is **absorbed into existing items**, no new opportunity required: D26 planning skill (Phase 0), §4 Claude hook output (Phase 1), new mandatory rule `config/mandatory-rules/contract-discipline.md` (Phase 1, ~50 lines, wired into `template_sets` of the ~5 contract-creating specialists), D28 v4 SKILL Orchestration Discipline section (Phase 6). Substrate-aligned measurement: `dispatcher_refusal_rate` + `contract_revision_count` + `executor_clarification_request_count` are all queryable from existing observability tables; A/B compare pre/post Phase 1 ship to validate the discipline pays off.
- **D30 — XML-structured contracts (Opportunity 12).** Root and step bead contracts move from markdown-with-headers (today: `PROBLEM:` / `SCOPE:` / etc.) to **XML semantic tags inside the bd description text** (`<change-contract>` for root, `<step-contract>` for step). Three rationales: (1) substrate §6.4 Stage-1 validator (when it lands) parses XML deterministically — markdown-header-parsing is fragile (header level confusion, typos, ordering); (2) dispatcher `<scope>` lookup deterministic for matcher rules and scope-collision detection; (3) compliance research (Anthropic) shows LLM consumers (specialists reading the contract as task context) parse XML more reliably than markdown headers. **Final outputs of specialists remain JSON** (reviewer verdict, code-sanity, etc.) — consumed by orchestrator code via existing schema validators. **Channel messages (channels.md) remain JSON** — `body_json` discriminated-union per spec. **XML applies only to bd contract descriptions and to specialist task_template scaffolding (system_prompt stays free-form).** New beads (post-§4-hook ship) are XML; existing beads stay markdown (no retrofit). The 13 chain template `.formula.json` step.description fields are retrofitted once (~14 file edit). Sequenced Phase 3 as **Opportunity 12** (parallelizable, ~2 E-D-E / ~few hours wall-clock auto-mode). Substrate migration: `<change-contract>` ↔ substrate's contract row with same tag names — rename pass, no semantic transform.
- **D27 — Memory injection: push → pull (Opportunity 11), with type taxonomy.** Eliminate the runner-time auto-injection of `bd prime` + `.xtrm/memory.md` (~3.8k token irrelevant for most tasks per memory `bd-prime-context-overhead`). Replace with mandatory rule `config/mandatory-rules/memory-recall.md` that teaches specialists to query `bd memories <keyword>` / `bd recall <key>` scoped to their bead at startup and before key decisions. **[absorbed D28-XML]** The mandatory rule is written in XML semantic tags (`<at-startup>`, `<before-decisions>`, `<keyword-derivation>`, `<bd-prime-prohibition>`) for compliance per Anthropic prompt-improving research. **[absorbed 2026-05-29 from backlog.tasks.md]** The rule also declares a **memory type taxonomy** that specialists tag when calling `bd remember` (and that recall can filter on): `<memory type="error">` for gotchas / known failure modes, `<memory type="convention">` for codebase practices and patterns, `<memory type="identity">` for repo/role identity ("how the executor behaves in this repo, what it has learned about this place"), `<memory type="behavioral">` for observed orchestration-pattern preferences, `<memory type="best_practice">` for clean-close lessons (aligned with substrate §10.2 close-time distillation vocabulary). Recall priority at startup: convention > error > behavioral > identity > best_practice — conventions first because they prevent reinventing patterns; errors second because they prevent repeating bugs; behavioral guides orchestration choices; identity colors the felt-sense (per aws-summit "mob elaboration" insight); best_practice carries clean-close lessons forward. Reads forward to **substrate §10.2 memory-as-capability** which currently lists only failure/best_practice distillation types — substrate's chain coordinator close-time distillation pass would extend its vocabulary to write the same five types so runtime-query and close-time-write share one taxonomy. Rule joins the default `template_sets` for all package-tier specialists; opt-out allowed for tiny pre-scripted specialists if measurements show no benefit. Sequenced Phase 1 — independent, reversible, immediate token-budget win.

**[absorbed] Chain ≡ bd `molecule` mental model.** Where this audit speaks of "chain identity," the concrete bd realization is a **molecule**: `bd mol pour <formula>` creates an `issue_type=molecule` parent with one child bead per formula step (`parent-child` edges; `blocks` edges between siblings per `needs`). An **epic** is the *organizational parent above chains* — `--type=epic` + `--parent` holding multiple chain-molecules for one PRD/initiative. Nesting: top epic (organizational) → chain-molecule (per root issue) → step beads. Quick-chain variant: bare molecule with no organizational epic. Ultra-quick single-shot: a lone task bead (READ_ONLY only). Substrate migration mapping: organizational epic → container `kind: epic`; chain-molecule → container `kind: chain`; molecule's root child → substrate root issue; step beads → step issues (`parent-child`/`validates` edges pre-populate the step relationship). The bridge value: data is already substrate-shaped; migration is a rename pass. See §13 for the 13 evidence-backed formula files.

**[absorbed] Channels v0 subsumes Opportunity 8.** Per the handoff: **channels v0** (`docs/design/substrate/channels.md` §11) adopts a richer `kind=verdict` discriminated-union message that subsumes the event-only `step_completed` payload Opp 8 proposes. Opp 8 in this roadmap is therefore a **bridge until channels v0 ships**, not a permanent surface. When channels v0 lands, the `step_completed` event retires in favor of `verdict` + `finding` messages on the chain's channel (the reviewer-↔-executor loop runs end-to-end with no `sp resume` per channels.md §14 v0 acceptance). Until then, Opp 8 supplies the next-step recommendation that `sp result` / `sp chain <bead>` render — same data, simpler shape.

**[absorbed] Rev10 forward-references** (above what rev-9 supplied):
- **Chain coordinator (substrate §4.3)** is a transient standing brain of a chain — fresh-context participant spawned at composition completion (after `sb chain approve`, before the daemon dispatches step-1). Four roles: entry gate, borderline judge, hygiene coordinator (cross-chain via pulse), close-time judge. **Reads forward correction for Opp 4:** the substrate flow is `sb chain approve` → chain-coordinator `verdict: ready` (with policy-scoped step inserts permitted) → step-1 dispatch. Opp 4's `sp chain approve` is the bridge today; when chain-coordinator lands, the verdict step becomes mandatory between approve and step-1.
- **Memory-as-capability (substrate §10.2)** eliminates the memory-curator role entirely — every participant carries the memory-query extension; the chain coordinator distills new memory at close (failure / best-practice memories). Opp 11 D27 is the runtime application of the pull half of this principle today.
- **Chain-template declares its coordinator model (substrate §6.9.10)** — the 13 formulas in `docs/design/roadmap/chain-templates/` will eventually carry a `chain_coordinator` field naming the coordinator spec; for now they don't (the runtime is still single-orchestrator, no chain coordinator yet).

### Existing bd surface inventory (2026-06-02)

Discovered late via `bd help`: bd already implements primitives that several Opportunities propose to build ex novo. **Discipline going forward: every new sp-side primitive in this roadmap must justify why the existing bd primitive is insufficient.** When the bd primitive fits, the Opportunity reduces to a thin sp wrapper + auto-create wiring, not a new column/table on observability.db.

| bd primitive | What it does | Roadmap opp(s) that should use it | Notes |
|---|---|---|---|
| `bd merge-slot` (create / acquire / release / check) | Exclusive-access primitive with `metadata.holder` + priority-queued `metadata.waiters`. One slot per rig (`<prefix>-merge-slot`, labeled `gt:slot`). | **Opp 1** (worktree lease), **Opp 10** (chain auto-create) | Existing intentional reference in Opp 10 — the prior drill fix `unitAI-oa9aa` mistakenly rewrote it as "worktree lease via supervisor"; reverted in `unitAI-i2hot`. Opp 1's `worktree_lease_*` columns are likely **redundant** with bd merge-slot metadata. |
| `bd gate` (create / check / resolve / list / add-waiter) | Async wait conditions with typed gates: `human` (manual close), `timer` (timeout), `gh:run` (GitHub workflow), `gh:pr` (PR merge), `bead` (cross-rig). Phase rollout 1-4. | **Opp 4** (composition gate), **Opp 8** (step_completed → gate satisfaction), `bd gate add-waiter` covers reviewer-↔-executor loop substrate-style. | `bd gate check` is already the "advance on satisfied" mechanism Opp 8 proposes for the bridge. |
| `bd swarm` (create / list / status / validate) | "Structured body of work defined by epic + children with DAG"; epic-→-children with dependency graph. | **Opp 4** (chain composition), the molecule mental model in §0 | `bd swarm validate` checks DAG well-formedness — the composition pre-check Opp 4's `sp chain review` proposes. |
| `bd create --skills <list>` (field) | Required skills declared on issue. | **substrate §10.4** skills-as-capability bridge | No roadmap Opp uses it; D26/D29 talk about skill discipline but never reach for this field. |
| `bd state` / `bd set-state` | Multi-dimensional state (NOT just status open/closed); creates event + updates label. | **Opp 16** SCRUTINY, future state-dim work | SCRUTINY can be a state dimension instead of a contract field if substrate §6.6 chain-property model lands that way. |
| `bd wisp-type` (heartbeat/ping/patrol/gc_report/recovery/error/escalation) | TTL ephemeral patterns for short-lived issues subject to GC. | — | New paradigm; not yet referenced in roadmap. May be relevant for orchestrator-observability events. |
| `bd create` fields not yet leveraged: `acceptance`, `design`, `context`, `due`, `estimate`, `metadata` (custom JSON), `spec-id`, `waits-for` + `waits-for-gate` (fanout) | First-class fields separate from description/notes | **Opp 12** XML contracts proposes embedding much of this in description XML; `waits-for`/`waits-for-gate` may be a cleaner bd-native alternative to Opp 8's event-based hand-off. | The XML-in-description approach (Opp 12) may be reinventing native bd fields. Worth re-evaluating. |
| `bd federation` | Peer-to-peer federation between workspaces | — | Future cross-repo coordination (`unitAI-eoqxp.5`-shaped) may use this natively. |

**Direct consequence — three Opportunities pending re-evaluation:**
- **Opp 1** (worktree lease columns on chain-identity row) → almost certainly **subsumed by `bd merge-slot`** with sp adding only the molecule-id↔slot binding at auto-create time. The proposed observability.db columns are unnecessary if `bd merge-slot metadata.holder` and `metadata.waiters` are queried directly.
- **Opp 4** (`sp chain review/approve/insert` as composition gate) → can be reframed as **thin wrapper over `bd swarm validate` + `bd swarm create` + per-step `bd gate create`**. The CLI verbs stay sp-side for operator UX (`sp chain review` reads better than `bd swarm validate`), but the substance is bd-native.
- **Opp 8** (`step_completed` event) → can be reframed as **`bd gate add-waiter` + `bd gate check` polling**. Eliminates the need for a new `runner_event` kind on the sp side; bd is already the "gate satisfied → unblock" loop.

A flag bead (`unitAI-i2hot`'s sibling) tracks the per-opp re-evaluation. Implementation effort drops substantially if the re-evaluations land — Opp 1 from ~1 day to ~few hours; Opp 4 from 2 days to ~1 day; Opp 8 from ~1 day to ~few hours. Net runway gain ~2-3 E-D-E.

---

## 1. Architectural framing — six asymmetries and how rev-9 resolves them

### 1.1 The shape error in one sentence

The current specialists runtime treats *jobs* as first-class entities and *chains* as a derived projection over the job graph. Substrate's container model inverts this: containers are first-class, jobs (participants) are tenants of containers. Six concrete asymmetries fall out of the inversion, each grounded in code today and each resolved by a specific section of substrate revision 9.

### 1.2 The six asymmetries (code-verified)

**Asymmetry 1 — Executor is the privileged chain bootstrapper.** `chain-identity.ts:38–39`: the chain id defaults to the worktree-owner job id, which defaults to the job's own id. No `chains` table; the chain is computed by walking back to the worktree-owning job — in practice the first specialist dispatched with `--worktree` (by convention the executor). The CLAUDE.md gotcha *"--worktree and --job are mutually exclusive"* is the operator-facing surface of this. Killing the executor implicitly destroys the chain; a non-executor role wanting to *open* a fresh worktree must take the bootstrapper role.

**Asymmetry 2 — Worktree is owned by a job, not by the chain.** The worktree is created during first `sp run --worktree`; the owning job id is stamped via `worktree_owner_job_id`. When the job ends the worktree is not destroyed but is no longer owned by any live entity. Future specialists join via `--job <owner>`, even after the owner's pi session has gone to `waiting` — that's why keep-alive must hold the owner alive. Observed consequence: orphan worktrees trip the stale-base guard (mercury 2026-05-25).

**Asymmetry 3 — Chain has no first-class entity row.** No `chains` table; `chain_id`/`chain_root_job_id`/`chain_root_bead_id` are columns on jobs. The chain is reconstructed by aggregating jobs sharing `chain_id`. There is no place to attach chain-level state — resolved shape, scrutiny, collision matrix, budget, evidence index.

**Asymmetry 4 — Keep-alive paradox: pi session held alive because the workspace has no other persistence handle.** `--keep-alive` keeps the first specialist's pi session in `waiting` after `agent_end` so later specialists can `--job <owner>` in. The keep-alive pays for **workspace handle**, not LLM-state reuse. A reviewer chain that doesn't need executor resumability still holds executor's pi session in memory until `sp finalize` (operator-forgets-finalize = resource leak).

**Asymmetry 5 — `--bead` conflates work-contract with chain-key.** `sp run <role> --bead <id>` passes the bead as both **contract** (what to do) and **identity key** (`chain_root_bead_id`). SKILL Rule 7 then forces a *second* bead for reviewer/code-sanity, so the chain carries two beads: target + tracking. Structural conflation; produces the R4 friction.

**Asymmetry 6 — Reviewer-as-parasite: cannot exist without executor.** Reviewer must be dispatched with `--job <exec-job>` to enter the executor's workspace; without it, it runs in a clean checkout and sees no diff (R1). The runtime structurally encodes "reviewer is a follower of executor." A security-audit-only use case (review pre-existing code, a manually-applied patch, an external PR) has no place. Code-sanity, security-auditor, obligations-scanner share this parasite shape.

### 1.3 How substrate revision 9 resolves each

| Asymmetry | Rev-9 answer (canonical section) |
|---|---|
| 1 — Executor as bootstrapper | §6.9.5 chain composition is an explicit gate (`sb chain review`/`approve`); first dispatch is daemon-driven from the resolved shape. Executor is one step among others. |
| 2 — Worktree owned by job | §6.9.6 worktree **lease** — owned by container, acquired by writer-steps, released on quiescence. |
| 3 — Chain has no entity row | §6.9.2 resolved shape persisted as container state (`resolved_chain_json`, §13.3). |
| 4 — Keep-alive paradox | §6.9.6 lease releases on `agent_end` (§3.1 pi quiescence) — pi keep-alive decouples from workspace persistence. |
| 5 — `--bead` conflation | §6.9.2 dual contract: root carries the change-contract (5 sections), step carries the step-contract (mandate/inputs/outputs/scope/non_goals). |
| 6 — Reviewer-as-parasite | §6.9.6 read-only steps **do not acquire** the lease; they coexist with a writer or run alone. |

These resolutions are the target. §3 brings sp incrementally toward this shape without waiting for substrate.

---

## 2. Friction catalog with evidence

Four categories, ordered by observed cost (frequency × time-to-recover). **[recalibrated]** With a month-plus runway across ~10 repos, the recurring categories (A and B especially) accumulate cost daily — this is why the bridges that remove them repay well before substrate lands.

### 2.A Repo bootstrap / dirty-state breakage

| Tag | Friction | Evidence | Recovery cost |
|---|---|---|---|
| **A1** | `bd` per-write auto-export keeps `.beads/issues.jsonl` staged; `git checkout/reset/merge` aborts mid-orchestration; `sp merge` reports phantom conflicts | specialists 2026-05-26; gitboard 2026-05-26 (recurred 5×) | Multi-minute manual recovery + risk of `git reset --hard` wiping work |
| **A2** | `bd hooks install` silently no-ops when `core.hooksPath` set OR a non-bd pre-commit already at target | specialists 2026-05-26 Problems #4–5 | A1 recurs invisibly |
| **A3** | 8 repos with broken bd-dolt state where `bd config`/`bd doctor` refuse | specialists 2026-05-26 | Per-repo manual YAML edit |
| **A4** | Orphan worktrees from prior sessions trip the stale-base guard; forced `--force-stale-base` even when work IS on master | mercury 2026-05-25 (6 orphans; flag used for ALL dispatches) | Hours of noise; risk of bypassing real staleness |
| **A5** | `vitest`/`pytest` pick up duplicate test files from `.worktrees/` during repo-root runs | gitboard 2026-05-26 (`vitest.config.ts` exclude patch) | Mysterious failures that don't reproduce clean |
| **A6** | Third-party pre-push hooks (`osv-scanner`) crash inside worktrees; `git push --delete` blocked by export-state fixer | mercury 2026-05-25 | Memorized `SKIP=osv-scanner`/`gh api -X DELETE` per-repo |

A1/A2/A3 are addressed by `xtrm-h9hqg` (§0 #6). A4/A5/A6 remain friction-audit-side (§6).

### 2.B Orchestrator laziness

| Tag | Friction | Evidence | What SKILL.md says |
|---|---|---|---|
| **B1** | Reviewer skipped on "small" diff | gitboard 2026-05-26 (".66 one-char fix, reviewer skipped intentionally") | "small diffs hide the worst regressions... always escalate before skipping" |
| **B2** | Explorer/methodologist skipped on HIGH-blast "cause known" | mercury 2026-05-25 wave 4 (`lb9s`) | "When unsure, prefer extra explorer/debugger passes" |
| **B3** | No `specialists list --full` at substantial-task start | Inferred — no explicit invocations in dispatch sections | "MANDATORY on skill load and before every new substantial task" |
| **B4** | Invents flags that don't exist | gitboard 2026-05-26 (`sp finalize ... --skip-review`, no such flag) | "Do not rely on stale remembered flags" |
| **B5** | `--force-stale-base` as default escape valve | mercury 2026-05-25 (same flag for all dispatches) | precondition memory: verify clean status FIRST |
| **B6** | Hand-edits files marked "managed by tooling" | specialists 2026-05-26 (`.specialists/default/` edits in 15 repos) | "Never edit `.specialists/default/` by hand" |
| **B7** | Executor `--no-verify` + pulls unrelated files into commit | mercury 2026-05-25 (`7egg`) | Implicit |

### 2.C Wrong-diff / wrong-cwd dispatches

| Tag | Friction | Evidence | Severity |
|---|---|---|---|
| **C1** | cwd persistence across Bash calls — `cd <worktree>` leaves later commands inside it; `git reset --hard origin/main` wipes the executor branch ref | gitboard 2026-05-26 ("wiped the executor's commits") | **CRITICAL** — reflog-only recovery |
| **C2** | Chain dispatched on stale base when a prior sibling chain is unmerged → debugger-restitch loop | precondition memory; CLAUDE.md | HIGH |
| **C3** | Reviewer without `--job <exec-job>` → wrong diff | SKILL Rule 7 | HIGH — silent wrong verdict |
| **C4** | Bead `VALIDATION` narrower than pre-commit's test scope → surprise failures | mercury 2026-05-25 (`7egg`, 5 baseline regressions) | MEDIUM |

### 2.D Visibility gaps

| Tag | Friction | Evidence | What's missing |
|---|---|---|---|
| **D1** | Silent swallow / uncaught JSON.parse mask root causes | gitboard 2026-05-26 (forge-eorh.62) | Error events on the wire |
| **D2** | Executor self-reports `tests_pass: false` when tests pass | mercury 2026-05-25 | **Independent verification by a gate, not the verified actor** (see §3.2 / principle below) |
| **D3** | `sp merge` "Merge conflict" with no actionable info | gitboard 2026-05-26 | Diagnostic in the error message |
| **D4** | `sp run` success message minimal | Inferred | Structured post-dispatch hint |
| **D5** | No result-aware next-step suggestion | Inferred | Workflow-aware result formatter |
| **D6** | No "current chain state + next dispatch" surface | SKILL.md tries to teach it | `sp chain <bead>` timeline view |

**[discipline] D2 is a principle, not an adjacent fix.** "Executor reports its own test result" is the verified actor judging its own verification. Substrate §3.1 advances only on *persisted evidence*, and §6.9.2 makes a gate `done` only when *satisfied* — verification authority belongs to an independent gate (code-sanity / local-validation), never the executor. Moving `tests_pass` off the executor onto a gate's evidence is the runtime application of that principle, and it reads forward to substrate cleanly.

---

## 3. Substrate-aligned patch roadmap (the twelve opportunities)

Each opportunity (a) is implementable without the substrate daemon or `containers` table, (b) survives into rev-9 without rework, (c) closes a friction (§2) and/or removes an asymmetry (§1.2). The orthogonal layers (§4/§5/§6) sit at different layers and are described separately.

### 3.1 Summary table

| # | Patch | Friction | Asymmetry | Reads-forward (canonical rev-9) | Cost |
|---|---|---|---|---|---|
| 1 | Worktree lease shimmed onto chain-identity | C2 (partial), feeds A4 | 2 | §6.9.6 lease (move column job→container) | 1 day |
| **2** | **READ_ONLY specialists bind by path, decoupled from owner keep-alive** | **D6 (partial), B1+B2 indirect** | **4+6** | **§6.9.6 read-only steps don't acquire lease** | **1 day** |
| 3 | Persist resolved chain shape as data | D6 | 3 | §6.9.2 resolved shape; `resolved_chain_json` §13.3 | 2 days |
| 4 | `sp chain review/approve/insert` — composition gate | D4, D6, B1 | 1 | §6.9.5 + §11.1 (1:1 verb match) | 2 days |
| 5 | Step-bead conventions (`kind:step` tag) | R4 | 5 | §6.9.2 step-contract; §6.2.1 class | 1 day |
| 6 | Branch/worktree names derive from chain | naming part of (3) | 3 (partial) | §6.9.7 names from membership | 0.5 day |
| 7 | `--accept-stale-base --reason` + structured refusal | B5 | — | §6.4 precondition gate + channels.md §10.2 | 0.5 day |
| 8 | `step_completed` event + next-step recommendation | D4, D5 | bridge | §3.1 daemon-advances-on-agent_end | 1 day |
| 9 | Composition-nudge YAML — **[adjusted: external selection-config, not formula sections]** `applies_when` is not a `bd formula` field (silently dropped by the bd binary); the nudge matcher lives in a separate selection-config file consumed by §4 hook + `sp chain review`. One matcher language across the system, applied at the selection layer (substrate §6.9.5 L1 nudges are a lookup table at the composition gate, not part of any template). | B2 | — | §6.9.5 L1 nudges (selection layer) | 1 day |
| **10 [absorbed]** | **`--chain <molecule-id>` redesign: deprecate `--worktree` and `--job`; chain-identity-driven dispatch with implicit worktree provisioning for write-capable specialists + cwd dispatch for READ_ONLY single-shot; write-capable WITHOUT `--chain` is REFUSED (closes existing safety hole where default cwd dispatch could write to master).** Verbs use the molecule id as the chain handle. | A4, C1, prevents R1/R2 entirely | **1 + 2 + 6** | **§6.9.5 + §11.1 dispatch surface (1:1 with `sb dispatch --container <id>`); workspace-identity-internal commitment (§0 D21 / handoff)** | **2 days** |
| **11 [absorbed]** | **Pull-not-push memory recall: eliminate runner-time auto-injection of `bd prime` + `.xtrm/memory.md` (~3.8k token); replace with mandatory rule `memory-recall.md` teaching specialists to query `bd memories <keyword>` / `bd recall <key>` scoped to their bead.** Wins ~3.8k/spawn × 8–15 dispatches/session = 30–60k token budget freed per session. | new D7 (memory-injection waste; memories `bd-prime-context-overhead`, `specialist-runner-injects-xtrm-memory-md-bd-prime`) | — (philosophical alignment) | **substrate §10.2 memory-as-capability (memory-curator role eliminated; participants carry memory-query extension; chain coordinator distills at close)** | **1 day** |
| **12 [absorbed]** | **XML-structured contracts everywhere it pays off**: root beads use `<change-contract>` XML in `bd` description (created by §4 hook + planner); step beads use `<step-contract>` XML (created by §4 hook + chain-template pour + `sp chain insert`); 13 chain-template `.formula.json` step.description retrofit (one-time edit); package-tier specialist `task_template` scaffolding XML (system_prompt stays free-form). **Final outputs stay JSON; channel messages stay JSON** — XML applies only to contracts + task scaffolding. | new D8 (markdown-header-parsing fragility); enables D29 discipline measurement | — (alignment) | **substrate §6.4 Stage-1 validator parses XML natively; `<change-contract>` ↔ substrate contract row is rename pass** | **2 days** |

**Total ~15 days for Opportunities 1–12.** Sequencing in §10.

> **Post-table additions (2026-05-31).** Opportunities 13, 14, 15, 16 were added after this summary table and are described in §3.2 below — Opp 13 (sp stop --all / sp chain stop, `unitAI-1p0s5`), Opp 14 (canonical-pipeline completion, **[shipped]** via `unitAI-sfwe1`), Opp 15 (seconder fusion, **[shipped]** via `unitAI-4e194`), Opp 16 (SCRUTINY enforcement, in-flight via `unitAI-3l0ac`). A 17th initiative — sp merge / sp epic merge / sp finalize rework — is filed as `unitAI-lyh1b` (kj651 child); described in §10.5 Phase 5 row 19 + replaces the prior dirty-index-diagnostic scope. All five are kj651 parent-child children.
>
> **Post-table addition (2026-06-02; stable bridge shipped 2026-06-02).** Opportunity 18 — adopt the **5-layer identity model** (`participant_kind` / `participant_role` / `participant_id` / `job_id` / `turn_id`+`tool_call_id`+`event_id`) in observability + envelope, replacing the current conflation of `specialist_id` (a bounded role name) with run identity. Substrate is under-specified on per-activation identity (no Run/Activation entity in §2.1); this opp pins the canonical schema bridge-side. **Pre-substrate bridge status:** shipped for `xtrm.forensic.v1` envelopes, persisted `specialist_forensic_events`, `sp forensic`, `sp feed/log --json` additive `forensic_event`, and `sp metrics --prometheus` low-cardinality projection. Remaining substrate-era work is broader source-family coverage and eventual re-home into substrate state/events. Tracking beads: `unitAI-60w93.8`–`.15` (bridge stabilization) plus `unitAI-n2px1` (identity alignment). Co-supersedes the (wrong) Opp 18 framing previously on the feature branch (`specialist_id → participant_id` rename), which conflated role with instance.

### 3.2 Per-opportunity detail

**Opportunity 1 — Worktree lease shimmed onto chain-identity.** Add `worktree_lease_held_by` + `worktree_lease_state` to the chain-identity/status row (today jobs; later containers). Writer-step (executor, debugger) + lease `free` → acquire on dispatch, release on `agent_end` (supervisor.ts:1658). Writer-step + lease `held` → queue (`WAIT: lease held by <job>`). Read-only step → do not touch the lease; bind to the path (Opp 2). Closes Asymmetry 2 + much of 4/6; `--worktree`/`--job` mutual-exclusion becomes derivable from lease state. **Reads forward:** §6.9.6 *is* this column moved job→container; migration is rename + ownership transfer.

> **[2026-06-28 ownership note — specialists-05q.5].** Lease arbitration itself is **not owned by specialists**. Container/worktree leasing belongs to **bd merge-slot / substrate lease** (substrate §6.9.6, exposed today via `bd merge-slot` semantics). Specialists does **not** introduce new `sp lease*` columns; the runtime row carries a foreign-key-style pointer to the lease owner (today: the chain-identity row references the bd-side slot; tomorrow: `containers.lease_*` per substrate). Specialists' role is to *observe* and *surface* lease state in `sp ps` / `sp doctor` / job feed, never to hold or arbitrate it. See §B for the full ownership split.

**Opportunity 2 — READ_ONLY specialists bind by path, decoupled from owner keep-alive.** Today reviewer/code-sanity via `--job <owner>` requires the owner alive (waiting) — for the *workspace handle*, not LLM-state. Patch: when the dispatched specialist is `permission: READ_ONLY`, runner binds to the worktree **path** stored on `--job <owner>` (read once, cached) instead of requiring the owner live. Owner can be `done`/`closed`/killed; the read-only reviewer enters on its own pi session, reads the diff against the lease base, produces evidence. `--job` becomes a **workspace pointer**, not a **liveness pointer**, for read-only roles. Closes Asymmetry 6 + reduces the forgotten-`sp finalize` leak. **Reads forward:** §6.9.6 read-only steps don't acquire the lease and don't require a writer live — identical semantics; when containers land the lookup target moves job→container, surface identical. **This is the highest-leverage runtime patch. Land first.**

**Opportunity 3 — Persist resolved chain shape as data.** Add a thin `chain_shapes` table (or `~/.specialists/chains/<chain-id>.json`). **[adjusted] The shape matches `resolved_chain_json` (§6.9.2): Layer-1 domain steps + Layer-2 overlaid gates, reached/pending per step** — so migration is a true rename, not a content transform:

```jsonc
{
  "chain_id": "unitAI-abc12",                  // bd molecule id per §0 absorbed model + Opp 10 — NOT a branch name
  "template_name": "code-standard",          // one of the six §6.9.10 defaults
  "resolved_steps": [                          // Layer-1 + Layer-2, in resolved order
    { "role": "executor",            "class": "step",  "status": "completed", "job_id": "cc5fcc" },
    { "role": "code-sanity",         "class": "gate",  "status": "completed", "job_id": "d6eacc", "mandatory": true },
    { "role": "obligations-scanner", "class": "gate",  "status": "completed", "job_id": "...",    "mandatory": true },
    { "role": "reviewer",            "class": "gate",  "status": "running",   "job_id": "7b3775" }
  ],
  "composed_at_ms": 0,
  "composed_by": "orchestrator:auto"           // or "operator:explicit"
}
```

Written when the first step dispatches (or via `sp chain review`, Opp 4); updated as steps run. Closes Asymmetry 3; unlocks `sp chain <bead>` as a primary-key lookup; lets the daemon-advances promise (§3.1) work at small scale today. **Reads forward:** §6.9.2 resolved shape on the container — rename column, attach to container row. The `class`/`mandatory` fields are already substrate-shaped (§6.2.1 / §6.9.3).

**Opportunity 4 — `sp chain review/approve/insert` as the composition gate.** **[adjusted: verbs match substrate]** Resolves the chain shape before any `sp run`:

```
$ sp chain review forge-eorh.48
Resolved template: code-standard (matched type=task, scrutiny=medium, scope=production)
  1. executor              (~3-6m)
  2. code-sanity           (~1-3m)   [mandatory gate, READ_ONLY]
  3. obligations-scanner   (~30s)    [mandatory gate, READ_ONLY]
  4. reviewer              (~2-4m)   [scrutiny may auto-escalate]
Run `sp chain approve forge-eorh.48` to execute.
Run `sp chain insert forge-eorh.48 --role <r> --before <step>` to modify.
```

The shape is persisted (Opp 3) on approve; dispatch follows it. Closes Asymmetry 1 — composition is an explicit action *before* any role is dispatched; the executor is no longer special, just the first step the resolved template happens to start with. **Reads forward:** §6.9.5 / §11.1 `sb chain review/approve/insert` are this command shape 1:1; migration is `sp`→`sb` only. **`sp chain <bead>` accepts root beads only** (per §0 #1), refusing step-beads with a hint to the root — this preempts Asymmetry 5 at the CLI surface.

**[discipline] Shape persistence timing (resolves a minor Opp 3 / Opp 4 inconsistency).** Three write moments on the resolved-shape row, none overlap: (a) `sp chain review` writes the *draft* shape with `composed_at_ms: 0` + `composed_by: null` — mutations via `sp chain insert` are permitted while draft; (b) `sp chain approve` *finalizes* the row by stamping `composed_at_ms` + `composed_by` and freezing the step list (further mutation requires a new review); (c) per-step runs *update* the `status`/`job_id` columns on existing rows but never the list shape. This makes draft-vs-approved distinguishable in the persisted state, matching substrate §6.9.2 / §6.9.5's two-stage gate.

**[discipline] INVARIANT — bd `kind:step` tag ↔ resolved-shape `class` field must agree.** The bd-side label (`kind:step` tag on a step bead per Opp 5) and the sp-side shape entry's `class` field (`"step"` / `"gate"` / future kinds per substrate §6.2.1) are two representations of the same fact. **`sp chain insert` is the sole atomic writer** for the bridge — it pours the step bead with the `kind:step` tag AND appends the shape entry with the corresponding `class` in one transaction. Manual `bd update --tags kind:step` outside `sp chain insert` is **unsupported in the bridge** (would leave the shape stale; no reconciler). The auto-create path (Opp 10) MUST go through `sp chain insert` or its programmatic equivalent. Post-substrate this invariant is trivially preserved because there is one entity (the issue row carries `class` directly per §6.2.1); the bridge maintains it manually.

**Opportunity 5 — Split step contracts from root contracts in bd.** Convention + tooling, not schema change. A **root bead** uses the change-contract sections (`PROBLEM/SCOPE/NON_GOALS/VALIDATION/ACCEPTANCE`). A **step bead** uses `MANDATE/INPUTS/OUTPUTS/SCOPE/NON_GOALS`. **[discipline] The `kind:step` tag is the authoritative discriminator** — the truth lives in the tag, never in string-parsing. The title pattern `<role>:<root-id>` is only a *hint* the Claude Code hook (§4) uses to *propose* the step-contract template; it is never the source of the step-vs-root decision (substrate §6.9.7: the name is not the semantics, membership/metadata is). SKILL.md teaches the distinction; existing reviewer/code-sanity tracking-beads migrate lazily as touched. Closes Asymmetry 5. **Reads forward:** §6.9.2 dual-contract is this split as schema; each step bead becomes a `class: step` issue (§6.2.1) with its step-contract populated.

**Opportunity 6 — Branch/worktree names derive from chain identity.** Switch the writer-branch to `chain/<bead-id>` (no role suffix); worktree `.worktrees/chain-<bead-id>`. If a debugger takes over post-executor (Opp 1 handoff), the branch name doesn't change — the current-writer role moves through the same branch. Closes part of Asymmetry 3. **Reads forward:** §6.9.7 names are `wt/epic-<id>/chain-<id>` — extends `chain-<id>` cleanly when epics land.

**Opportunity 7 — `--accept-stale-base --reason` + structured refusal envelope.** Rename `--force-stale-base` → `--accept-stale-base --reason "<text>"` (required, logged). **[per §0 #3: grace period — old flag accepted with deprecation warning for a release or two.]** Refusal envelope gains structured fields matching channels.md §10.2:

```jsonc
{ "ok": false, "error_code": "stale_base",
  "blocked_by": ["sibling chain feature/forge-eorh.40 unmerged"],
  "next_safe_action": "diagnose | accept | abandon-chain",
  "diagnose_command": "git log --oneline <sibling-branches> ^master" }
```

`--force-` taught "this is normal, override"; `--accept- --reason` makes it deliberate and audit-traceable. Closes B5. **Reads forward:** §6.4 precondition gate (precondition violation, not §5.10 recovery); the envelope matches channels.md §10.2; `--accept --reason` survives into `sb dispatch --allow-unready --reason`. **Stretch (non-blocking):** patch-id equivalence detection in `evaluateMergeWorthiness` — if the sibling's commits are patch-id-equal to commits already on master under a different SHA, the guard does not fire (addresses the over-fire root cause, §9.2).

> **[2026-06-28 extension — specialists-05q.5, absorbs `specialists-05q.3`].** The stale-base gate also owns **fetch-and-pin base SHA** semantics — this is *not* a separate opportunity, it lives inside Opp 7. On dispatch the runtime runs `git fetch <remote> <base-branch>` once, resolves the tip to a SHA, and records that SHA on the chain-identity/observability row as `base_sha_pinned` + `base_sha_pinned_at_ms` (durable migration shape in §B). All subsequent staleness checks compare against the *pinned* SHA, not a re-read of `origin/master` HEAD — this eliminates the "base moved mid-chain → false stale" race that drove most over-firing. `--accept-stale-base --reason` continues to override; the refusal envelope gains `base_sha_pinned`, `base_sha_observed`, `commits_behind` fields. **Specialists owns the pinning** because it is a *job-observability* fact (which SHA this run measured against); the *fetch primitive* itself remains in xt (xtrm-tools epic `xtrm-lk4on`). No new bd column, no new substrate entity — pinning is an additive column on the existing job/observability row, mirrored later as `containers.base_sha_pinned` per the §B migration table.

**Opportunity 8 — `step_completed` event with next-step recommendation.** On pi `agent_end`, extend the status row: look up Opp 3's resolved-shape row, find the just-completed step, compute the next from the template, emit `runner_event` kind `step_completed` with `{ completed, next, next_dispatch_command }`. `sp result` (§5.2) and `sp chain` (Opp 4) read it. **[recalibrated/principle]** This is also where **D2** lands: the `step_completed` for an executor carries the executor's *claimed* result, but the chain does not advance on it — it advances when the **independent gate** (code-sanity/local-validation) persists its verdict (§3.1). The executor's self-report is informational; the gate's evidence is authoritative. **[absorbed — bridge until channels v0]** Per `channels.md` §11, the channels-v0 `kind=verdict` discriminated-union message subsumes this event; when channels v0 ships, `step_completed` retires and the reviewer-↔-executor loop runs end-to-end via `verdict` + `finding` channel messages with no `sp resume`. Opp 8 supplies the same next-step recommendation in event form until then.

**[discipline] Bridge-era restitch is manual-orchestrator-driven.** Substrate §3.1 has a daemon that auto-advances on member `agent_end` from persisted evidence — that's the target state. The bridge has **no daemon**. So when a gate produces a regression-finding verdict and the resolved-shape (Opp 3) says the next step is `debugger`, the `step_completed.next_dispatch_command` is a **recommendation**, not a trigger — the orchestrator (Claude/human/auto-mode harness) reads it via `sp chain <bead>` or the event stream and **executes the `sp run` manually**. Lease handoff is automatic (executor agent_end → lease free → debugger acquires per Opp 1), but the *invocation* is orchestrator-side until substrate's daemon takes over. This keeps the restitch loop honest in the bridge and avoids inventing a half-daemon that would later need to be unwound.

**Reads forward:** §3.1 daemon advances on member `agent_end` from persisted evidence — and ultimately channels v0 `verdict` message. The orchestrator-side dispatch step disappears when the daemon lands; the recommendation field becomes the input to the daemon's compute-next-step routine.

**Opportunity 9 — Composition-nudge selection-config.** **[adjusted]** A separate selection-config file (e.g. `~/.config/specialists/composition-nudges.yaml`) with `applies_when` matchers (reusing the matcher substrate uses everywhere, §5.2/§6.9.3) producing "consider X because Y" hints. **Not** a `bd formula` section — `applies_when` is silently dropped by the bd binary (verified). Consumed by `sp chain review` (Opp 4) and the Claude hook (§4). Informational, not refusal — raises the question, preserves orchestrator judgment. Closes B2. **Reads forward:** §6.9.5 L1 nudges are the same table evaluated by the composition gate at the selection layer; today's selection-config is the schema substrate adopts as-is.

**Opportunity 10 [absorbed] — `--chain <molecule-id>` redesign; deprecate `--worktree` and `--job`.** A single chain-identity verb replaces the `--worktree`/`--job` flag pair; flag semantics derive worktree behavior from chain state. **This is the runtime adopting substrate's identity model early** (§0 D21): substrate makes operations container-scoped — workspace identity is internal, never a first-class API handle. `--chain` IS the container handle in the bridge; `--job`-as-workspace-handle dissolves.

Surface: `sp run <role> --chain <molecule-id> --bead <bead-id>`. Decision tree:

```
chain (molecule) exists in bd?
├── NO
│   └── specialist permission?
│       ├── READ_ONLY: refuse → "chain <id> doesn't exist; create it via `bd mol pour` or `sp chain review`"
│       └── MEDIUM/HIGH: auto-create
│           ├── `bd mol pour <inferred-formula>` (auto-resolve via Opp 9 nudges; default code-standard)
│           ├── `sp chain wire-edges <molecule-id>` post-pour helper applies semantic edges (validates/informs/...) — **[throwaway shim — see note below]**
│           ├── provision worktree .worktrees/chain-<molecule-id>
│           ├── `bd merge-slot create` + `bd merge-slot acquire` for the molecule (Opp 1) — bd's existing exclusive-access primitive; sp does NOT invent a parallel lock
│           └── dispatch
│
└── YES (molecule + merge-slot exist; merge-slot metadata has worktree_path)
    └── specialist permission?
        ├── READ_ONLY: bind by path (no merge-slot acquire — Opp 2), dispatch
        └── MEDIUM/HIGH:
            ├── merge-slot free → `bd merge-slot acquire`, dispatch
            └── merge-slot held → queue (refuse "WAIT: merge-slot held by <holder>; will dispatch on release")

sp run <role> --bead <bead-id>          # no --chain
└── permission?
    ├── READ_ONLY: dispatch in cwd (single-shot ephemeral investigation; current behavior preserved)
    └── MEDIUM/HIGH: REFUSE → "write-capable specialists require --chain <id> for safety. Use --chain X to bind to existing or auto-create."
```

Closes Asymmetries **1 + 2 + 6** by inversion (any specialist can dispatch first into a `--chain` that auto-creates; worktree path lives on the chain-identity row, not on the bootstrapping job; reviewer + `--chain X` enters the worktree without needing executor live). Also closes **A4** (orphan worktrees: bound to molecule, reaped on chain close) and **C1** (no more `--job` cwd-mismatch path since `--job` is gone). Closes the **existing safety hole** where dispatch without `--worktree` or `--job` ran in `process.cwd` — for write-capable specialists this could write to master directly; the "MEDIUM/HIGH refuses without --chain" rule closes the gap explicitly.

**[discipline] `sp chain wire-edges` is a throwaway shim, not a rename target.** Unlike every other bridge surface that migrates `sp` → `sb` as a rename pass, `sp chain wire-edges` has no substrate equivalent — substrate creates relationship rows natively at composition time (§6.7 9-edge relationship vocabulary; `sb chain approve` + the chain coordinator §4.3 wire edges as part of the lifecycle). The bridge shim exists *only* because `bd mol pour` produces the parent-child skeleton but not the richer `validates`/`informs`/`discovered-from` edges the canonical pipeline relies on. When substrate lands, `sp chain wire-edges` is **deleted**, not renamed. Implementers: keep the helper minimal — pure mechanical edge-application from a static mapping (formula step `class` → fixed edge kind), no inference logic that would need to be replicated server-side later.

**Grace period (1 release per D14):** `--worktree` and `--job` accepted with stderr deprecation warning, auto-resolving to `--chain <id>`. Hard-cut afterward. **Reads forward:** §6.9.5 + §11.1 `sb dispatch --container <id>` — verb shape identical, `--chain` (bd-molecule today) → `--container` (substrate-container tomorrow). Mechanical rename.

**Cost: ~2 days.** Includes flag handling, deprecation warnings, integration with Opportunity 1+2 (`bd merge-slot` wiring) + Opp 3 (mol pour) + Opp 6 (chain-derived worktree naming).

**Opportunity 11 [absorbed] — Pull-not-push memory recall via mandatory rule.**

**Problem today.** `runner.ts` injects `.xtrm/memory.md` + `bd prime` output at the spawn of **every** specialist — ~3.8k tokens (memories `specialist-runner-injects-xtrm-memory-md-bd-prime`, `bd-prime-context-overhead`). Most injected memories are irrelevant to the current task scope; small specialists (code-sanity, obligations-scanner, doc-sync) are penalized disproportionately because the irrelevant-memory percentage is enormous against their natural budget.

**Patch.**

1. **Remove** from `runner.ts`'s prompt-builder the auto-injection of `bd prime` + the full dump of `.xtrm/memory.md`.
2. **Add** a new mandatory rule `config/mandatory-rules/memory-recall.md` (~30 lines) teaching the specialist:
   - **At startup**, identify 2–4 keywords from the bead (PROBLEM/SCOPE/title keywords) and run `bd memories <keyword>` for each. Typical keywords: subsystem name, operation type (merge/migration/auth/...), critical file names.
   - **Before relevant decisions** (approach choice, refactor that changes API, non-trivial operation), run a second targeted round on the upcoming decision.
   - **`bd recall <key>`** to fetch the full payload of a specific memory seen in a `bd memories` result.
   - **Do not** scroll the full `bd memories` output if >10 results — refine the keyword.
   - **Do not** invoke `bd prime` (session-bootstrap command, not for specialist runtime).
3. **Wire**: the rule joins the default `template_sets` for all package-tier specialists (`config/specialists/*.specialist.json`). Tiny pre-scripted specialists (`obligations-scanner`, `changelog-drafter`) may opt out explicitly if measurement shows no benefit.

**Why.** Philosophical alignment with substrate's **memory-as-capability (§10.2)**: the memory-curator role is eliminated; the **chain coordinator distills new memory at close** (failure / best-practice). Opportunity 11 brings the *pull half* into today's runtime: knowledge is already queryable (`bd memories` is fulltext-indexed), just stop pushing it indiscriminately and teach targeted pull.

**Expected savings.** ~3.8k tokens × every spawn. On a typical session of 8–15 dispatches, 30–60k tokens of budget freed for evidence (code, diff, tool results). For haiku/mini specialists the relative gain is highest (3.8k on 200k window = 1.9%, but on a naturally-small 20k task = 19%).

**Risk mitigated.** "Specialist may not call `bd memories` and fall into known bugs" — the mandatory rule is structured as *obligation at startup* (not optional), with concrete examples. Mandatory rules land in the system-prompt tail where compliance is high. Measurable via `bd memories <keyword>` tool-call rate in `specialist_events` post-rollout — gate the review if rate <80% on non-trivial tasks.

**Reads forward.** substrate §10.2 memory-as-capability + chain-coordinator distillation. The substrate dispatcher (§6.4) can precompute a scoped `memory_pack` per step-issue (the Graphify/TaskPrep evolution); the natural next step is dispatcher-injected scoped pack instead of agent-queried pull. Today's pull-not-push is the correct bridge — the dispatcher of tomorrow does not re-introduce the indiscriminate push.

**Cost: ~1 day.** Runtime-injection removal (~30 LOC), new mandatory-rule file (~30 lines), add to `template_sets` of ~14 package-tier specialists (direct JSON edits per CLAUDE.md gotcha). No new APIs, no new infrastructure — just policy expressed as a rule + runtime-code removal.

**Sequenced Phase 1.** Independent, reversible (re-add the injection), measurable A/B in 2–3 sessions.

**Opportunity 12 [absorbed] — XML-structured contracts (Phase 3).**

**Problem today.** Root and step bead contracts are markdown-with-headers (`PROBLEM:` / `SCOPE:` / etc.). Two costs: (1) the §6.4 Stage-1 validator (when substrate lands) has to parse this fragile shape — header-level confusion, typos, ordering — to confirm required fields are present and SCOPE matches dispatcher rules; (2) LLM consumers (specialists reading the contract as task context) parse XML semantic tags more reliably than markdown headers per Anthropic prompt-improving research (memory `prompt-improving-skill`).

**Patch.** Move contracts to XML semantic tags inside the bd description text. Three rules of scope:

- **What goes XML:** bd contract descriptions (`<change-contract>` for root, `<step-contract>` for step), specialist `task_template` scaffolding (the per-call task block, not the system_prompt which stays free-form for model flexibility).
- **What stays JSON:** final outputs of specialists (reviewer verdict, code-sanity verdict, planner Pass-2 `recommended_template`, etc.) — consumed by orchestrator code via existing schema validators; channel messages (`body_json` discriminated-union per channels.md §5.1).
- **What stays markdown:** SKILL.md files (human-readable; though XML scaffold inside specific action-sections is allowed per D28 v4), system_prompt fields, free-form notes.

**Concrete contract shape:**

```xml
<change-contract issue-id="forge-eorh.74" type="bug" scrutiny="high">
  <problem>Auth retry leaks credentials in logs at line src/auth/retry.ts:84</problem>
  <scope>
    <path>src/auth/retry.ts</path>
    <path>src/auth/__tests__/retry.test.ts</path>
  </scope>
  <non-goals>
    <item>Refactor auth subsystem more broadly</item>
    <item>Change retry semantics (backoff/limits)</item>
  </non-goals>
  <validation>
    <criterion>tests/auth/retry.test.ts passes new test case "credential not in error message"</criterion>
    <criterion>grep -r "console.log.*token" src/auth/ returns zero matches</criterion>
  </validation>
  <acceptance>
    <criterion>reviewer PASS verdict on the chain</criterion>
    <criterion>code-sanity OK verdict</criterion>
  </acceptance>
</change-contract>
```

Step contract analogous shape: `<step-contract>` with `<mandate>` / `<inputs>` / `<outputs>` / `<scope>` / `<non-goals>` children.

**Scope of edits.**
- §4 Claude hook (`bd-create-hint.sh`) emits XML contract scaffold at `bd create` time (new beads only).
- Opp 5 step-bead conventions: the `kind:step` template is `<step-contract>` XML.
- 13 chain template `.formula.json` step.description fields retrofitted to XML (one-time, ~13 file edit).
- ~14 package-tier specialist `task_template` fields wrapped in XML scaffold (`<task>` with `<inputs>` / `<process>` / `<output-contract>`).
- Existing beads stay markdown — no retrofit. Migration is forward-only.

**Why.** (1) Substrate-aligned: §6.4 Stage-1 validator parses XML deterministically — no regex-on-markdown fragility. (2) Substrate migration: `<change-contract>` ↔ substrate's contract row with the same tag names is a rename pass, not a content transform. (3) LLM compliance: specialists reading a contract as task context produce higher-quality work per the Anthropic research.

**Why NOT extend to channels / final outputs.** Channels are schema-validated machine messages; JSON discriminated-union (channels.md §5) gives strict shape without parsing fragility — XML would add complexity without benefit. Final outputs of specialists are consumed by orchestrator code via existing extractors (`extractReleaseDraft`, `finalize.ts` verdict regex); switching to XML breaks them. Hybrid is right: XML for human-and-LLM-read text (contracts, prompts), JSON for machine-to-machine schemas.

**Measurement.** Substrate-aligned A/B via observability tables:
- `dispatcher_refusal_rate` (when §6.4 Stage-1 validator lands)
- `contract_revision_count` (how many edits between bd create and first successful dispatch)
- `executor_clarification_request_count` (specialists stopping to ask "what does SCOPE mean here?")

Pre-Phase-3 vs post-Phase-3 ship.

**Cost: ~2 E-D-E (~few hours wall-clock auto-mode, parallelizable with other Phase 3 items).** Hook output extension, 13 chain template edits, ~14 specialist task_template wraps. All file-disjoint.

**Reads forward.** Substrate §6.4 Stage-1 validator parses XML natively; §6.9.2 contract row uses the same tag schema. When substrate lands, the migration is `bd description XML` → `substrate contract row XML` — same content, attached to a container row instead of a bd issue.

---

**Opportunity 13 [absorbed] — Chain-scoped job termination: `sp stop --all` + `sp chain stop <chain-id>`.** *(Bead: `unitAI-heukb`.)*

**Problem today.** At chain completion the operator has N waiting/done specialist jobs (keep-alive executors, reviewers, advisors) that must be torn down one-by-one via `sp stop <job-id>` after looking each one up in `sp ps`. When two or more chains run concurrently in the same repo, no command targets jobs of a specific chain — operator manually filters `sp ps` output, copies job ids, runs `sp stop` per job. This is the operator-procedural compensation for the absent chain-as-entity model (Asymmetry 3); same shape as `sp finalize` (§9).

**Patch.** Two thin CLI additions, both reusing the existing `stopJob()` path (terminal-status-before-SIGTERM, flush handoff, persist) so semantics match per-job `sp stop`.

**`sp chain stop <chain-id> [--dry-run]`** — terminate every job (running, waiting, starting) whose `chain_id` matches. Resolved via existing chain-identity walk (`chain-identity.ts`); after Opp 10 lands this reads the chain row directly. Cross-chain-safe by construction (filter is the chain id), so it is the **default** verb whenever any concurrent work exists in the repo.

**`sp stop --all [--dry-run] [--yes]`** — the "blast radius" verb, with hard guardrails:

- **Scope of kill:** terminates `waiting` and `starting` jobs in the local observability DB. `done`/`error`/`cancelled` are already terminal (no-op, surfaced as "skipped N terminal"). **`running` is never touched by `--all`** — running jobs mean other work is in flight, and `--all` must refuse rather than interrupt them.
- **Refusal rule (sole-orchestrator gate):** if any job in the current repo is `running` OR belongs to a `chain_id` other than the orchestrator's current chain context, the command **refuses** with a structured envelope:
  ```
  refused: sp stop --all requires sole-orchestrator state.
  found 2 running job(s) and 4 waiting job(s) across 2 chain(s):
    chain forge-eorh.74 — 1 running, 2 waiting
    chain forge-eorh.81 — 1 running, 2 waiting
  use: sp chain stop <chain-id> for chain-scoped termination
  ```
- **`--yes`** skips the loud-preview confirmation prompt; it does NOT bypass the refusal rule.
- **`--dry-run`** prints the would-stop set without acting.

Both verbs surface counts (`stopped 7 waiting, skipped 3 terminal, refused 1 running in other chain`) and respect the keep-alive flush path so bead notes get the final handoff block before terminal transition.

**Why this asymmetry between the two verbs.** `sp chain stop` is *targeted* and *cooperative* — it cannot affect work outside its filter, so it has no guardrails beyond the chain id. `sp stop --all` is *unscoped* and operates on the global repo DB, so it must (a) refuse to kill running work (the operator wasn't asked) and (b) refuse when not sole orchestrator (another chain's lifecycle isn't this orchestrator's to end). The refusal-envelope teaches the operator the right verb (`sp chain stop <chain-id>`) at refusal time, so the wrong choice never silently destroys work — it educates instead.

**Companion enforcement layer.**

- **`using-specialists-v4` SKILL.md** (Phase 6) gets a dedicated **"Chain teardown discipline"** section: `sp chain stop <chain-id>` is the default at chain-end; `sp stop --all` is reserved for end-of-session repo wipes when nothing else is running. Example refusal envelope and "what to do instead" inline.
- **Claude Code PreToolUse hook on `sp stop --all`** (extends §4 hook layer): before the command runs, the hook queries `sp ps --json`, computes the same sole-orchestrator predicate, and if violated emits a blocking hint with the suggested `sp chain stop` command — same shape as the bd-create hint (§4). Cheap, fires at the right moment, prevents the misuse before the CLI itself refuses (defense-in-depth: hook educates, CLI enforces).

**Cost: ~1 E-D-E (hours wall-clock auto-mode).** Two CLI surfaces + shared filter/predicate helper + tests (`--all` refusal cases, `--chain` filter, `--dry-run`, cross-chain isolation, `--yes` does-not-bypass-refusal) + v4 SKILL section + Claude hook. Sequenced **Phase 7 (polish)** — independent, no blocking deps.

**Reads forward.** Substrate §6.10: chain-as-container makes `sb container close <id>` the native equivalent of `sp chain stop` — one-for-one migration when containers land. `sp stop --all` survives as the local-DB blast-radius verb regardless of substrate's container model; its sole-orchestrator predicate continues to read from the same observability table.

---

**Opportunity 14 [shipped 2026-05-31] — Canonical-pipeline completion: `test-engineer` step + `test-runner` upgrade + chain_template wiring.** *(Beads: epic `unitAI-sfwe1`, design canon `docs/design/chain-templates.md` §2, formula integration `unitAI-f9kku`.)*

**Problem today.** The current canonical pipeline (already in production via `using-specialists-v3`) runs `executor → code-sanity → obligations-scanner → reviewer` for production diffs. But there is a precise gap between the writer and `code-sanity`: nobody turns a production diff into the right behavioral tests, smoke/E2E checks, and telemetry assertions before the reviewer sees it. The executor is busy implementing; `test-runner` only executes. As a result, autonomous chains repeatedly ship code whose test/log/telemetry contract was never validated against the actual diff — the reviewer either gives a false PASS (no evidence to gate on) or a noisy PARTIAL (asking the operator to fill the gap manually).

**Patch.** Two specialist additions/upgrades plus a chain_template formula pass that completes the canonical pipeline:

- **NEW `test-engineer` specialist** (MEDIUM permission, post-impl phase). Reads the actual diff and the planning-time logging/telemetry + smoke/E2E contracts; writes/updates tests, fixtures, smoke scripts, telemetry assertions; emits exact `test-runner` commands. Required structured-JSON output (`status`, `files_changed`, `coverage_map`, `smoke_e2e_commands`, `telemetry_assertions`, `test_runner_commands`, `known_deferred_paths`, `source_bug_suspicions`). Does NOT patch production source by default — if untestable without a source fix, returns `source_bug_suspected` + discovered-from followup. *(Bead: `unitAI-sfwe1.1`.)*
- **UPGRADED `test-runner` specialist** (stays LOW permission, no file writes). Prefers exact commands supplied by `test-engineer`; runs smoke/E2E/live-contract checks when requested; captures requested log/telemetry artifacts; **classifies failures by owner** (`test_engineer` | `debugger_or_executor` | `infrastructure` | `pre_existing`). Never silently expands a pinned test scope. *(Bead: `unitAI-sfwe1.2`.)*
- **Chain_template formula integration.** Every applicable formula (`code-standard`, `code-with-advisors`, `debug`, `security-deep`, `restitch`) gets `seconder` + `test-engineer` + `test-runner` wired between writer-role (executor/debugger) and obligations-scanner, with the correct severity sensitivity per the canon's per-template entries. `code-with-tests` and `test-only` are added as new formula files. Templates that are READ_ONLY (`planning`, `premortem`, `research-only`, `doc-sync`, `memory-hygiene`, `triage`) are NOT modified. `code-quick` keeps `test-engineer` optional/skippable per low-scrutiny rule. *(Bead: `unitAI-f9kku`, blocked on sfwe1.1/.2 for specialist-layer completion.)*

**Why.** Closes the executor-to-code-sanity gap that produces false-PASS reviews on autonomous chains. Aligns specialists with the xtrm planning/test-planning skills (which already require logging/telemetry + smoke/E2E contracts in every implementation bead). Severity-tiered: low scrutiny stays light; medium recommends; high mandates; critical mandates + adds behavioral evidence to the Release Checklist. Once shipped, `test-engineer` + the upgraded `test-runner` become canonical steps in `chain-templates.md` §2 (the canonical pipeline) — not opt-in additions, simply part of how production-diff chains run.

**Companion enforcement layer.**

- **Reviewer prompt** (extends current Release Checklist with the lines already specified in canon §2.6): `test-engineer required`, `test-engineer completed`, `test-runner commands executed`, `smoke/E2E evidence present`, `telemetry/log assertions present`, `failures classified and routed`. PARTIAL when high/critical scrutiny + behavioral evidence missing. *(Folded into `unitAI-sfwe1.3` — chain docs / reviewer prompt update.)*
- **`using-specialists-v4` SKILL** (Phase 6): teaches the completed canonical pipeline as default; documents the failure-routing matrix; cross-references the canonical chain-templates design canon §2 as the authoritative source.
- **Smoke/eval** (`unitAI-sfwe1.5`): proves the routing — test-engineer writes tests → test-runner fails due to test-side issue → routes back to test-engineer; source-side failure routes to debugger/executor.

**Cost: ~5 E-D-E (~1 day wall-clock auto-mode), parallelizable.** sfwe1.1 (test-engineer spec) + sfwe1.2 (test-runner upgrade) can run in parallel (disjoint specialist files); sfwe1.3 (doc/skill update) gates on both; f9kku (formula integration) gates on sfwe1.1/.2; sfwe1.5 (smoke/eval) gates on f9kku. Wall-clock with auto-mode parallelism: ~1 day end-to-end.

**Sequencing.** Phase 5 (immediately after Phase 4 chain-template + sp epic decoration work lands), before Phase 6 v4 SKILL drafting — so the SKILL can teach the completed canonical pipeline as a shipped capability rather than a future commitment.

**Reads forward.** Substrate §6.9.10 (updated to reference `chain-templates.md` §2 as the canonical pipeline declaration) — when substrate lands, `test-engineer` is a `class:step`, `role:test-engineer` participant within the chain_template's mandatory layer; the two channel-message kinds (`qa_plan_and_tests`, `test_verdict`) join the chain channel when channels v0 ships. The runtime → substrate migration is naming + ownership-transfer; the role and the contract survive unchanged.

**Not in scope of Opp 14.** Two pieces of the canonical pipeline are still pending after Opp 14 ships: (a) the **wrong-task-waste protection** between writer and test-engineer — solved by Opp 15's `seconder` fusion (the seconder's `scope_verdict` is the cheap pre-QA compliance check that gates expensive QA work; the original draft proposed a separate `contract-coverage` extraction step, but the designer handoff 2026-05-31 reversed this to a single fused `seconder` based on empirical workload data); (b) **DevOps gates** (operational validation for ops-shaped diffs — Dockerfile, compose, hooks, deploy, agent-orchestration) — see canon §4; design fill in a separate session segment + future opportunity.

---

**Opportunity 15 [shipped 2026-05-31] — `seconder` fusion: collapse `code-sanity` and the reviewer's phase-1 compliance check into one dual-verdict step.** *(Beads: design canon `docs/design/chain-templates.md` §2.3, designer handoff 2026-05-31, implementation epic `unitAI-4e194`.)*

**Problem today.** The current canonical pipeline (Opp 14 completes the QA portion) runs `executor → code-sanity → test-engineer → test-runner → ... → reviewer`. The reviewer's job is two-phase: (1) compliance check against bead requirements, (2) adversarial deep code-quality review. Phase-1 only runs at chain end. Consequence: a single reviewer FAIL on scope/compliance grounds invalidates the entire chain's downstream work — and at high/critical scrutiny, `test-engineer` writing E2E + smoke + telemetry assertions can cost 80–300k tokens. A wrong-task reviewer-FAIL can waste 500k–1M+ tokens (writer + sanity + test-engineer + test-runner + security + obligations + reviewer itself), plus operator-attention cost. The `code-sanity` reorder alone protects against bad-code waste but **not against wrong-task waste** — code-sanity validates code quality, not whether the diff matches the bead's contract.

**Patch — seconder fusion** (revision of the earlier `contract-coverage` extraction proposal in the same-day overthinker analysis on `unitAI-wf834`). The earlier proposal extracted reviewer phase-1 as a separate `contract-coverage` specialist sitting alongside `code-sanity`. Designer + operator review 2026-05-31 revised that approach based on empirical workflow data and adopted the **seconder fusion**:

- **NEW `seconder` specialist**, inheriting from `code-sanity` (model `openai-codex/gpt-5.4-mini` + fallback `zai/glm-5-turbo`, LOW permission, READ_ONLY hard) and **extending the mandate** to include reviewer phase-1 (scope/compliance check against the bead's change-contract sections). Single dispatch, capable model — not a separate "cheap" experiment. Structured dual-verdict output: `{ scope_verdict, scope_findings, quality_verdict, quality_findings, overall_verdict }` per chain-templates.md §2.3. The reducer reads `overall_verdict`; the reviewer reads the tagged findings in its phase-2 adversarial audit; ddiff loop uses the dimension tags (`scope` vs `quality`) to route fix-loop work.
- **REFACTOR `reviewer.specialist.json`** — remove phase-1 compliance text from system_prompt; keep only phase-2 (adversarial deep code-quality audit + Release Checklist enforcement + ddiff re-review). Reviewer consumes the seconder's verdict + tagged findings (parallel to how it already consumes `obligations-scanner` verdict).
- **Chain_template formula integration.** Every applicable formula (`code-standard`, `code-with-advisors`, `debug`, `security-deep`, `restitch`) swaps `code-sanity` for `seconder` in the same position; the QA section (test-engineer + test-runner) lands after seconder PASS per Opp 14. `unitAI-f9kku` scope covers both Opp 14 (test-engineer wiring) AND Opp 15 (code-sanity → seconder swap) in one pass.
- **Optional mandatory rule** `seconder-dual-verdict-output.md` — enforce dual-verdict JSON output schema if the prompt-only enforcement turns out insufficient in practice.

**Why fusion instead of extraction.** Three empirical reasons the same-day designer/operator review brought against the overthinker's break-even calculation:

1. **Real workload doesn't fit "cheap dispatch" assumption.** Bead contracts are long (multi-paragraph + multi-section); executors regularly modify 3+ files of 500+ lines. A cheap model dispatched against `contract + diff` of that size produces low-quality verdicts that force escalation to a capable model anyway. One capable-model dispatch is cheaper than two-tier dispatch where the cheap tier doesn't pay.
2. **Subscription economics.** Operator's nano-gpt subscription (asian providers — deepseek/qwen) makes the "cheap model saves tokens" framing optimism, not real saving. Provider pricing is flat-ish under subscription; the saving is in *number of dispatches*, not *per-dispatch tier*.
3. **Scope-FAIL and quality-FAIL correlate empirically.** When an executor errs, it usually errs on both dimensions together. The theoretical short-circuit motivating contract-coverage's separation (scope-FAIL blocks before quality check) doesn't pay on this workflow — both checks fire together anyway.

The fusion is architecturally clean: `reviewer.specialist.json` already declared phase-1 + phase-2 separately as conceptual phases of one audit; collapsing phase-1 with `code-sanity` into `seconder` (rather than extracting it as a third specialist) is the move that respects the empirical correlation while still surfacing the dimension-tagging in structured output.

**Severity sensitivity.**

| SCRUTINY | seconder obligation |
|---|---|
| `none` | N/A (read-only / design chains; no diff produced) |
| `low` | Skippable with explicit reason (small / trivial diffs rarely have scope-FAIL or quality-FAIL risk worth the gate) |
| `medium` | Mandatory; `overall_verdict: FAIL` routes back to writer; `UNCLEAR` on either dimension routes to writer with reason |
| `high` | Mandatory; `UNCLEAR` on either dimension escalates to chain coordinator (substrate §4.3 role 2) or operator (pre-substrate) BEFORE QA starts |
| `critical` | Mandatory + independent second-opinion seconder turn on `UNCLEAR` / FAIL-prone surfaces |

**Companion enforcement.**

- **Reviewer Release Checklist** (canon §2.6 already updated): three seconder lines (`scope_verdict`, `quality_verdict`, `overall_verdict`). Reviewer cannot PASS without an established `seconder.overall_verdict: PASS` at medium+.
- **`using-specialists-v3` + `v4` SKILL docs**: teach the canonical pipeline including `seconder` step; document dual-verdict semantics + failure routing per dimension; cross-reference canon §2.3.
- **Smoke/eval** (`unitAI-o7j1a` adapted): empirically prove that an off-scope writer dispatch produces `seconder.scope_verdict: FAIL` and blocks `test-engineer` from firing.

**Cost: ~3 E-D-E (~half-day wall-clock auto-mode), parallelizable.** seconder spec authoring (inherit + extend code-sanity, 1 E-D-E) + reviewer prompt refactor (0.5 E-D-E) + formula integration (folds into f9kku, ~0 marginal since code-sanity → seconder is a string swap) + skill doc update (0.5 E-D-E) + eval (0.5 E-D-E) + optional mandatory rule (0.5 E-D-E).

**Sequencing.** Phase 5 (immediately after Opp 14 ships). Folds into v4 SKILL drafting (Phase 6).

**Reads forward.** Substrate §6.9.3 mandatory-layer (gate set includes `seconder` as a single fused gate, not two separate ones); §6.9.10 catalog (references chain-templates.md §2 as canonical); §6.6 SCRUTINY framing (chain-property — corrected and kept); §4.3 chain coordinator role 2 (borderline judge for seconder UNCLEAR at high+); §6.10 close-as-derivation (the evidence-gate pattern seconder instances at intermediate-step granularity). Substrate migration: `seconder` becomes `class:gate, role:seconder` with the dual-verdict block persisted in `issue.evidence_json` per §6.8 — one-for-one with the foreground runtime.

**Design rationale (full).** Two-step deliberation history: same-day overthinker `unitAI-wf834` proposed `contract-coverage` extraction (Candidate F of 6 premortemed candidates); designer + operator review later same day brought empirical workflow data against the overthinker's from-the-table break-even and revised to the seconder fusion. Both deliberation steps preserved as memory `deliberation-pattern-overthinker-validates-design` (the broader meta-pattern that overthinker validation is necessary AND that overthinker outputs require operator empirical-data check before commit).

---

**Opportunity 16 [design absorbed; impl pending] — SCRUTINY enforcement infrastructure (chain-property required-at-creation; runner pre-script injection; scrutiny-aware composition mandatory rule).** *(Beads: design canon `docs/design/chain-templates.md` §2.2 + substrate.md §6.6 already updated; implementation epic `unitAI-rkwpp` filed — children .1-.4 OPEN as of 2026-05-31.)*

**Problem today.** Canon (chain-templates.md §2.2, substrate.md §6.6) declares SCRUTINY a required-field chain-property with the tier set `none|low|medium|high|critical`, with chain-structure modulation rules and required-at-creation enforcement. But the IMPLEMENTATION of those rules is incomplete:

- `bd create` does not validate SCRUTINY at bead-create time — operator can file a bead without it (default `medium` applies silently).
- `bd create` does not hard-deny `none` when scope detection finds source files (the canon rule).
- Specialist runner pre-script does not inject SCRUTINY into the context of every specialist — only the reviewer reads it (legacy behavior). Per canon §2.2 every chain participant should read SCRUTINY for awareness of where they are; the composer of the chain (planner / orchestrator / chain-coordinator entry-gate) uses it to decide chain structure.
- No mandatory rule documenting the rule "compose chain structure according to SCRUTINY" exists; it lives only in canonical design docs.

**Patch.** Three infrastructure additions:

1. **`bd create` hook validation extension** (roadmap §4 Layer A — Claude Code hook on `bd create`): hook gains SCRUTINY validation. New beads without SCRUTINY get rejected with proposal hint ("set SCRUTINY: low|medium|high|critical|none"). Beads declaring `none` when scope-detection finds source files get rejected with hint ("scope touches code paths; SCRUTINY: none is invalid — declare low at minimum").
2. **Runner pre-script SCRUTINY injection** (src/specialist/runner.ts): pre-script reads the bead's change-contract SCRUTINY field and injects it as `$scrutiny` into every specialist's template context (parallel to how `$bead_id`, `$cwd` are injected today). Specialists' system prompts can reference it for awareness.
3. **NEW mandatory rule `config/mandatory-rules/scrutiny-aware-composition.md`** — addresses the *composer* (planner, orchestrator, chain-coordinator). Documents: "When composing a chain, read the root bead's SCRUTINY field; insert advisor steps, second-opinion turns, and conditional gates per the canon §2.2 table." Joins the default `template_sets` for `planner` and (post-substrate) `chain-coordinator`. NOT injected into worker specialists — they don't compose chains; they only read SCRUTINY for awareness via the pre-script injection.

**Why standalone Opp.** Enforcement infrastructure is orthogonal to pipeline shape (Opp 15) and to QA pipeline completion (Opp 14). All three can ship independently and combine cleanly. Filing Opp 16 standalone avoids overloading either of the other epics with implementation-layer work that has its own complete deliverable shape.

**Cost: ~2 E-D-E (~half-day wall-clock).** bd create hook extension (1 E-D-E) + runner pre-script injection (0.5 E-D-E) + mandatory rule authoring (0.5 E-D-E) + SKILL doc updates (folds into 096re).

**Sequencing.** Can ship in parallel with Opp 15 (no shared files). Phase 5 alongside Opp 14 + Opp 15.

**Reads forward.** Substrate §6.6 (SCRUTINY chain-property + required-at-creation rule); substrate §5 (seed-phase validator hard-denies missing SCRUTINY at container open — this is the substrate-side enforcement that supersedes Opp 16's bd-side enforcement when substrate lands); substrate §4.3 role 1 (chain coordinator entry-gate verifies tier-vs-scope appropriateness as part of `verdict: ready`). Migration is naming + ownership-transfer; the rule survives unchanged.

**Opportunity 18 — Adopt the 5-layer identity model in observability + envelope.** *(Tracking bead: `unitAI-n2px1`. Co-supersedes the prior, incorrect Opp 18 framing on the feature branch.)*

**Why.** The current `specialist_jobs.specialist_id` column conflates two layers: the bounded role name ("executor") and run identity. Substrate §2.1 lists `Participant` as an entity but does **not** declare a separate Run/Activation entity, leaving the per-execution identity under-specified. The user's invariant (two runs of the same role MUST have different run ids) and the runtime reality (a participant lives across multiple activations — restitch, debugger handoff) require a clean separation. We pin the schema bridge-side so the implementation has an unambiguous target, then propose the same model upstream to substrate (see `unitAI-n2px1`'s sibling substrate-author flag bead).

**The 5 layers (canonical).**

| Layer | Field | Type | Cardinality | Label-safe | Lifetime |
|---|---|---|---|---|---|
| 1 | `participant_kind` | bounded enum | low | ✅ yes | constant |
| 2 | `participant_role` | bounded enum | low | ✅ yes | constant |
| 3 | `participant_id` | opaque, stable for `(scope, role)` | high | ❌ no | member's membership |
| 4 | `job_id` (= activation) | opaque, **new each run** | high | ❌ no | one pi-session / one execution |
| 5 | `turn_id` / `tool_call_id` / `event_id` | opaque, per-fact | very high | ❌ no | one event |

**Per participant kind (cascade).**

| `participant_kind` (L1) | `participant_role` (L2) examples | `participant_id` (L3) derivation | `job_id` (L4) | L3 scope |
|---|---|---|---|---|
| `specialist` | `executor`, `reviewer`, `obligations-scanner`, ... | `${chain_id}::${role}` | UUID per `sp run` | chain |
| `orchestrator` | `claude-code-session`, `auto-mode-harness` | `orch::${session_uuid}` | UUID per session run | session |
| `pulse_emitter` (in container) | `chain-coordinator-hygiene`, ... | `${container_id}::emitter::${role}` | UUID per emission | container |
| `pulse_emitter` (extern) | `github-webhook`, `cron-trigger`, ... | opaque UUID registered at setup | UUID per emission | global |
| `adapter` | `mcp-grafana`, `mcp-gitnexus`, `service-skills-sync`, ... | opaque UUID per registered adapter | UUID per invocation | global |
| `node_member` | `coordinator`, `<member-role>` | `node::${node_id}::${role}::${member_index}` | UUID per run | node |

**Invariants.**

1. Two activations of the **same role** in the **same scope** ⇒ identical `participant_id`, distinct `job_id`.
2. Two activations of the **same role** in **different scopes** (e.g. executor of chain A vs chain B) ⇒ distinct `participant_id`.
3. `participant_kind × participant_role` is **not** sufficient to identify a participant — Layer 3+4 required.
4. Layer 1+2 are the **only** identity fields eligible as Prometheus/Loki labels. Layer 3+4+5 live in correlation/body, never labels.
5. **Tool vs participant.** A *tool* is invoked synchronously and has no own lifecycle (e.g. MCP grafana query). A *participant* has its own lifecycle/runs/state (e.g. `service-skills` drift detector). Adapters that are pure tools are NOT participants.

**Bridge status (shipped).**

- `src/specialist/forensic-events.ts` implements L1/L2/L3 derivation and enforces L1+L2-only metric label discipline.
- `specialist_forensic_events` now persists canonical `xtrm.forensic.v1` envelopes alongside legacy `specialist_events` rows.
- `sp forensic` queries persisted envelopes; `sp feed --json` and `sp log --json` expose additive `forensic_event` payloads for compatibility.
- `sp metrics --prometheus` uses only low-cardinality identity labels and validates Prometheus text syntax in CI.
- Tests cover L3 derivation, redaction, forbidden-label rejection, persistence, and replay-safe table-derived counters.

**Remaining scope.**

- Broaden source-specific native event bodies where persistence-time dual-write is too generic.
- Decide whether to rename legacy `specialist` DB/status fields to `participant_role`, or keep them as storage-era aliases while substrate/state.db owns canonical identity names.
- Extend CLI filters only if operators need `--participant-role`; current `--specialist` remains the bridge alias.
- Add service-skills/MCP/process/worktree/pulse metric families when those source states emit sufficient forensic facts.
- Migrate gitboard consumer paths from text feed to `sp feed --json` / `sp forensic`.

**Cost/status:** initial bridge shipped under `unitAI-60w93.2`–`.14`; remaining work is incremental family coverage and consumer migration, not a blocker for pre-substrate telemetry stability.

**Reads forward.** Substrate §2.2 makes the participant abstract first-class; this opp pre-bridges the per-activation identity that substrate's entity table does not currently declare (under-specification flagged in `unitAI-n2px1`'s sibling bead requesting substrate-author add an Identity Model section to `substrate.md`). Channels v0 (`channels.md` §11) verdict messages already carry `participant_id` natively in the v0 schema; the bridge populates the same field name from Phase 1. State.db rewrite is identity for this surface (no rename, just re-home).

**Closes / unblocks.** Pre-bridges the orchestrator-observability P4 (`unitAI-tpsgv`): the writer appends rows with `participant_kind = 'orchestrator'`, `participant_role = 'claude-code-session'`, `participant_id = orch::${session_uuid}`, `job_id = ${session_run_uuid}` — no schema fork, no additional migration. Cross-link to `unitAI-60w93.1` §3 correlation model: `participant_id` joins the envelope's correlation-field list at the bridge layer.

---

## 4. Orthogonal layer A — Claude Code hook on `bd create`

The single highest-ROI patch and orthogonal to substrate (one layer above the runtime; survives rev-9 unchanged). Catches type-shape mismatches BEFORE any specialist is dispatched. **[recalibrated]** With the runway, this is also a keeper: it operates above the runtime and survives any future, bd-layer or substrate-layer.

### 4.1 Why this beats sp-runtime hints

- **Fires at the right moment** — when the bead is fresh, before the specialist is picked (sp-run hints arrive after the dispatch decision).
- **Catches type-shape mismatches before they cost a dispatch.**
- **Uses the existing Claude Code hook mechanism** — no new sp infrastructure.
- **Cross-references the live registry** — proposes a chain whose specialist names are guaranteed to exist (closes B3+B4).
- **Works offline of sp** — fires even if sp is broken or the daemon is down.

### 4.2 Hook wiring

`PostToolUse` matcher on Bash matching `^bd create\b` (PostToolUse so the bead id is assigned and visible):

```jsonc
{ "hooks": { "PostToolUse": [ {
  "matcher": "Bash",
  "command_pattern": "^bd create\\b",
  "hook": "~/.claude/hooks/bd-create-hint.sh" } ] } }
```

### 4.3 Hook computation

Given `bd create --title --type --priority --description`:

1. **Scrutiny inference** — keyword scan against the SCRUTINY surface table (auth/secret/token/migration/lockfile/.github/workflow → critical; database/cache/perf/race → high; else default).
2. **Type-shape mismatch** — `type=task` but description leads "fix/regression/broken" → suggest `type=bug + debug`; `type=bug` but "implement/add/create" → suggest `type=task + code-standard`; single-line change → suggest `type=chore`.
3. **Template proposal** — using the **six §6.9.10 default templates** (hard-coded in the hook as a bridge; the canonical source is substrate §6.9.10): `bug`→`debug`; `task`+medium→`code-standard`; `task`+high/critical→`code-with-advisors`; scope `analytics/**` or tags=quant→`quant-validation`; scope `auth|secrets|crypto|migrations|hooks`→`security-deep`; trivial→`code-quick`.
4. **Specialist resolution** — per step, resolve via `specialists list --full --json` (cached, refreshed every 10 min or on stale). Print model + est duration.
5. **Compatibility cross-check** — verify proposed specialists exist (closes B4 at hint-time).
6. **Step-bead detection** — **[discipline]** if the bead carries the `kind:step` tag, propose the step-contract template; the `<role>:<root-id>` title pattern is only a secondary hint, never the decision (Opp 5).

### 4.4 Hint output

```
[bd-create-hint] bead created: forge-eorh.74 (type=bug, priority=1)
Severity inferred: scrutiny=high  (matched "auth retry" against surface table)
Type-shape check:  OK
Suggested chain shape:  debug
  debugger → code-sanity → obligations-scanner → reviewer
Recommended dispatch:
  sp chain review forge-eorh.74      # composition gate (Opp 4)
  sp run debugger --bead forge-eorh.74 --keep-alive --background
Registry version: registry@2026-05-26 (12m ago; `specialists list --full` to refresh)

Contract scaffold (XML per Opp 12 / D30; CoT prefill per D29):
  <change-contract issue-id="forge-eorh.74" type="bug" scrutiny="high">
    <!-- CoT: before filling these, ask: what's WRONG with my first draft?
         (premortem-style critique-before-commit per D29) -->
    <problem>...</problem>
    <scope>
      <!-- prefer file-list over glob — dispatcher matcher is deterministic -->
      <path>...</path>
    </scope>
    <non-goals>
      <!-- explicit negative-space; substrate §6.4 scope-collision uses this -->
      <item>...</item>
    </non-goals>
    <validation>
      <!-- FALSIFIABLE — "tests X pass" not "looks good" -->
      <criterion>...</criterion>
    </validation>
    <acceptance>
      <criterion>reviewer PASS verdict</criterion>
      <criterion>code-sanity OK</criterion>
    </acceptance>
  </change-contract>

Example of well-written change-contract (multishot, 1 of 2):
  see ~/.config/specialists/contract-examples/change-contract-bugfix.xml

Anti-example (what NOT to do):
  see ~/.config/specialists/contract-examples/change-contract-anti-vague.xml
```

### 4.5 What this closes

B1 (lists every required step — skipping becomes explicit against printed text), B2 (proposes `code-with-advisors` for high), B3 (auto-refresh + version print), B4 (live registry cross-check), D4 (bridge until §5.1), R4 (step-bead template via Opp 5).

### 4.6 Cost

~1 day. Standalone — no daemon, no sp patch.

---

## 5. Orthogonal layer B — sp-runtime hints + `sp chain` command

Layer A (§4) fires at bead-creation; this fires at and after `sp run`. Complementary, both needed.

### 5.1 Post-dispatch hint on `sp run`

```
$ sp run executor --bead forge-eorh.48 --background
✓ Dispatched executor cc5fcc (model: ..., scrutiny: medium)
  workspace: .worktrees/chain-forge-eorh.48 (new)
  expected: ~3-6 min
  next: on completion → code-sanity (mandatory per §6.9.3 mandatory layer)
  flag check: --background OK. Did not see --keep-alive (recommended for resumable runs)
```

Closes B1+B2+D4+D5. `src/cli/run.ts` has the data; it just doesn't print it.

### 5.2 Result-aware next-step hint on `sp result`

PASS → `next: sp merge forge-eorh.48 — chain ready`. PARTIAL → `next: sp resume <exec-job> "address findings: <bullets>"`. FAIL → `next: escalate — reviewer FAIL is operator-decision (do NOT auto-retry)`. After Opp 8, read from the `step_completed` payload. Reflects substrate §6.10: PASS→close_ready→merge; FAIL is not a routine close (an unsatisfied gate blocks, §6.9.2).

### 5.3 Pre-dispatch warning hooks (auto, <2s)

**[per §0 #2: warn-only except the data-loss class, which hard-refuses.]**

| Check | Behavior | Text |
|---|---|---|
| Bead missing PROBLEM/SCOPE/VALIDATION/ACCEPTANCE | warn | `BEAD INCOMPLETE: <fields>; specialist quality bounded by bead quality.` |
| reviewer/code-sanity without `--job <exec-job>` | warn | `MISSING --job: runs from clean checkout, diff context lost.` |
| debugger dispatched but issue.type=`task` | warn | `TYPE MISMATCH: debugger is for bugs; type=task. Did you mean executor?` |
| skip code-sanity on production diff | warn | `SKIP NOT PERMITTED on production diff — only test-only/new-file-only may skip.` |
| `--force-stale-base` without `--reason` | warn (grace) | `STALE BASE: pass --reason "<why>" (Opp 7); old flag deprecated.` |
| **cwd inside a worktree dispatching for a different bead (C1)** | **HARD-REFUSE** | `CWD MISMATCH: you're in <wt-path> for <bead-X>, dispatching for <bead-Y>. Refusing (data-loss risk, C1). cd out or pass explicit path.` |

**[adjusted: R5 dedup]** The last check IS the reviewer-specific R5 — it lives here, once. §7's R5 references this row rather than restating it. This is the data-loss class, hence hard-refuse not warn.

### 5.4 `sp chain <bead>` CLI dashboard view

Unifies Opp 3 + Opp 8 data into one display (root beads only, §0 #1):

```
$ sp chain forge-eorh.48
chain: forge-eorh.48 — "<title>"   template: code-standard   scrutiny: medium
  ✓ executor          cc5fcc  PASS   3m12s
  ✓ code-sanity       d6eacc  OK     1m45s   findings: 0
  → reviewer          7b3775  RUNNING 1m20s
  ○ merge             pending
next (when reviewer PASS): sp merge forge-eorh.48
git state: clean; ahead of main by 3 commits
```

Read-once (v0, per §0 #5); `-f` follow later.

### 5.5 `sp merge` dirty-index diagnostic

**[recalibrated: LAND, not skip.]** When `sp merge` sees a `git status --porcelain` containing only `.beads/issues.jsonl`, report the cause not "Merge conflict":

```
sp merge refused: dirty index from bd-auto-export race
  fix: git restore --staged .beads/issues.jsonl
  then: retry sp merge
```

Closes D3. Cost half a day. It is a throwaway bridge — substrate §6.10's transactional `sb container merge` removes the cause — **but A1 recurred 5× in one session and the runway is a month over 10 repos, so the recurrence cost justifies landing it.** (If `xtrm-h9hqg` lands the bd auto-stage fix first and A1 stops recurring, this can be skipped — they address the same root cause from two angles.)

---

## 6. Orthogonal layer C — per-repo bootstrap

**[per §0 #6: split between `xtrm-h9hqg` and friction-audit-side work.]**

**Covered by `xtrm-h9hqg` (P0, IN_PROGRESS) — do NOT duplicate:**
- **B-A1** bd auto-stage recipe (`export.git-add false` + pre-commit shim after bd markers).
- **B-A2/A3** the three hooksPath/third-party cases: `core.hooksPath` honored; hooksPath misconfigured at `.beads/hooks` (mercury/{market-data, market-data-uuj, platform, terminalbeta}); non-bd pre-commit at target (precommit.com framework → plugin integration; security-pipeline wrapper → safe append; custom fast-unit-tests runner → manual decision). Idempotent sweep across `~/dev` + `~/projects`, dry-run default + `--apply`.
- *Plus extra scope the audit hadn't listed:* bd/gitnexus version detection + upgrade (operator-confirm major bumps), pending bd migrations, gitnexus reindex on schema drift, single summary report.

**NOT covered by `xtrm-h9hqg` — friction-audit-side (file separately or extend its scope):**
- **B-A4** orphan worktree sweep: `git worktree list | grep -v master`, classify live / merged-already / abandoned, auto-remove the latter two, flag live for review.
- **B-A5** test-runner `.worktrees/` excludes (per-language: vitest/pytest/jest).
- **B-A6** osv-scanner wrapper as a per-repo `xt-push` shell function.

**Substrate-future:** §13.2 lazy-launch daemon + a clean store removes much of the bd-hook fragility — but the bd-layer fixes are keepers until the §13.7 migration (later than substrate landing), and B-A4/A5/A6 (worktree-level) survive substrate regardless.

---

## 7. Reviewer-specific error modes (R1–R7)

`Non-Negotiable Rule 7` hides seven distinct failure modes. Each gets a pre-dispatch check in `run.ts` when `specialistName === 'reviewer'`, reading `observability.db` + bead store (<200ms).

**[recalibrated] Build more of these than a short runway would justify — they recur across 10 repos over a month — but first dedupe and check redundancy against the structural patches.** Two guards before writing code: (a) **R5 is already implemented in §5.3** (the cwd-mismatch hard-refuse); §7 does not restate it, it references it. (b) **Once Opp 2 (read-only path-binding) and Opp 1 (lease) land, several R-modes lose the surface they fire on** — R1 (no `--job`) and R2 (stale `--job` HEAD) partly dissolve when read-only binds by path against the lease base rather than the owner's live session. So: implement the checks whose friction survives Opp 1/2, skip the ones Opp 1/2 already prevent.

| Tag | Error mode | Check | Status after Opp 1/2 |
|---|---|---|---|
| **R1** | reviewer without `--job` → clean checkout, no diff | if no `--job` AND target has a `validates` edge to a bead with an open executor job, refuse with the right command | Partly dissolved — read-only binds by path; keep as a *hint* not a hard refuse |
| **R2** | `--job` points at a stale/completed executor whose HEAD moved | compare `<exec-job>` last SHA vs worktree HEAD; warn if different | Partly dissolved — lease tracks current HEAD; keep as warn |
| **R3** | reviewer before mandatory `code-sanity` ran | check for a `code-sanity` PASS on the same `--job`; warn | Survives — build (it's the §6.9.2 completeness contract, pre-substrate) |
| **R4** | tracking-bead vs target confusion | parse for `reviewer:`/`code-sanity:` prefix; warn with the root | Dissolved by Opp 5 long-term; build the warn as bridge |
| **R5** | operator cwd in a different worktree | **see §5.3 — implemented there as hard-refuse (data-loss class)** | — (deduped) |
| **R6** | `scrutiny=critical` but no `security-auditor` in chain history | on reviewer with scrutiny≥high + sensitive surface, check for prior security-auditor; refuse if missing | Survives — build (it's the §6.9.3 mandatory layer, pre-substrate) |
| **R7** | reviewer dispatched twice for same target | check for an existing PASS on the same `--job`; warn | Survives — build (cheap) |

**Build order, post-recalibration:** R3, R6, R7 first (survive Opp 1/2, real friction). R1, R2, R4 as warns/hints (partly dissolved but cheap and useful during the runway). R5 already done in §5.3. Generalize to code-sanity/obligations-scanner/security-auditor after the reviewer set proves out (§10.5).

**Reads forward.** §6.9.6 + §6.9.2 + §6.10 absorb all seven: R1/R5 impossible (any participant reads the container's worktree), R2 impossible (lease tracks HEAD), R3 → §6.9.2 completeness contract, R4 → §6.9.2 dual-contract, R6 → §6.9.3 mandatory layer, R7 → §6.10 close-ready prevents duplicate dispatch. The checks are bridges to substrate's structural prevention; they retire on substrate, kept now because they close real friction across the runway.

---

## 8. Reuse audit + substrate-future bridge map

### 8.1 Reuse audit

Per substrate's §18 discipline: every patch maps to an existing primitive or is a temporary bridge. No proposal introduces a new daemon, IPC, or entity — every one is text-emission improvement, a thin CLI wrapper over existing data, or shimmed columns.

| Patch | Reuses | New surface |
|---|---|---|
| Opp 1 lease columns | jobs/status table; `agent_end` | 2 columns |
| Opp 2 READ_ONLY path binding | `permission: READ_ONLY` tag; worktree path on `--job` | runner branch |
| Opp 3 chain shape | jobs/status table | 1 table or JSON-per-chain |
| Opp 4 `sp chain review/approve/insert` | Opp 3 data; the six §6.9.10 templates | 3 CLI verbs |
| Opp 5 step-bead conventions | bd `kind:step` tag; Claude hook | convention only |
| Opp 6 branch naming | worktree.ts template | 1 template change |
| Opp 7 `--accept-stale-base --reason` | existing flag renamed + arg | flag rename + envelope |
| Opp 8 `step_completed` | `runner_event` + observability.db | one event kind |
| Opp 9 nudges | matcher syntax | one selection-config file (not formula sections — see Opp 9 detail) |
| **Opp 10 `--chain` redesign** | merge-slot (Opp 1), molecule (Opp 3); existing flag-parse code | flag deprecation + auto-create flow |
| **Opp 11 pull-not-push memory** | `bd memories` / `bd recall` (already exist); mandatory-rule infra (`config/mandatory-rules/`); `template_sets` field on specs | one new rule file + runner-injection removal |
| Claude hook (§4) | `specialists list --full --json`; PostToolUse | one shell script |
| sp hints (§5.1–5.3) | data `sp run`/`sp result` already have | stderr blocks + checks |
| `sp chain` (§5.4) | Opp 3 + Opp 8 | one command |
| `sp merge` diag (§5.5) | `git status` + merge wrapper | error text |
| Bootstrap (§6) | `xt init` + `bd config` + `git worktree` | per §0 #6 split |

### 8.2 Substrate-future bridge map

| Patch | Replacement | Survives? |
|---|---|---|
| Opp 1 lease | §6.9.6 lease on container | **Yes** — storage moves |
| Opp 2 READ_ONLY binding | §6.9.6 read-only no lease | **Yes** — identical |
| Opp 3 chain shape | §6.9.2 resolved shape | **Yes** — rename/re-attach |
| Opp 4 `sp chain ...` | §6.9.5 + §11.1 | **Yes** — `sp`→`sb` |
| Opp 5 step-bead | §6.9.2 dual-contract | **Yes** — convention→schema |
| Opp 6 naming | §6.9.7 | **Yes** — extends as containers nest |
| Opp 7 stale-base | §6.4 precondition + channels.md §10.2 | **Yes** — keeper |
| Opp 8 `step_completed` | §3.1 daemon-advances | **Yes** — same payload |
| Opp 9 nudges | §6.9.5 L1 (selection layer) | **Yes** — same selection-config |
| **Opp 10 `--chain` redesign** | §6.9.5 + §11.1 `sb dispatch --container <id>` | **Yes** — mechanical rename; runtime adopts substrate identity model early |
| **Opp 11 pull-not-push memory** | §10.2 memory-as-capability (eventually + dispatcher-precomputed `memory_pack`) | **Yes** — same pull principle; dispatcher-scoped pack is evolution, not reversal |
| Opp 8 `step_completed` | channels v0 `verdict` message (§11 of channels.md) | **Bridge** — retires when channels v0 ships; same data, simpler shape |
| Claude hook (§4) | independent of runtime | **Yes** — above runtime |
| sp hints (§5) | §12 dashboard + §17.1 feed | **Yes** — help offline operators |
| `sp chain` (§5.4) | `sb container ps <id>` | Mostly — CLI rename |
| `sp merge` diag (§5.5) | §6.10 transactional close removes cause | **No** — throwaway, but **land** per recalibration (A1 recurrence) |
| Bootstrap bd pieces (§6) | §13.2 lazy daemon + clean store | Partially — **bd pieces keep value until §13.7 migration, later than landing**; worktree pieces (A4/A5/A6) survive |
| Reviewer R-checks (§7) | §6.9.6 + §6.9.2 + §6.10 | **No** — friction-justified across the runway; retire on substrate |

**[recalibrated] "Bridges to skip" is now empty.** The prior revision flagged `sp merge` diag as the one skip candidate; the runway flips it to land. Every bridge either survives substrate or repays its cost before retiring.

---

## 9. Mechanism reference — `sp finalize` and `--force-stale-base`

### 9.1 `sp finalize <job-id>` — keep-alive chain-close trigger

`finalize.ts` → `control.ts:155 finalizeJob`. Executor with `--keep-alive` flips to `waiting` after first `agent_end` instead of closing; reviewer enters via `--job` into the same workspace; on reviewer PASS, `sp finalize` reads the verdict from `observability.db.specialist_results` and closes all waiting keep-alive members. Exists because without keep-alive the executor's pi session closes and the reviewer can't `--job` in. **Failure mode:** forgotten `sp finalize` = jobs in `waiting` forever (resource leak). **Opp 2 mitigates** — when READ_ONLY no longer needs owner-keep-alive, the executor releases earlier, dropping the urgency even before substrate removes it. **Substrate replacement (§6.10):** disappears, not migrated — reviewer PASS evidence → reducer derives `close_ready` → `sb container merge` closes all members transactionally. Close is derived from evidence, not commanded.

### 9.2 `--force-stale-base` — stale-base guard bypass

`run.ts:273 assertNoStaleBaseSiblings`. Before dispatch: resolve the bead's epic, list sibling chains, for each with a branch call `previewBranchMergeDelta` + `evaluateMergeWorthiness`; if any sibling has commits worth merging → refuse. **Over-fires** because the equivalent work may already be on master under a different SHA (PR-merged outside `sp epic merge`, branch never deleted, cherry-pick with rewritten SHA) — `evaluateMergeWorthiness` is a structural delta check, not patch-id equivalence. **Patch (Opp 7):** rename + structured envelope + optional patch-id detection. **Substrate replacement (§6.4):** dispatch-time precondition gate (precondition violation, not §5.10 recovery); envelope matches channels.md §10.2.

### 9.3 Common pattern — compensation for missing model

Both are workarounds for absent model: `sp finalize` exists because there's no rule "a chain is closed when its reviewer evidence is PASS and all members are waiting"; `--force-stale-base` because there's no model "sibling work is equivalent if its patch-id matches master." Substrate's contribution is **making the model explicit** so the procedural compensation disappears — the same move as substrate §6.10 (the three bd shims deleted, not migrated). This audit catalogs every place we pay for absent-model with operator procedure; §3–§6 reduce the tax now, substrate eliminates it. **[recalibrated]** Over a month across 10 repos, that tax is paid daily — which is the whole case for building the bridges rather than waiting.

---

## 10. Master sequenced rollout

Sequenced by leverage-per-day. **[recalibrated]** The runway (month+, ~10 repos) raises the value of every friction-removing day, so the ordering optimizes for earliest daily-pain relief.

**Day estimates are engineer-day-equivalent (E-D-E), not wall-clock.** Each item's cost is the budget of focused engineering effort needed if a human did it sequentially. In **specialists-auto execution mode** the wall-clock is much shorter because (a) specialist runs are LLM-fast (executor chain ≈ 10–30 min where a human takes a day), (b) independent items in a phase run as **parallel chains** in disjoint worktrees, (c) overnight cycles chew through multiple phases sequentially. Realistic wall-clock for the full roadmap in auto-mode: **~3–4 days end-to-end** (or one long overnight + a day of supervised checkpoints), not 20+ calendar days.

**Parallelization map (within-phase concurrency in auto-mode):**

| Phase | E-D-E | Parallel chains | Why sequential within | Auto-mode wall-clock estimate |
|---|---|---|---|---|
| 0 | 1 | mostly sequential | bootstrap items chain (install templates → edit planner → create planning skill → verify → smoke) | ~1–2h |
| 1 | 4 | up to 4 parallel (Claude hook, Opp 2 path-binding, Opp 8 event, Opp 11 memory) | all touch different files / different surfaces | ~half overnight |
| 2 | 5 | mostly sequential (Opp 1 → Opp 3 → Opp 4 → Opp 10 dep chain) | each opportunity depends on prior data shapes / flags | ~one overnight |
| 3 | 5.5 | up to 7 parallel (Opp 5, 6, 7, 9, R-checks, Opp 12 XML contracts, contract-discipline rule — all independent file scopes) | independent file scopes | ~half overnight |
| 4 | 2 | sequential single workstream | one removal pass across `epic.ts` + state machine + reconciler | ~few hours |
| 5 | 1 | parallel (B-A4 sweep, B-A5 excludes, B-A6 wrapper, sp merge diag) | independent file scopes | ~few hours |
| 6 | 2 | sequential (v4 create → auto mirror → v3 freeze) | the order matters for coherence | ~half day |
| 7 | 3 | parallel (one per role: code-sanity, obligations-scanner, security-auditor) | independent role checks | ~few hours |

**Operator role in auto-mode:** drive the smoke checkpoints between phases (the cheap rebuild + CLI smoke per the handoff bead), validate at each phase boundary, only intervene on failure. The E-D-E columns below remain useful for reasoning about budget consumed per item; they should not be read as wall-clock.

### Phase 0 — Bootstrap (~1 day, operator + 1 small executor chain)

Everything below this phase assumes Phase 0 has shipped. Without it, Phase 2 Pass-2 planning (the `recommended_template` annotation) cannot run, and Phase 1+ executors cannot benefit from the 15 chain-template formulas because `bd formula list` doesn't see them yet. This phase is the honest precondition the plan was missing — moved here from where D26 used to live as Phase 3 row 11b.

| # | Item | Cost | Verify |
|---|---|---|---|
| 0.a | Copy `docs/design/roadmap/chain-templates/*.formula.json` → `~/.beads/formulas/` (eventually shipped via `xt init` per D19; manual for first install) | 0.1d | `bd formula list` shows all 15 (13 original + code-with-tests + test-only added 2026-05-31 via `unitAI-f9kku`) |
| 0.a.1 | **SCRUTINY floor parity** — 8/15 formula files currently lack the `scrutiny` var with default (audit 2026-05-31). Add per canon §3 mapping: code-quick → `low`; restitch → `medium`; doc-sync, memory-hygiene, planning, premortem, research-only, triage → `none`; release-prep → `low`. Aligns with Opp 16 / `unitAI-3l0ac` bd-create-hook enforcement: without template floor, the hook has nothing to auto-escalate from. **15-min pure-data edit; ship before 0.b.** | 0.1d | All 15 .formula.json declare a `scrutiny` var with default matching canon §3.X |
| 0.b | Edit `config/specialists/planner.specialist.json` — extend `output_schema` with `recommended_template: enum(<15 formula names> \| 'on-the-run')`; validated at runtime against `bd formula list` (D26 a) | 0.3d | `jq` shows new enum; `sp validate planner` passes |
| 0.c.1 | **Create canonical `config/skills/planning/SKILL.md` (does not exist today — only `.xtrm/skills/default/planning/SKILL.md` deployed mirror, 531 lines, Phases 1-6).** Add the **7 missing sections** identified by 2026-05-31 audit: (1) Pass-2 `recommended_template` annotation (D26 b core deliverable); (2) chain-template catalog enum with when-to-use briefs (15 templates, refs `chain-templates.md` §3.1-§3.15); (3) contract-creation discipline (D29 — CoT prefill in `<thinking>` tags, 2 worked + 1 anti-example per contract type, critique-before-commit premortem-style); (4) XML semantic structure (D30/Opp 12 — `<change-contract>` for root, `<step-contract>` for step; concrete shape with `<problem>`/`<scope>/<path>`/`<non-goals>`/`<validation>/<criterion>`/`<acceptance>`); (5) memory-recall integration (D27/Opp 11 — `bd memories <keyword>` BEFORE planning, `bd recall <key>` for payloads); (6) SCRUTINY-aware composition (Opp 16 — planner picks tier per scope/risk surface; canon §2.2 auto-escalation table; planner sets floor, reviewer can only escalate); (7) bd dep typed-edges navigation (D28 absorbed — full `--type` vocabulary: validates / informs / discovered-from / parent-child / related / supersedes; worked-template tables). | 1.0d | All 7 sections present + `sp validate planner` reads the new file via `skills.paths` |
| 0.c.2 | **Cross-repo mirror to `~/dev/xtrm-tools`** — propagate canonical to xtrm-tools update pipeline so `xt update --apply` ships the new content to consumer projects. Requires `npm link` symlink + revendor + 2-pass `xt update --apply` per memory `xtrm-tools-skill-propagation-requires-npm-link-2026-05-23`. Verify identical SHA in ≥2 consumer repos. | 0.5d | `diff -q ~/projects/<repo>/.xtrm/skills/default/planning/SKILL.md ~/dev/specialists/config/skills/planning/SKILL.md` returns identical |
| 0.d | Verify `/using-specialists-v3` still teaches the manual-chain-discipline + Iron pipeline + manual git per CLAUDE.md rule #9 that holds Phase 1 execution until Opp 4+10 land | 0.1d | Skim §"Orchestration Discipline" + §"Chain Management" sections |
| 0.e | Smoke: dispatch planner on a vacuum bead (just a title) → confirm `recommended_template` field appears in output_schema-validated output | 0.2d | `sp run planner --bead <test> --json` shows the field; resolved chain pour respects template-declared scrutiny floor |

**Why Phase 0 is bootstrap, not Phase 3:** D26 was originally Phase 3 row 11b because the operator could in principle hand-edit it any time. But Phase 2 Pass-2 (planner annotation of `recommended_template`) **cannot run without D26 shipped**. Putting D26 inside Phase 3 created a circular dependency: planning Phase 2 produces the bd board that includes Phase 3 work that planning Phase 2 needs. The fix is sequencing, not redesign.

After Phase 0: the operator has the chain templates installed, the planner knows how to recommend them, the planning skill teaches the two passes, and the execution discipline that bridges to Phase 1+ is verified current.

### Phase 1 — Visibility & decoupling + memory pull (~4 days)

| # | Item | Source | Cost | Why first |
|---|---|---|---|---|
| 1 | Claude Code hook on `bd create` | §4 | 1d | Highest leverage — fires before any dispatch; closes B1/B2/B3/B4/D4/R4 |
| 2 | Opp 2 — READ_ONLY binds by path | §3.2 | 1d | Removes the costliest coupling (4+6); cuts the forgotten-finalize leak |
| 3 | Opp 8 — `step_completed` + next-step (bridge until channels v0) | §3.2 | 1d | Unlocks §5.1/§5.2; carries the D2 verification-authority principle |
| 4 | **Opp 11 — pull-not-push memory recall** (remove runner injection + new mandatory rule + wire `template_sets`) | §3.2 / D27 | 1d | Immediate token-budget win (~3.8k/spawn × 8–15 dispatches/session = 30–60k freed); reversible; independent; substrate §10.2 aligned |

### Phase 2 — Composition gate & chain visibility (~5 days)

| # | Item | Source | Cost | Deps |
|---|---|---|---|---|
| 5 | Opp 1 — lease columns | §3.2 | 1d | Opp 2 first (defines READ_ONLY) |
| 6 | Opp 3 — persist chain shape | §3.2 | 2d | — |
| 7 | Opp 4 — `sp chain review/approve/insert` | §3.2 | 2d | Opp 3 |
| 8 | sp-runtime hint blocks (§5.1/5.2/5.3) | §5 | 1d | Opp 8 |
| 9 | **Opp 10 — `--chain <molecule-id>` redesign** (deprecate `--worktree`/`--job` with 1-release grace) | §3.2 | 2d | Opp 1+2 (lease) + Opp 3 (mol) + Opp 6 (naming) |

### Phase 3 — Naming, conventions, environment + XML contracts + contract discipline (~5.5 days)

| # | Item | Source | Cost |
|---|---|---|---|
| 10 | Opp 5 — step-bead conventions (`kind:step` tag; label is truth, title is hint) | §3.2 | 1d |
| 11 | Opp 6 — chain-derived naming | §3.2 | 0.5d |
| 12 | Opp 7 — `--accept-stale-base --reason` (+ grace period) | §3.2 | 0.5d |
| 13 | Opp 9 — composition-nudge external selection-config | §3.2 | 1d |
| 14 | Reviewer checks R3/R6/R7 (build full; survive Opp 10), R1/R2/R4 (warn; retire with `--job`) | §7 / §F | 1d |
| 15 | **Opp 12 — XML-structured contracts** (§4 hook XML scaffold + 13 chain-template `.formula.json` retrofit + ~14 specialist `task_template` XML wrap; Opp 5 `kind:step` template = `<step-contract>` XML) | §3.2 Opp 12 / D30 | 2d |
| 15b | **New mandatory rule `config/mandatory-rules/contract-discipline.md`** (~50 lines, XML structure): CoT prefill + 2 worked + 1 anti-example for change-contract and step-contract authoring + critique-before-commit (premortem). Wire into `template_sets` of: planner, executor (for `discovered-from` follow-ups), overthinker (for cleanup beads), debugger (for diagnostic beads), code-sanity (for blockers spawning new work). | §0 D29 | 0.5d |

### Phase 4 — `sp epic` decoration rewrite (~2 days, see §12)

| # | Item | Source | Cost |
|---|---|---|---|
| 16 | Drop `sp epic merge`/`abandon`/`sync` + `epic_runs` + state machine + readiness + reconciler (~500 LOC removed); keep `list`/`status` as thin readers + `--epic` flag + `specialist_jobs.epic_id` | §12 | 2d |

### Phase 5 — Per-repo bootstrap (split)

| # | Item | Source | Owner |
|---|---|---|---|
| 17 | bd auto-stage + hooksPath cases + dep/migration verify | §6 / §0 #6 | **`xtrm-h9hqg`** ✓ done (CLOSED 2026-05-27 per D25) |
| 18 | Orphan worktree cleanup (B-A4), test excludes (B-A5), osv wrapper (B-A6) | §6 | friction-audit-side (~1d) |
| 19 | `sp merge` / `sp epic merge` / `sp finalize` rework | §5.5 | **NEW epic `unitAI-lyh1b` filed 2026-05-31 as kj651 child** — supersedes the original "dirty-index diagnostic" scope (D18 runway recalibration) with a fuller rework: structured failure envelopes, conflict-recovery paths, auto-rebase suggestion, soak across 3 repos to remove the `using-specialists-v3` rule #9 prohibition. Decomposition into child beads by planner Pass-1. |
| 20 | `xt init` auto-runs the bootstrap skill on new repos (per D19) | §6 | xtrm-tools (~0.5d) |

### Phase 6 — Skills revamp: `using-specialists-v4` as new canonical (~2 days)

The operator-facing skills (`using-specialists-v3`, `using-specialists-auto`) currently teach the pre-roadmap discipline: `--bead` + `--worktree` / `--job` dispatch, manual chain stitching, Iron pipeline as convention, manual git per rule #9. After Phases 1–5 ship, the discipline has fundamentally changed — `--chain <molecule-id>` is the single dispatch verb, `sp chain review/approve/insert` is the composition gate, step-bead conventions are atomic with `kind:step` as truth, R-checks fire at dispatch, the new mandatory rule replaces auto-injection, the chain-template catalog is live. **This is a revamp, not a patch.** v3 was built for the pre-roadmap world; trying to patch it in-place produces contradictory text where every section disagrees with the next. v4 is the clean canonical successor.

| # | Item | Source | Cost |
|---|---|---|---|
| 21 | **Create `config/skills/using-specialists-v4/SKILL.md`** as the new canonical operator-facing skill, taught from scratch around the shipped surfaces: `--chain <molecule-id>` as the only dispatch verb (Opp 10); `sp chain review/approve/insert` as composition gate (Opp 4); `bd mol pour` + 13 chain templates as the resolved-shape source (§13); `kind:step` label-as-truth for step beads (Opp 5/D20); atomic role→edge wiring via `sp chain wire-edges` post-pour helper; R-check behavior per §7 (R3/R6/R7 hard-refuse; R1/R2/R5 retired with `--job`); pull-not-push memory recall via the new mandatory rule (Opp 11/D27) — no more bd-prime / .xtrm/memory.md auto-dump; `sp epic` as decorated reader-only surface (§12); manual git per CLAUDE.md rule #9 remains canonical (sp merge / sp epic merge dropped). Mark frontmatter `status: canonical (post-roadmap)`. | §11.1 D28 | 1d |
| 22 | **Refresh `config/skills/using-specialists-auto/SKILL.md`** to mirror v4 in the auto-orchestration mode; explicitly call out the new smoke-checkpoint cadence (each phase's checkpoint set is the auto-mode validation gate); teach the "eat-your-own-dogfood as it ships" discipline. | §11.1 D28 | 0.5d |
| 23 | **Freeze `config/skills/using-specialists-v3/SKILL.md`** as legacy reference. Prepend a frontmatter banner: `status: legacy — superseded by using-specialists-v4 as of <commit>; preserved for historical reference and for any cold-start sessions that haven't migrated`. Do NOT rewrite v3 in place — patching v3 produces contradictory text where new and old surfaces collide. v3 stays as the pre-roadmap snapshot. Inside-v4 forward-looking section ("Future surfaces") notes channels v0 + substrate concepts as *coming, not active* — so operators know what to expect when those land, without v4 itself being gated on them. | §11.1 D28 | 0.5d |

**Why v4 is canonical-now, not channels-gated:** the 11 opportunities ship in ~16 days (Phases 0–5); channels v0 and substrate landing are months out and outside this roadmap. Gating v4 on channels would leave the operator with a stale v3 teaching dead surfaces (`--worktree`/`--job`/raw `--bead`) for months. v4 = canonical for what shipped. Channels/substrate-aware surfaces live as a clearly-marked "Future surfaces" section inside v4 (or as a future `using-specialists-v5` when channels v0 ships) — they do not block v4's release.

**Why a new version number instead of in-place patching v3:** v3 was structured around the pre-roadmap mental model (chain = aggregation over `chain_id`-sharing jobs, executor as chain bootstrapper, reviewer-as-parasite via `--job`, manual chain stitching). The roadmap inverts that — chain = molecule first-class, any specialist can dispatch first, READ_ONLY binds by path. Patching v3 in place means every section now contradicts the next. v4 = clean start; v3 = frozen reference.

**Why Phase 6, not throughout Phases 1–5:** drip-feeding skill updates per-phase produces partial skills that contradict the next phase's still-WIP state. Single revamp pass at the end, after all surfaces have shipped and the smoke checkpoints have stabilized them, gives one coherent canonical v4. The skill becomes **what shipped, not what was planned**.

### Phase 7 — Generalize gate pre-dispatch checks (~3 days)

After the reviewer set proves out, generalize R-checks to code-sanity / obligations-scanner / security-auditor (~1d each). Not blocking.

### 10.6 Phase summary

E-D-E = engineer-day-equivalent (budget reasoning). Wall-clock in specialists-auto mode is much shorter; see the parallelization map above.

| Phase | E-D-E | Cumul. E-D-E | Auto-mode wall-clock | Key unlock |
|---|---|---|---|---|
| 0 | 2.3 | 2.3 | ~half day (3 parallel + sequential 0.c) | Bootstrap: chain templates installed (15) + SCRUTINY floor parity per template (0.a.1); planner spec + canonical planning skill (7 sections — Pass-2 / catalog enum / contract-discipline / XML / memory-recall / SCRUTINY / typed-edges) + xtrm-tools cross-repo mirror; manual-chain-discipline verified current |
| 1 | 4 | 5 | ~half overnight (4 parallel) | Pre-dispatch hints; READ_ONLY decoupled from keep-alive; specialists pull scoped memory instead of paying full dump; new mandatory rules in XML |
| 2 | 5 | 10 | ~one overnight (sequential dep chain) | Composition gate explicit; chain state queryable; `--chain` is the single chain-identity verb; `--worktree`/`--job` deprecated |
| 3 | 5.5 | 15.5 | ~one overnight (5 parallel + 2 absorbed) | Naming aligned; conventions teach the right shape; reviewer mistakes caught; XML contracts + contract-discipline mandatory rule live (Opp 12 / D29) |
| 4 | 2 | 17.5 | ~few hours | `sp epic` blocker friction eliminated; ~500 LOC removed |
| 5 | 1 | 18.5 | ~few hours (parallel) | h9hqg already done; B-A4/A5/A6 + sp merge diagnostic + `xt init` auto-run |
| 6 | 2 | 20.5 | ~half day (sequential coherence) | Skills revamp: v4 is the new canonical (XML semantic + CoT+multishot for contracts absorbed), auto-mode mirrors v4, v3 frozen as legacy |
| 7 | 3 | 23.5 | ~few hours (3 parallel) | Other gate roles get pre-dispatch checks |

**Budget reasoning:** ~19.8 E-D-E for Phases 0–5 (bootstrap + core runtime + XML contracts + sp epic decoration + per-repo bootstrap; Phase 0 expanded 2026-05-31 from 1 → 2.3 E-D-E to reflect the 7-section planning skill + xtrm-tools cross-repo mirror per audit; cumulative columns above shift +1.3 from row 1 onward), Phase 6 finalizes the operator-facing documentation, Phase 7 as polish. **Wall-clock reality in auto-mode: ~3–4 days end-to-end** (or one long overnight + a day of supervised checkpoints), driven by parallelizable phases (1, 3, 5, 7) running concurrently in disjoint worktrees and sequential phases (0, 2, 4, 6) chaining quickly because each opportunity is hours-of-LLM, not days-of-human.

### 10.7 What this rollout does NOT do (honest scope)

Does not implement the seed/planning container (substrate §5), the chain coordinator (substrate §4.3), the full channel primitive beyond v0 (channels.md v1–v3), or a `containers` table (substrate §15 Stage 4). Does not remove `sp finalize` (Opp 2 reduces its urgency; substrate §6.10 removes it). Does not retire `bd` (the hook §4 and step-bead conventions Opp 5 make `bd create` smarter; bd is replaced only at substrate §13.7 migration). Does not modify keep-alive semantics (Opp 1+2 decouples cross-job liveness; intra-job keep-alive for resume is preserved per D3). Does not introduce epic-level worktrees (substrate §6.9.7 `wt/epic-<id>/chain-<id>` is future work when substrate lands). These survive substrate intact — bridging them now would be double-work.

---

## 11. Migration shape (confirmed with rev-9 author)

When the `containers` table lands (substrate §15 Stage 4): ship it empty; migrate each `chain-identity` row to a synthetic `kind: chain` container with members re-linked via `container_id`; mark its provenance **`opened_by: synthetic-pre-substrate:<first-job-id>`** (not conflated with real seed/node provenance, §2.6). The §3 patches (Opp 1, 3, 5, 6, 8) already produce container-shaped data, so the migration is a rename pass, not a shim — **that is the value of the bridge: no double-write, just a rename when substrate is ready.** The workspace-identity decision (§0: container-scoped, no first-class `workspace_id`) is what lets `--job`-as-workspace-handle dissolve cleanly into container scoping.

---

## Appendix — Cross-reference matrix

### Friction → patches

A1 → §6/h9hqg + §5.5 diag. A2/A3 → h9hqg (hooksPath cases). A4 → §6 B-A4. A5 → §6 B-A5. A6 → §6 B-A6. B1 → §4 + §5.1 + Opp 4. B2 → §4 + Opp 9. B3 → §4. B4 → §4. B5 → Opp 7. B6 → SKILL + bootstrap detection. B7 → §5.3 + substrate §6.10. C1 → §5.3 cwd hard-refuse (= R5). C2 → Opp 7 + Opp 1. C3 → R1. C4 → §4 bead guidance. D1 → §10.5 polish. D2 → Opp 8 (verification-authority principle). D3 → §5.5. D4 → §5.1. D5 → §5.2 + Opp 8. D6 → Opp 4 + Opp 3.

### Asymmetry → patches

1 → Opp 4 + Opp 10. 2 → Opp 1 + Opp 10. 3 → Opp 3 + Opp 6. 4 → Opp 2 + Opp 1. 5 → Opp 5 + §4. 6 → Opp 2 + Opp 10.

Every friction is addressed by ≥1 patch; every asymmetry removed by ≥1 opportunity. If a planning iteration drops a patch, this matrix shows what becomes uncovered.

**[absorbed] New friction row D7 — memory injection waste.** Spawn auto-injects `bd prime` + `.xtrm/memory.md` dump (~3.8k token) regardless of task scope; small specialists (code-sanity, obligations-scanner) pay disproportionate context tax. Memories: `bd-prime-context-overhead`, `specialist-runner-injects-xtrm-memory-md-bd-prime`. Closed by Opp 11 (pull-not-push memory recall via mandatory rule).

**[absorbed] New friction row D8 — markdown-header contract fragility.** Today's contracts use markdown headers (`PROBLEM:`/`SCOPE:`/...) — fragile to header-level confusion, typos, ordering. Substrate §6.4 Stage-1 validator needs deterministic shape; LLM consumers parse XML semantic tags more reliably (Anthropic prompt-improving research). Closed by Opp 12 (XML-structured contracts via §4 hook + chain templates + step-bead conventions + specialist task_template scaffolding). Final outputs + channel messages stay JSON per channels.md design — XML applies only where humans-and-LLMs both read the content.

---

## 12. `sp epic` decoration strategy [absorbed]

Captured from explorer-mapped findings (job 2b6a44 against `unitAI-ueron`) and the reconciliation discussion. **The principle:** sp keeps `--epic` flag + `specialist_jobs.epic_id` column (load-bearing for cross-cutting queries) but **drops all epic orchestration logic**. Manual git workflow (Cherry-Pick Playbook) is canonical until substrate `sb container merge` lands.

### 12.1 What `sp epic` does TODAY (explorer-mapped)

| Surface | File | Behavior |
|---|---|---|
| `sp epic list [--unresolved] [--json]` | `epic.ts:285-318` | enumerate `epic_runs` + per-epic readiness eval |
| `sp epic status <id> [--json]` | `epic.ts:478-511` | persisted state + per-chain job status |
| `sp epic sync <id> [--apply] [--json]` | `epic.ts:573-635` | drift detection (dead jobs, stale chain refs, integrity flags) + optional repair |
| `sp epic abandon <id> --reason <text> [--force] [--json]` | `epic.ts:657-680` | terminal-state bookkeeping with audit trail |
| `sp epic merge <id> [--rebuild] [--pr] [--target-branch <name>]` | `epic.ts:344-437` | topological multi-chain merge + tsc gate + dirty-tree auto-shelve |
| `sp epic resolve` | — | **ALREADY REMOVED** in `unitAI-aurbi.10` (2026-05-08) — derived readiness replaced explicit transition |

### 12.2 Friction patterns (confirming user's "blocker system" concern)

- `sp epic merge` blocked on dirty `.beads/issues.jsonl`; the `MERGE_DIRTY_IGNORE_PREFIXES` patch helped but doesn't address the structural issue
- `epic_runs` table + state machine duplicate the chain-identity projection — readiness is *already* derivable from job statuses, the persisted state drifts and needs `sp epic sync`
- Operator workflow has migrated to manual `git merge --no-ff` per chain + Cherry-Pick Playbook (CLAUDE.md rule #9, current); `sp epic merge` is prohibited

### 12.3 What to DROP (Phase 4, ~500 LOC removed)

- `sp epic merge <id>` — the broken multi-chain merger; manual git canonical
- `sp epic abandon <id>` — terminal-state bookkeeping; bd close handles audit
- `sp epic sync [--apply]` — drift repair; without persisted `epic_runs` there's no drift to repair
- `epic_runs` table itself
- `epic-lifecycle.ts` state machine (open → resolving → merge_ready → merged/failed/abandoned)
- `epic-readiness.ts` + `epic-reconciler.ts` modules
- `checkEpicUnresolvedGuard` (only exists to force the dropped merge)

### 12.4 What to KEEP (thin readers)

- `sp epic list` — `bd children <epic> --type chain | --json` + observability join (job status, latest activity per chain)
- `sp epic status <id>` — same as list, scoped to one epic, with `bd dep tree` rendering
- `--epic <id>` flag on `sp run` — sets `specialist_jobs.epic_id` for cross-cutting queries
- `specialist_jobs.epic_id` column — load-bearing for queries like "all jobs under this epic across chains"

### 12.5 Decoration architecture (target state)

```
sp epic list         → bd children + observability join (read-only)
sp epic status <id>  → bd dep tree + per-chain job rollup (read-only)
sp run --epic <id>   → sets specialist_jobs.epic_id
sp epic merge        → REMOVED; manual git workflow per CLAUDE.md rule #9
sp epic abandon      → REMOVED; bd close <epic>
sp epic sync         → REMOVED; nothing to sync (no persisted state)
```

**Reads forward.** Substrate §6.10 `sb container merge` is the real future for multi-chain merge — close-as-derivation, transactional. Until then, manual git + Cherry-Pick Playbook. The `--epic` flag + `epic_id` column survive: in substrate they become `container_id` pointing at the epic-kind container.

---

## 13. Chain templates concretized — `docs/design/roadmap/chain-templates/` [absorbed]

> **Canonical design source (post-2026-05-31):** [`docs/design/chain-templates.md`](../chain-templates.md) is the **authoritative canonical doc** for the canonical pipeline (§2), template catalog (§3.1–§3.15), DevOps gates design gap (§4), composition mechanism (§5), evolution protocol (§6), and ambidextrous-roles pattern (§3.16). This §13 of the roadmap retains the bd-formula schema findings + the per-repo extension mechanics; semantic / pipeline questions read the canonical doc. The canon was promoted in commits `183f375e` (initial absorb) + `8f06357f` (overlay→canonical restructure) + `e99d7b9c` (D1/D2/Opp 16) + `7848a091` (rev11 multi-writer) and references the now-archived `docs/archive/iron-review-hardening*.{html,md}` lineage.

The 15 evidence-backed chain templates (13 originally + 2 added 2026-05-31 by `unitAI-f9kku`) have been concretized as `bd formula` files in `docs/design/roadmap/chain-templates/`. Schema verified against current `bd formula` / `bd cook` / `bd mol pour` engine (all parsing + cooking correctly).

### 13.1 Catalog (all 15)

Catalog vs substrate §6.9.10: substrate names **six archetypes** as a floor; the runtime ships the larger evidence-backed catalog below. **A** = one of the six substrate archetypes; **D** = deliberative/maintenance chain (realizes substrate §6.9.8 deliberative issue types, closes with `decided` / artifact outcome rather than a code diff). The §6.9.4 promotion cycle relates the two: deliberative chains that recur become archetypes.

| File | Class | Steps | Roles | Use case |
|---|---|---|---|---|
| `code-quick.formula.json` | A | 2 | reviewer | LOW-blast trivial change |
| `code-standard.formula.json` | A | 7 | executor, seconder, test-engineer, test-runner, obligations-scanner, reviewer | Production-diff default (canonical QA pipeline) |
| `code-with-advisors.formula.json` | A | 10 | + parallel explorer/researcher/overthinker before executor, then canonical QA chain | HIGH/CRITICAL blast, unknown approach |
| `code-with-tests.formula.json` | A | 8 | executor (primary writer) + test-engineer (secondary writer, ambidextrous §3.16) + canonical QA chain + security-auditor (if surface) | Dual-writer chain at high|critical scrutiny (new 2026-05-31, `unitAI-f9kku`) |
| `test-only.formula.json` | A | 5 | test-engineer (primary writer, ambidextrous §3.16) + seconder + test-runner + reviewer | Pure test-authoring chain, no production diff (new 2026-05-31, `unitAI-f9kku`) |
| `debug.formula.json` | A | 7 | debugger (non-skippable), seconder, test-engineer, test-runner, obligations-scanner, reviewer | Bug fix |
| `security-deep.formula.json` | A | 9 | security-auditor (×2: advisor + gate), executor, seconder, test-engineer, test-runner, obligations-scanner, reviewer | Sensitive surface — independently validates substrate §6.9.10's "same role at two classes" |
| `restitch.formula.json` | A | 6 | debugger, seconder, test-engineer, test-runner, obligations-scanner, reviewer | Conflict recovery (sixth archetype) |
| `release-prep.formula.json` | D | 3 | changelog-drafter, changelog-keeper | Release [Unreleased] reconcile |
| `triage.formula.json` | D | 3 | explorer, overthinker | Board health |
| `research-only.formula.json` | D | 2 | `{{specialist}}` (default explorer; override researcher) | Pure investigation |
| `planning.formula.json` | D | 2 | planner | Vague initiative → phased board |
| `premortem.formula.json` | D | 2 | overthinker | Devil's advocate before risky design |
| `doc-sync.formula.json` | D | 2 | sync-docs | Single-doc drift update |
| `memory-hygiene.formula.json` | D | 2 | memory-processor | Stale memory consolidation |

### 13.2 Critical schema findings (verified against bd binary)

- **File format:** `.formula.json` (TOML also supported). YAML deprecated (changelog: "Formula format YAML→JSON").
- **Top-level field is `formula` (not `name`).** Validation error says "name is required" but the JSON key is `formula`.
- **`version` is INT, `extends` is array** (single string fails parse).
- **`vars` is a map**, not array: `{ "var": { "default": "...", "required": false } }`.
- **Per-step:** `id` (required), `title` (required, supports `{{var}}`), `type` (bd issue type), `needs` (deps → becomes `blocks` edge), `description` (multi-line, supports `{{var}}`), `labels` (array).
- **`applies_when` matcher NOT supported as formula field** — silently dropped. Selection logic lives in Claude hook §4 + `sp chain review` dispatcher externally. **One matcher language across the system** still holds, applied at selection layer (Opp 9).

### 13.3 Chain ≡ bd `molecule` (refinement of §0 absorbed model)

`bd mol pour <formula>` creates an `issue_type=molecule` parent (NOT epic) with steps as children via `parent-child` edges + `blocks` edges between siblings per `needs`. The molecule IS the chain identity. To nest a chain inside an organizational epic: `bd dep add <molecule-id> <organizational-epic-id> --type parent-child` after pour.

### 13.4 Post-pour edge-wiring helper (Option B confirmed)

`needs` produces `blocks-on` edges only. Semantic edges from Opp 5 (`validates`, `informs`, `discovered-from`) are encoded in step `labels` as `edge:<type>-><target>`. Helper script `sp chain wire-edges <molecule-id>` reads labels post-pour and applies the right `bd dep add <step> <target> --type <type>`. Pseudocode + spec in `docs/design/roadmap/chain-templates/README.md`. Implementation: ~50 LOC, idempotent. Land in Phase 2.

### 13.5 Per-repo extension pattern

`bd formula extends: ["parent-formula"]` (array, not string) appends parent steps + child steps. Example from market-data:

```jsonc
// ~/projects/mercury/market-data/.beads/formulas/quant-validation.formula.json
{
  "formula": "quant-validation",
  "extends": ["code-with-advisors"],
  "steps": [
    { "id": "quant-methodologist", "title": "quant-methodologist:{{root_title}}", "needs": ["root"], ... }
  ]
}
```

**Caveat:** `extends` APPENDS — child steps come AFTER parent steps. To put a custom advisor BEFORE executor, either duplicate the full chain or accept that the parent's executor still has its original `needs`. We chose duplication for the default catalog (no extends) for predictability.

### 13.6 What still needs implementation

- **`sp chain wire-edges <molecule-id>`** helper (~50 LOC). Phase 2.
- **Claude hook on `bd create` template proposal** (§4) needs the template catalog paths to suggest. Phase 1.
- **`sp chain review <bead>`** (Opp 4) dispatches `bd cook` + `bd mol pour` + `sp chain wire-edges` as one composed operation. Phase 2.
- **Shipping mechanism:** copy `docs/design/roadmap/chain-templates/*.formula.json` to `~/.beads/formulas/` via `xt init` / `xt update`, or to per-repo `<repo>/.beads/formulas/` behind a flag.

### 13.7 New friction patterns closed by templates

| Friction (pre-template) | Closed by template |
|---|---|
| Reviewer skipped on trivial diff | `code-quick` (reviewer non-skippable structurally) |
| Explorer forgotten on HIGH blast | `code-with-advisors` (3 advisors parallel before executor) |
| Debugger forgotten on bug | `debug` (debugger non-skippable opener) |
| Overthinker never dispatched | `triage` + `premortem` + `code-with-advisors` |
| Researcher never dispatched | `code-with-advisors` + `research-only` |
| Changelog manual fill | `release-prep` (drafter → keeper automated) |
| Investigation accidentally writes code | `research-only` (scope-empty:code label + NON_GOALS) |
| Manual git fallback after sp merge fail | `restitch` (clean recovery flow) |
| Planning intent dropped on the floor | `planning` (planner alone, output is bd issue board) |
| Risky design committed without devil's-advocate | `premortem` (overthinker alone, type=decision) |
| Doc drift accumulates | `doc-sync` (single-doc drift update) |
| Stale memory pollutes future sessions | `memory-hygiene` (memory-processor consolidation) |---

## §A. Bridge cost/retirement framework (added 2026-06-13, premortem R3)

> **Pair canonical:** [[substrate_design_it]] §13.8 (substrate-side invariant + MOC update trigger) and [[monorepo-migration]] §5.1 (migration-side bridge whitelist + per-Stage rollback). This section is the **economics layer** the other two reference — the runway-recalibration math from §0 made operational: when does a bridge repay its cost, when must it retire, who pays the carrying cost while it lives.

### §A.1 Why bridges exist (and why they must be honest about it)

The §0 runway recalibration assumed bridges repay themselves: "friction-removed-per-day × days-until-substrate × repos-affected is large, so even an honest throwaway bridge repays its cost many times over before it retires." That math only holds when three properties are explicit:

1. **The bridge is scoped to a known failure mode** — not "general coexistence", which always overruns.
2. **The bridge has a named owner-of-cutover** — a participant (operator + sub-agent) on the hook for retirement, not "we'll get to it."
3. **Retirement is data-driven** — measurable forensic-event predicate, not vibes.

Without these three, the bridge stops being a throwaway and becomes permanent. Permanent bridges are what the premortem R3 ("the clean cutover never cuts") warned about — operators choose the bridge because the bridge works, then the bridge becomes load-bearing, then the cutover quietly never happens.

### §A.2 The three classes of bridges

| Class | Lifespan budget | Carrying cost | Retirement gate |
|---|---|---|---|
| **Migration bridge** (mirrors substrate §13.8 + monorepo §5.1) | Days to weeks | Operator cognitive load + duplicated forensic stream | Data-driven predicate per whitelist row (forensic events drop below threshold) |
| **bd-layer keeper patch** (the unusual class — see §0 runway recalibration) | Months — retires only at substrate §13.7 bd→substrate data migration | Maintenance against drift in bd's own evolution | Substrate Stage 13 lands successfully |
| **Throwaway diagnostic** (sp merge dirty-index diagnostic, the warn-only pre-dispatch checks, error-surfacing patches) | Until substrate ships the entity that replaces the diagnostic | Build/test cost + one-line-change risk per release | Substrate ships the replacement entity (Opp 1/2/3 etc per §3); the patch is deleted in the same commit that consumes the new entity |

The middle row is the unusual one. The §0 recalibration explicitly notes "bd-layer patches are keepers" — they don't retire at substrate landing, they retire at the substrate §13.7 migration which is later. This is the only class where the bridge survives the substrate landing event; everything else retires at or before that event.

### §A.3 Carrying-cost ledger (owner-of-cutover responsibilities)

Every active bridge requires the owner-of-cutover to maintain three things continuously, not just at creation:

1. **Forensic instrumentation.** The bridge must emit telemetry that makes its usage measurable. Migration-bridge usage emits whatever event family the bridge is mediating (e.g. `bd-mirror.query` per monorepo §5.1's `bd` read-only mirror); throwaway diagnostics emit `error.process` or `process_health.*` so usage trends are visible. No instrumentation = no retirement gate possible = bridge becomes permanent by default.
2. **Drift checks against the canonical it shadows.** If the bridge claims to mirror behavior X, a periodic check (CI job or `xt doctor`) confirms it. When the bridge and the canonical diverge silently, you have two systems, not one bridge.
3. **Deprecation visibility.** The bridge is logged to operators on use ("you are using bridge X; retirement criterion is Y; current state of criterion is Z%") so operators see the gradient toward retirement, not just the binary "still on / off."

### §A.4 Retirement decision protocol

Retirement is **not** operator opinion. The retirement gate's data-driven predicate (per monorepo §5.1 whitelist or per substrate §13.8 stage table) is evaluated automatically; when the predicate passes, the bridge enters a 7-day announcement window (operator warning surface + last chance for objections with explicit "I rely on this because X" forensic evidence). After 7 days with no objection, the bridge is retired in the next release. The retirement itself is a `migration.rollback.completed` event with `bridge_class` in the body — the lineage of the bridge's existence and retirement is permanent.

If an operator objects during the announcement window, the objection itself becomes a substrate issue (auto-created `class: followup` with the operator's reason) — the bridge is extended only as long as the issue stays open. This prevents the "I'll get to it later" silent extension that turned every previous bridge into a permanent fixture.

### §A.5 What this section operationalizes

| Premortem warning | Defense in this framework |
|---|---|
| R3: "the clean cutover never cuts; operators will pick bd because work cannot pause" | §A.2 explicitly models the in-cutover bridges so operators can pick the bridge AND see its retirement gate; bridge use is normal, silent permanence is not |
| R3 follow-on: "each gap blocks cutover instead of becoming one bridged edge" | §A.4 makes objections substrate issues, so blocked-by-gap becomes tracked work, not a stall |
| Synthesis cross-cutting A: "deferral compound" | §A.3 carrying-cost ledger surfaces the cost of each deferred retirement so the compound cost is visible per-release, not hidden |
| Synthesis cross-cutting D: "stage acceptance ≠ operator adoption" | §A.3 forensic instrumentation makes adoption measurable — a Stage isn't done when its code ships, it's done when bridges retire because operators stopped using them |

## §B. Durable runtime track and PR/base drift ownership split (added 2026-06-28, specialists-05q)

> Companion epic: **specialists-05q** (this repo). Children: `.1` durable PR/base drift fields, `.2` attention surface, `.3` fetch-and-pin (absorbed into Opp 7 per §3.2), `.4` dead-job audit, `.5` (this roadmap edit), `.6` validation suite. Paired upstream: **`xtrm-lk4on`** (xtrm-tools — git/worktree/PR primitives) and **`xtrm-2zd`** (xtrm/Mercury collaborator doc — container composition: webhooks, cron, bot identity, fork topology, see `~/dev/xtrm/docs/devops/mercury-devops-collaborator.md` §4–7).

### §B.1 Why this section exists

PR/base drift work straddles four owners. Without an explicit split it gravitates to specialists (because that's where operators feel the pain) and the durable home is missed — repeating the §A "permanent bridge" failure mode. This section pins ownership *before* any of the §3.2 work above lands new columns, refusal envelopes, or restart audits, so each child of `specialists-05q` knows whose surface it extends.

### §B.2 Ownership split

| Owner | Surface | What it owns | What it does NOT own |
|---|---|---|---|
| **xt (`xtrm-tools`, epic `xtrm-lk4on`)** | git, worktree, PR | git/worktree primitives, `xt end`, branch/PR creation, fetch-base, sibling-branch detection, patch-id equivalence | job-state observability, attention scoring, dead-job declaration |
| **sp (specialists, epic `specialists-05q`)** | job runtime + observability | job-row PR/base drift fields, `sp ps` / `sp doctor` attention surface, base SHA pin recording, dead-job audit + restart, `--accept-stale-base --reason` UX | the lease itself, the merge slot, the fetch primitive, container composition |
| **bd / substrate** | leases + slots | `bd merge-slot` lease, container lease (substrate §6.9.6), slot arbitration | telemetry, attention scoring, dispatch ergonomics |
| **xtrm / Mercury collaborator doc (`~/dev/xtrm/docs/devops/mercury-devops-collaborator.md` §4–7, epic `xtrm-2zd`)** | container composition | webhook topology, cron triggers, bot identity, fork topology, what *constitutes* a container in the collaborator model | per-job lease state, per-job observability, per-job dispatch |

**Reading rule.** When a child of `specialists-05q` (or any future drift bead) needs a primitive that is **not** in the sp column, it does NOT add the primitive to specialists. It (a) opens / extends a bead in the owning epic above, (b) cross-links via `bd dep add … --type tracks`, and (c) consumes the upstream surface read-only. This prevents the "specialists absorbs every adjacent concern" failure mode flagged in §A.1.

### §B.3 Durable migration table

Every row below states **bridge home** (where the data/behavior lives pre-substrate), **substrate target** (where it ends up per the §6.9 substrate model), and **migration shape** (`rename` / `attach` / `retire`) consistent with §11 and §A.2. No row introduces a new `sp lease*` column.

| Concern | Bridge home (today) | Substrate target | Migration shape | Evidence surfaces | Owning epic |
|---|---|---|---|---|---|
| **PR drift fields** (PR #, head SHA, base ref, drift status, last-refresh ms) | additive columns on the job-observability row (specialists-side) | `containers.pr_*` (substrate §6.9.6 / §6.9.7) | **rename** (column-for-column; ownership transfers job→container) | `sp ps --json` (jobs with `pr_*` populated), `sp doctor` "PR drift" check, job feed `pr_drift_observed` event | `specialists-05q.1` |
| **base_sha pin** (pinned SHA + pinned-at ms; refusal envelope fields `base_sha_pinned` / `base_sha_observed` / `commits_behind`) | additive columns on the job-observability row + refusal envelope fields per Opp 7 extension above | `containers.base_sha_pinned` + `containers.base_sha_pinned_at_ms`; refusal envelope unchanged | **rename** (column move job→container; refusal envelope shape stable) | `sp ps --json` (`base_sha_pinned`), `sp doctor` "stale base" check, `--accept-stale-base --reason` audit trail, `xtrm.forensic.v1` `precondition.stale_base.*` | `specialists-05q.3` (absorbed into Opp 7); fetch primitive in `xtrm-lk4on` |
| **needs-attention view** (per-job attention score: stale base, drifted PR, dead-job suspect, missing lease holder) | derived view in `sp ps` / `sp doctor` reading existing job-observability columns; specialists computes; surfaces JSON + human | derived view in substrate console reading `containers.*`; the *score* is bridge-only — substrate may project a different attention model in §6.9.x | **retire** (specialists-side derived view retires when substrate console ships its own attention surface; specialists keeps the JSON contract while bridges exist per §A.3) | `sp ps --json` (`attention_reasons[]`), `sp doctor --attention`, job feed `attention_raised` / `attention_cleared` events, Prometheus low-cardinality projection (Opp 18) | `specialists-05q.2`; container-side composition in `xtrm-2zd` |
| **dead-job audit** (restart-time scan: jobs marked running with no pi process, no recent heartbeat, no lease activity → declare `dead` and emit audit event) | restart-time hook in specialists runtime + audit table column on the job-observability row | substrate daemon's container-state reconciler (§6.9.x) absorbs the audit; the column moves job→container as `containers.lifecycle_audit_*` | **attach** then **retire** (today: specialists owns the audit because no daemon; once substrate daemon ships, the audit logic is retired — the column is renamed, the *logic* is dropped) | `sp ps --json` (`lifecycle_state=dead`, `lifecycle_audit_reason`), `sp doctor` "dead jobs" check, audit JSONL artifact, `xtrm.forensic.v1` `lifecycle.dead_declared` | `specialists-05q.4`; substrate daemon in `kj651` follow-up |

**Cross-row invariant.** None of the four rows above introduces a new lease column on the specialists side. The lease holder, when needed, is **read** from the bd / substrate side (today: `bd merge-slot` query; tomorrow: `containers.lease_*`) and **mirrored read-only** onto the attention surface — not stored as authoritative state on the job row. This is the §B.2 ownership rule in schema form.

### §B.4 Evidence surfaces (per §3 CONSTRAINTS)

All child work under `specialists-05q` must name evidence in these surfaces before it can close:

- **`sp ps`** — both human (terminal-aesthetic) and `--json` (machine-consumable) outputs surface the new fields under the existing tokens/cost/state line pattern (per §3.2 Opp 8 / Surface Coverage §v2.0).
- **`sp doctor`** — gains the four checks named in §B.3 (PR drift, stale base, attention, dead jobs); each check is independently runnable and JSON-emitable.
- **Job/specialist feed** — gains the additive forensic-event families in §B.3 right column; emitted under `xtrm.forensic.v1` envelopes per Opp 18 contract; persisted to `specialist_forensic_events`.
- **Prometheus projection** — low-cardinality only per `docs/telemetry/prometheus-projection-contract.md`; never `job_id`/`bead_id` as labels; PR/base/attention/dead-job counters are by `event_family` + `outcome` only.

### §B.5 Bridge cost per §A

Each row in §B.3 carries a §A.3 carrying cost. Owners-of-cutover:

| Bridge | Class (§A.2) | Owner-of-cutover | Retirement gate |
|---|---|---|---|
| Specialists-side PR drift columns | Migration bridge | specialists-runtime maintainer | `containers.pr_*` projection passes drift-check in CI; `xtrm.forensic.v1` `pr_drift_observed` event count from specialists-side projection drops below threshold for 7d |
| Specialists-side base_sha pin columns | Migration bridge | specialists-runtime maintainer | `containers.base_sha_pinned` projection passes; refusal envelope unchanged across the cut |
| Specialists-side attention view | Throwaway diagnostic | specialists-CLI maintainer | substrate console ships its own attention surface; operator adoption confirmed via `attention_*` event source-family shift |
| Specialists-side dead-job audit logic | Throwaway diagnostic | specialists-runtime maintainer | substrate daemon ships container-state reconciler; `lifecycle.dead_declared` source-family shifts from specialists to substrate |

Per §A.4 each retirement runs the 7-day announcement window; the column renames are atomic with the substrate landing commit so no row persists with both old and new column names live.

### §B.6 What this section does NOT do

- Does not modify the §3.2 Opp 1 / Opp 7 wording beyond the inline 2026-06-28 ownership / extension notes above.
- Does not introduce a new opportunity number — fetch-and-pin is absorbed into Opp 7, lease ownership clarifies Opp 1, attention/audit ride existing Opp 8 / `sp doctor` surfaces.
- Does not commit specialists to any new substrate-side schema; substrate targets are *informational* per §11 migration shape.
- Does not transfer ownership of git/worktree/PR primitives to specialists; those stay in `xtrm-lk4on` (xt) and `xtrm-2zd` (collaborator doc).
