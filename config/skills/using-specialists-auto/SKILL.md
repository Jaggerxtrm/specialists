---
name: using-specialists-auto
description: >
  Operator-offline autonomous orchestration overlay. Activate when the user says
  "auto mode", "full auto", "run autonomously", "I'll leave you alone", or
  similar — and hands over a multi-item priority list. Layers on top of
  `using-specialists`: paranoid pacing, dispatch loop shape, dist-rebuild
  discipline, escalation triggers specific to unsupervised runs. Does NOT
  duplicate the canonical skill's bead contracts, sleep table, rebuttal patterns, escalation
  matrix, or session-end handoff — refers to the canonical skill for those.
version: 2.0
---

# Using Specialists — Auto Mode (overlay)

You are running unsupervised. Every shortcut you skip costs the operator on return. Move slowly enough to be correct.

`using-specialists` is the canonical specialist orchestration skill — bead contracts, role selection, advisory passes, sleep cadence, rebuttal patterns, escalation matrix, session-end handoff all live there. This skill adds **only** the discipline overlay that changes when no operator is present to catch drift.

## When this skill activates

User explicitly hands over autonomy: "auto mode", "go", "I'll leave you alone", "run the list", "do them all". Skill stays active until session end or the operator returns. Do NOT activate on a single ad-hoc task.

## Auto-mode-specific rules (in addition to canonical hard rules)

These EXTEND the canonical skill's Non-Negotiable Rules + Escalation Matrix — they do not replace them.

1. **Default to serial chains.** Auto-mode rarely benefits from parallel chains; the project-wide commit gate (canonical → Bead Lifecycle) forces serial-tail anyway. Only parallelize when file scopes are provably disjoint AND the time savings outweigh the conflict-resolution cost (rare).
2. **Re-read each bead and defend each field in your head before launching.** If you can't, the bead isn't ready. Title-only beads waste a turn.
3. **Rebuild + smoke after each P0 (and after every chain touching `src/`).** Skipping breaks the next chain's baseline silently.
4. **One rebuttal per reviewer, then escalate.** the canonical skill documents the rebuttal pattern — auto-mode just caps the loop count.
5. **Session-close report is non-optional.** Operator returning to a clean tree but no report = blind cold-start next session. Follow `/session-close-report` skill at session end.

## Per-item loop shape

```
read bead → write 7-section contract (child impl bead) → bd dep add parent→child
  → sp run executor --bead <impl> --keep-alive --context-depth 3 --background
  → sleep 10 && sp ps                              # confirm started, not stuck queued
  → sleep <role-typical from canonical skill> & sp ps  # check its Monitoring section
  → sp result <exec-job>                           # consume immediately on transition to waiting
  → optional advisory passes per canonical skill (seconder if smelly, security-auditor if risk surface)
  → write reviewer bead contract → sp run reviewer --bead <review> --job <exec-job> --background
  → sleep 90 & sp ps
  → sp result <reviewer-job>
  → PASS?    → sp finalize <exec> → sp merge → rebuild dist → smoke → close chain (memory ack first)
  → PARTIAL? → resume executor with exact findings → resume reviewer
  → FAIL with valid evidence?       → stop and report (file follow-up bead)
  → FAIL with overcautious gate?    → rebut once with cited evidence (canonical → Specialist Rebuttal As Routine)
```

## Dist rebuild + commit after every P0 or src/-touching chain

```bash
bun build src/index.ts --target=bun --outfile=dist/index.js
sed -i '1s|#!/usr/bin/env node|#!/usr/bin/env bun|' dist/index.js
chmod +x dist/index.js
git add dist/index.js dist/types/<changed-paths> 2>/dev/null
git commit -m "build: rebuild dist after <bead-id> <one-line summary>"
```

Without this, the next chain's tests/smokes run against stale dist and the globally-installed `sp` binary (symlinked to local `dist/index.js`) silently uses pre-fix behavior.

## Smoke per chain

Tighter than the canonical skill's E2E Smoke Phase (which is integration-end). Per-chain smoke is:

- `bunx tsc --noEmit` clean
- The targeted test(s) the chain added — green
- After P0 also: `sp --version`, the specific CLI surface that changed, and (if runtime resolution touched) the same command from a non-repo cwd (`cd /tmp/smoke && sp <cmd>`)

If any chain in the session touched auth/secrets/input/dep-lock surface, do the canonical skill's cross-cutting security-auditor pass once at end before session close.

## Pre-merge state hygiene (transitional)

`sp merge` now ignores `.beads/` and `.xtrm/skills/active/**` (per `unitAI-pqe96` shipped this session). The globally-installed `sp` symlinks to local `dist/index.js`, so after `npm install -g .` the fix is live locally. If you still see `sp merge` refuse on dirty state, the leftover is usually a STAGED `.beads/issues.jsonl` (`M ` not ` M`):

```bash
git restore --staged .beads/issues.jsonl 2>/dev/null
git checkout -- .beads/issues.jsonl 2>/dev/null
sp merge <chain-root-bead>
```

In the worktree, drop noise stash before merging if `.xtrm/skills/active/...` files are dirty:

```bash
git stash push -u -m "noise" -- .xtrm/
```

After merge cleanup: `git worktree remove <path> --force`, `git branch -D feature/<bead>-<role>`, `git worktree prune`, `rm -rf .worktrees/<bead>`.

## Auto-mode-specific escalation triggers

These supplement the canonical skill's Escalation Matrix — stop and report when:

- Reviewer FAIL twice after one rebuttal attempt (canonical rebuttal limit hit).
- Any chain looped twice with no progress.
- Repeated specialist crashes (>2 same role).
- Cross-project state pollution (specialists from another repo holding locks/processes).
- Anything that would otherwise require a canonical-skill hard-rule break.

When you stop: file an issue bead with concrete evidence (PIDs, job IDs, exact error), save a memory if the failure mode is durable, write a partial session-close report, do NOT abandon mid-merge.

## Session start (auto-specific)

In addition to the canonical skill's session-start patterns (`bd prime`, `bv --robot-triage`):

```bash
specialists list --full     # confirm current roles + models (registry may have drifted)
sp ps                        # 0 active expected
git worktree list           # main only expected (specialist worktrees from prior sessions should be cleaned)
git status -s               # clean expected
bd ready                     # work to pick up
```

If any of these are dirty (active jobs, lingering worktrees, dirty tree from prior session), reconcile before claiming new work.

## Session close (mandatory)

Per canonical → At Session End — Mandatory Handoff. Auto-mode addenda:

1. Confirm `sp ps` empty (0 running, 0 waiting) and `git worktree list` shows only main.
2. Drop accumulated stashes if they contain only known noise.
3. Memory gate at session level: `bd kv set "memory-gate-done:<session-id>" "saved: <durable-insights>"` (or `"nothing novel: <reason>"`).
4. Run `/session-close-report` skill — fills the canonical report template, drives CHANGELOG sync, commit, push.

## Telltale signs you're drifting from auto-mode discipline

- Skipping bead contracts because "the change is small" → write it anyway, costs nothing, downstream specialist needs it.
- Polling `sp ps` more often than the canonical skill's sleep table → wastes context.
- Letting executors run >2× expected without `sp feed` → blocking future work.
- Accepting reviewer FAIL without cited evidence in the rebuttal → produces longer loops.
- Manually editing a config file because "the executor would just do the same thing" → breaks the canonical skill hard rule 13 (orchestrator never edits code), no audit trail.
- Skipping `bun run build` after src/ change → next chain's smoke fails for unrelated reason.
- Closing the parent bead before chain memory saved → loses durable insight forever.

Read once at session start. Re-read if you catch yourself drifting.
