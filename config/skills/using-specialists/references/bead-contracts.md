# Bead contracts

> How to write a dispatchable bead: full contract shape, per-bead-type contracts, and the dependency/relationship vocabulary.
> Loaded on demand from [SKILL.md](../SKILL.md) — not eagerly injected.
> Always-needed policy (rules, gates, escalation, specialist choice) stays in the router; it is not repeated here.

## Writing Bead Contracts Well

Bead quality controls specialist quality. A title-only bead produces wandering output because specialist has no contract to optimize against. Write contract before dispatch. Tighten vague scope before launch.

Bad bead:

```text
TITLE: Fix bug
PROBLEM: Something is broken.
SUCCESS: It works.
SCOPE: src/
NON_GOALS: N/A
CONSTRAINTS: Be careful.
VALIDATION: Tests pass.
OUTPUT: Done.
```

Good bead:

```text
TITLE: Fix feed cursor regression in sp result
PROBLEM: specialists feed follow skips events after restart because cursor tracks count, not last seq.
SUCCESS: feed follow resumes from last seen seq; result still reads terminal output.
SCOPE: src/cli/feed.ts, src/cli/result.ts, tests/unit/cli/feed.test.ts
NON_GOALS: No new runtime format, no DB schema change, no unrelated poll changes.
CONSTRAINTS: Preserve existing job IDs, keep backwards-compatible CLI output, avoid file-based fallback drift.
VALIDATION: Add regression test for restart resume; run targeted CLI tests.
OUTPUT: Changed files, test evidence, residual risks.
```

Fix three bad smells fast:

- Title-only bead. Add problem, scope, validation, output.
- Vague SCOPE like `src/`. Name files, symbols, or bounded docs.
- Missing VALIDATION. Say what proves done, not just that work is “finished.”

What differs: orchestrator writes contract before dispatch, so specialist does less guessing and more useful work.

## Bead Contract By Bead Type

Use shape that fits specialist.

> **SCRUTINY field is universal.** Every substantive bead should carry `SCRUTINY: none|low|medium|high|critical` at creation. It is a chain-property, not reviewer behavior; it controls chain structure and gate strictness per the SCRUTINY taxonomy section and canon §2.2. Reviewer may auto-escalate but never lower it. Canon refs: §2.2, §2.3, §2.5, §2.6.

Task/epic bead:

```text
PROBLEM: User-facing or project-facing objective.
SUCCESS: End-state across all child beads.
SCRUTINY: none|low|medium|high|critical    # required at creation; chain-property, not reviewer input
SCOPE: Area of project affected.
REFERENCES: Optional files, skills, or docs specialist reads only if work needs them.
NON_GOALS: Boundaries for entire effort.
CONSTRAINTS: Sequencing, compatibility, branch/merge rules.
VALIDATION: Final checks before close.
OUTPUT: What orchestrator reports back.
```

`SCOPE` is always loaded as context. `REFERENCES` is progressive disclosure: name what exists, but do not force load unless task needs it. Use this when a file would bloat payload today, like citing a huge skill file in scope and dragging in all lines before specialist even knows it must read them.

Example:

```text
SCOPE: config/skills/using-specialists/SKILL.md, docs/specialists/handoff-schema.md
REFERENCES: config/skills/prompt-improving/SKILL.md (xml_core conventions), sibling beads per-turn-handoff-schema and bead-id-verbatim once landed
```

Explorer bead:

```text
PROBLEM: What is unknown.
SUCCESS: Questions answered with evidence.
SCOPE: Code areas, docs, commands, or symbols to inspect.
NON_GOALS: No implementation, no broad audit outside scope.
CONSTRAINTS: READ_ONLY, cite files/symbols/flows.
VALIDATION: Findings cite evidence.
OUTPUT: Findings, risks, recommended implementation track, stop condition.
```

Debugger bead:

```text
PROBLEM: Symptom, regression, or failing test.
SUCCESS: Root cause plus minimal fix path.
SCOPE: Logs, reproduction, code paths, and related tests.
NON_GOALS: No broad refactor.
CONSTRAINTS: Preserve behavior outside fault line.
VALIDATION: Repro steps and diagnosis.
OUTPUT: Root cause, fix options, confidence, remaining unknowns.
```

Executor bead:

```text
PROBLEM: Exact behavior or artifact to change.
SUCCESS: Observable acceptance criteria.
SCRUTINY: none|low|medium|high|critical    # required at creation; chain-property, not reviewer input
SCOPE: Target files/symbols; include do-not-touch boundaries.
NON_GOALS: Related improvements explicitly excluded. (Include any accepted in-code obligation markers tracked in follow-up beads.)
CONSTRAINTS: API compatibility, style, migrations, safety.
VALIDATION: Lint/typecheck/tests or manual checks.
OUTPUT: Changed files, verification, residual risks.
```

Reviewer bead:

```text
PROBLEM: Verify executor output against requirements.
SUCCESS: PASS only if requirements + validation + Release Checklist satisfied.
SCRUTINY: none|low|medium|high|critical    # required at creation; chain-property, not reviewer input
SCOPE: Executor job, diff, task bead, acceptance criteria.
NON_GOALS: Do not rewrite unless explicitly asked.
CONSTRAINTS: Code-review mindset; findings first; emit Release Checklist.
VALIDATION: Run or inspect required checks; consume obligations-scanner output.
OUTPUT: PASS/PARTIAL/FAIL with file/line findings + Release Checklist block.
```

Test bead:

```text
PROBLEM: Validate one or more implementation chains.
SUCCESS: Relevant tests/checks pass or failures are diagnosed.
SCOPE: Commands and implementation beads covered.
NON_GOALS: No broad unrelated suite expansion unless requested.
CONSTRAINTS: Avoid destructive cleanup; report flaky/infra failures separately.
VALIDATION: Command output and failure interpretation.
OUTPUT: Pass/fail summary, failing tests, likely owner.
```

Sync-docs bead:

```text
PROBLEM: Exactly one doc drifted from source truth.
SUCCESS: One doc updated and drift checked clean.
SCOPE: One doc only.
NON_GOALS: No source-code rewrite.
CONSTRAINTS: Keep doc and source aligned.
VALIDATION: Drift scan or bounded source cross-check.
OUTPUT: Updated doc, drift evidence, remaining doc gaps.
```

What differs: orchestrator gives each specialist a contract shape that matches job, so role stays narrow and reviewable.

For evidence-heavy or multi-item beads, let `SCOPE`, `CONSTRAINTS`, and `EXAMPLES` carry opt-in XML tags. Follow prompt-improving `xml_core` style: wrap only the subpart that needs structure, not whole bead. Example: a debugger bead can put stack trace lines in `<evidence>` and do-not-touch items in `<constraints>`, so specialist can scan facts fast without turning every field into markup.

## Dependency Linking And Relationship Vocabulary

Link beads with correct edge shape. The edge tells orchestrator what blocks execution, what only preserves context, which bead verifies another, and which issue has been replaced. Do not overload `blocks` for follow-ups, root-cause links, verification pairs, duplicates, or restitch replacements.

Core commands:

- `bd dep add <issue> <depends-on>`: issue depends on depends-on; depends-on blocks issue. Default type is `blocks`. Use only for hard sequencing. [source: bd dep add --help]
- `bd dep <blocker> --blocks <blocked>`: reverse phrasing of the same hard sequencing edge. [source: bd dep --help]
- `bd dep add <issue> <other> --type <type>`: store a typed relationship. Supported types: `blocks`, `tracks`, `related`, `parent-child`, `discovered-from`, `until`, `caused-by`, `validates`, `relates-to`, `supersedes`. [source: bd dep add --help]
- `bd dep relate <a> <b>` / `bd dep unrelate <a> <b>`: bidirectional non-blocking `relates_to` link. Use for context, not order. [source: bd dep --help]
- `bd create --parent <bead-id>`: hierarchical child edge; auto-names child `<parent>.1`, `<parent>.2`, … and nests recursively — a child's own child becomes `<parent>.1.1`. `<bead-id>` can be an epic, a plain task, or an already-nested child; bd does not restrict `--parent` by issue type (`bd create --help` describes it generically as "Parent issue ID for hierarchical child"). [source: bd create --help]
- `bd create --deps discovered-from:<id>` or `bd dep add <new> <source> --type discovered-from`: follow-up work discovered from a source bead.
- `bd duplicate <new> --of <canonical>`: close duplicate issue and point at canonical. Use when two beads describe the same required work.
- `bd duplicates` / `bd find-duplicates --status open --method ai --json`: find exact or semantic duplicates before dispatching parallel chains.
- `bd supersede <old> --with <new>` or `bd dep add <new> <old> --type supersedes`: mark a replacement when a better-scoped fix bead replaces an obsolete/abandoned one.
- `bd dep cycles`, `bd dep tree <id>`, and `bd graph <id>`: sanity-check the execution graph before merge/publication.

**Default to nesting, not loose beads.** When a chain is dispatched to service an existing bead — a top-level task, an epic, or an already-nested child like `bd-x.1` — create the new bead with `bd create --parent <that-bead>` so it inherits the next sequential child ID (`bd-x.1`, or `bd-x.1.1` if the parent is itself a child). This applies uniformly, not only under epics — the common failure mode is orchestrators treating `--parent` as epic-only and defaulting every explorer/executor/reviewer/seconder/security bead spawned mid-chain to a loose top-level bead linked solely by a typed dep. `--parent` (hierarchy/ID) and a typed `bd dep add ... --type <blocks|validates|discovered-from>` edge (semantic relationship) are independent flags — combine both when the relationship needs naming beyond parentage. Only skip `--parent` when the new bead is a genuine standalone sibling concern, not work done on behalf of the bead it services.

Relationship vocabulary for specialist chains:

| Relationship | Reach for it when | Example command |
| --- | --- | --- |
| `blocks` | Hard must-happen-before sequencing: planner before executor, implementation before reviewer, restitch before publish. | `bd dep add <impl> <plan> --type blocks` |
| `tracks` | A local bead mirrors upstream or cross-project work whose status matters but is not owned here. | `bd dep add <local> external:xtrm-tools:<capability> --type tracks` |
| `related` | Loose topical association when no direction or scheduling effect is intended. Prefer `bd dep relate` for bidirectional relation. | `bd dep add <a> <b> --type related` |
| `parent-child` | Any bead spawns tracked child work — epic owning chains, a task spawning its explorer/executor/reviewer, or an already-nested child spawning its own sub-chain. Prefer `bd create --parent <bead>` (not only `<epic>`) so IDs nest and parentage stays canonical instead of drifting into loose top-level beads. | `bd create --parent <bead-id> --title "executor: Impl auth retry" ...` |
| `discovered-from` | Reviewer, debugger, explorer, or test-runner surfaces new follow-up work from a run. | `bd dep add <follow-up> <reviewer-bead> --type discovered-from` |
| `until` | Time-bounded or event-bounded precondition that blocks only until a stated condition lands. | `bd dep add <chain> <precondition> --type until` |
| `caused-by` | Failure bead points to the root-cause bead/cluster that explains it. Makes test-failure-map epics navigable. | `bd dep add <failing-test> <root-cause> --type caused-by` |
| `validates` | Reviewer, test-runner, seconder, or security-auditor bead verifies an implementation/debugger bead. | `bd dep add <review> <impl> --type validates` |
| `relates-to` | Bidirectional context edge for conflict clusters, sibling designs, or rebuttal patterns. Prefer dedicated relate command. | `bd dep relate <chain-a> <chain-b>` |
| `supersedes` | New fix/design/restitch bead replaces an older bead that should no longer be executed or merged. Prefer `bd supersede`. | `bd supersede <old> --with <new>` |

Worked high-value patterns:

```bash
# Reviewer discovers a separate follow-up during review. Do not block the impl.
bd create --title "Follow up: tighten retry metrics" --type task --priority 3 --description "..."
bd dep add <follow-up> <review> --type discovered-from

# Test-failure-map root cause: many failures point at one underlying issue.
bd create --title "Root cause: stale fixture factory" --type bug --priority 2 --description "..."
bd dep add <failing-test-bead> <root-cause> --type caused-by

# Verification bead validates implementation. This is not a hard prerequisite edge.
bd dep add <test-runner-bead> <impl> --type validates
bd dep add <reviewer-bead> <impl> --type validates

# Replacement bead supersedes an abandoned or wrongly scoped implementation.
bd create --title "Restitch auth retry onto integration state" --type task --priority 2 --description "..."
bd supersede <old-impl> --with <restitch>

# Before merging an epic or integration branch, prove the graph is sane.
bd dep cycles
bd graph <epic> --compact
```

Use each form for a different reason:

- `blocks` / `--blocks` for must-happen-before dependency only.
- `validates` for review, test, sanity, and security evidence.
- `discovered-from` for spawned follow-up beads.
- `caused-by` for failure-to-root-cause attribution.
- `relates-to` / `bd dep relate` for soft linkage with no schedule effect.
- `parent-child` / `--parent` for hierarchy and child naming — use for any bead spawned to do work on behalf of another bead, not only epic ownership. Nests recursively: a chain dispatched from an already-nested child (e.g. `bd-x.1`) becomes `bd-x.1.1`, not a new loose top-level bead.
- `supersedes` / `bd supersede` for replacement work; `duplicate` for same-work issues.

Cross-repo consistency: keep this vocabulary aligned with the xtrm-tools triaging skill and sibling triage bead `xtrm-drkk`; both should use the same relationship names when rewiring issue graphs.

What differs: orchestrator chooses edge type deliberately, so graph stays correct for chain execution, epic publish, duplicate cleanup, root-cause navigation, verification evidence, and follow-up traceability.

