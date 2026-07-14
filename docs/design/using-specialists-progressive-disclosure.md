# using-specialists: progressive disclosure — benchmark and review

Epic `unitAI-6639v`. Compares the pre-split skill (v3.7) with the router + references
layout (v3.8). Written at close of `unitAI-6639v.3`.

## Before / after

| | v3.7 (monolith) | v3.8 (router + references) |
|---|---|---|
| Files | 1 (`SKILL.md`) | 1 router + 6 references + 1 migration map |
| Root size | 1416 lines / 98,496 B | **256 lines / 21,689 B** |
| Eagerly injected into a coordinator session | the whole 98,496 B | the router only — **−78%** |
| Phase-specific doctrine | always loaded | loaded on demand, per phase |
| Sections | 41 | 41 (all preserved, none duplicated) |
| Asset-contract coverage | `SKILL.md` only | all 8 skill files, hashed |

The −78% is the number that matters: it is context every coordinator session paid on turn 1,
whether or not it ever merged anything.

## Layout

`SKILL.md` (256 lines) keeps only what gates *every* task — the 15 non-negotiable rules,
orchestration discipline, when to delegate, specialist choice, the promotion gate, bead titles,
SCRUTINY, the escalation matrix, session-end handoff — plus a phase → reference routing table
and a five-gates index.

| Reference | Lines | Owns |
|---|---|---|
| `references/bead-contracts.md` | 223 | contract shape, per-type contracts, dependency vocabulary |
| `references/chain-recipes.md` | 306 | QA+Iron gates, single-chain, epic, review/fix loop, mini-flows |
| `references/dispatch-preconditions.md` | 141 | Git State Precondition, conflict clusters, test-failure maps |
| `references/monitoring.md` | 188 | sleep timers, observability-DB notification, steering, rebuttal |
| `references/merge-and-integration.md` | 257 | manual merge, Cherry-Pick Playbook, restitch, smoke, recovery |
| `references/registry-and-locations.md` | 106 | where specialists live, registry/help, adjacent `xt` commands |

`references/content-migration-map.json` maps all 41 original headings to their destination, so
"no content was lost" is machine-checkable rather than asserted.

## How the split was done

Sections were extracted **verbatim by line range via script**, never re-typed or summarized.
The first cut left the router at 124 lines — under the 250–350 budget. Rather than pad it, the
sections consulted on *every* task (specialist choice, promotion gate, bead titles, SCRUTINY,
escalation) were promoted from the references into the router and removed from those references.
Result: 256 lines, in budget, zero duplication.

Cross-references between files (rule 14 naming the Git State Precondition; the merge doc pointing
back at it) are deliberate — they are pointers, not copies. The invariant enforced by tests is
*section ownership*: each authoritative section body lives in exactly one file.

## Evidence

**Deterministic (51 tests).**
`tests/unit/skills/using-specialists-layout.test.ts` (15) — line budget, link reachability, no
content loss, no duplication, migration-map completeness, asset-contract hash parity, fresh-install
`cpSync` mirror, selective loading.
`tests/unit/skills/selective-loading.test.ts` (25) — one owner per phase, router routes to it, and
the router alone answers always-needed questions.
`tests/unit/skills/role-envelope-parity.test.ts` (11) — the prompt-envelope parity matrix.
`tests/unit/specialist/using-specialists-evals.test.ts` (5) — eval-set guard, incl. the three new
progressive-disclosure scenarios.

**Negative proof.** The budget test fails on the old layout by construction (1416 > 350), and the
`.2.1` skill-path suite fails 8/9 on unfixed master. The tests catch the bugs; they do not merely pass.

**Live smoke** (against the globally installed v3.8, through the Pi runtime root):

```
$ pi --skill ~/.xtrm/skills/default/using-specialists/SKILL.md --print \
    "I am about to merge a finished chain. Which reference does the router send me to? State rule 9."
references/merge-and-integration.md
Rule 9: ... manual git (Cherry-Pick Playbook, FF, or `git merge --no-ff`); never `sp merge` / `sp epic merge`.
```

Routed correctly, and answered rule 9 **from the router alone** — no reference loaded. Then:

```
$ pi --skill .../SKILL.md --print "Follow the router: open the reference for MERGING and read it..."
/home/dawid/.pi/agent/skills/using-specialists/references/merge-and-integration.md
Cherry-Pick Playbook
```

The on-demand resource resolved through `~/.pi/agent/skills` — the real runtime startup root.

**Install parity.** `diff -r` source vs `~/.xtrm/skills/default/using-specialists` → identical; all 7
router links resolve from the installed location; reachable via both `~/.pi/agent/skills` and
`~/.claude/skills`.

## Prompt-envelope parity matrix

Task-side content for the three surfaces, per the `unitAI-6639v.1` decision:

| Layer | `sp run` | `xt pi --role` | `xt claude --role` |
|---|---|---|---|
| `task_template` + bead/dependency context | yes | yes | yes |
| MANDATORY_RULES (≤2000 tok, else dropped) | yes | yes | yes |
| `prompt.system` | never on the task side | never | never |
| `$pre_script_output` (executes shell) | yes | **no** — execution-only | **no** |
| reviewer git-diff context (executes git) | yes (reviewer only) | **no** — execution-only | **no** |
| mandatory-rule resolution failure | warn + skip | **fatal** | **fatal** |
| `prompt_hash` | sha256[0:16] over the rendered task | identical when no execution-only layer applies | identical |

`pi` and `claude` are byte-identical on the task side — `--surface` is recorded as metadata and must
never alter content (test-enforced). All three are produced by **one** seam,
`src/specialist/task-prompt.ts:renderTaskPrompt`, so the matrix cannot drift.

## Known limitations

- **`xt <runtime> --role` was not smoked through the launcher.** It refuses to run from inside a
  worktree ("cd to the main repo checkout"), and running it from the main checkout would resolve
  `chain-coordinator` from `master` — i.e. smoke the *old* spec, not this branch. The skill-loading
  behaviour it depends on is instead proven live above (both runtime roots) and deterministically by
  the parity matrix. Re-run the launcher smoke after this branch merges.
- **Claude role behaviour** is covered by the same deterministic contract plus the
  `~/.claude/skills` reachability check, not a live Claude session.
- The globally installed copy is a **dev install of an unreleased branch**; the next release replaces
  it with the published artifact, which ships the same tree (asset contract tracks all 8 files with
  hashes). Rollback backup: `/tmp/skills-backup-131818`.
