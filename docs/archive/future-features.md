# Future Features Backlog

Stability-first triage moved the following open issues out of the active shipping path. These are not considered crucial for a clean working product right now, but remain useful as future upgrades once the core product is stable.

## Workflow and automation

- `unitAI-c64` — Memory curator specialist
  - Review completed specialist runs, compare against `bd memories`, and suggest durable memory updates.

- `unitAI-hos` — Commit/PR provenance hook
  - Auto-wire commit and PR references back to the active bead for stronger traceability.

- `unitAI-9xa` — `specialists clean`
  - Explicit command for job directory cleanup beyond the existing automatic GC in `Supervisor`.

## Specialist catalog expansion

- `unitAI-jj83` — Generic specialist archetypes
  - Reusable explorer/executor/reviewer/analyst/planner/tester definitions.

- `unitAI-rlne` — Challenger specialist
  - Adversarial critic specialist for plans, ideas, code, and outputs.

- `unitAI-1pxf` — `specialists run --read-only`
  - Safety override to force read-only execution regardless of configured permission tier.

## Orchestration and multi-agent systems

- `unitAI-dzbk` — Parallel-runner / multi-agent orchestrator
  - Fan-out/fan-in, review loops, and coordinated specialist execution.

- `unitAI-2pl1` — Planner → Explorer → Test-Planning pipeline
  - Single pipeline that chains planning, exploration, and test issue generation.

## Persistent lifecycle / xt-merge ideas

- `unitAI-n1b` — Persistent and event-driven specialist lifecycle
  - Long-lived event-driven specialist architecture.

- `unitAI-e1t` — Auto-spawn merge-master on worktree creation
  - Start xt-merge automation when new worktrees are opened.

- `unitAI-6dn` — Coordinate `xt end` with active merge-master
  - Session-close orchestration when merge automation is active.

- `unitAI-5m0` — Worktree opening message should include merge-master status
  - Better operator visibility for xt-merge state.

## Docs and quality improvements to revisit later

These still have value, but they are backlog work rather than immediate ship work:

- `unitAI-pple` — Expand deep technical docs after SSOT hub recovery
- `unitAI-3nwl` — Schema review and documentation
- `unitAI-mi6j` — Add TypeScript compilation check to `specialists doctor`
- `unitAI-j8gj` — Fix duplicated backend prefix in run footer
- `unitAI-tv3` — Implement `specialists status --job <id>`

## Active ship-stability focus instead

Current stabilization priority is:

1. `unitAI-80y9` — Fix current test and TypeScript regressions blocking ship readiness
2. `unitAI-f0oh` — Implement `stall_timeout_ms` watchdog in `PiAgentSession`
3. `unitAI-agkd` — Persist `bead_id` immediately for `--bead` runs
4. `unitAI-9o9z` — Planner hierarchy bug
