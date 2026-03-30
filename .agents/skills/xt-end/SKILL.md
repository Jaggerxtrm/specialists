---
name: xt-end
description: |
  Autonomous session close flow for xt worktree sessions. Use this skill whenever
  the user says "done", "finished", "wrap up", "close session", "ship it", "I'm done",
  "ready to merge", or similar. Also activate when all beads issues in the session
  are closed, or when the user explicitly runs /xt-end. This skill is designed for
  headless/specialist use: it must make deterministic decisions, auto-remediate common
  anomalies, and avoid clarification questions unless execution is truly blocked.
---

# xt-end — Autonomous Session Close Flow

You are closing an `xt` worktree session. The canonical CLI is `xt end`, but you must normalize the session first and automatically handle common anomalies.

## Operating Mode

Default to **autonomous execution**:
- do not ask the user routine clarification questions
- prefer deterministic fallbacks over conversational review
- only stop when a real blocker prevents safe progress
- **always invoke `xt end --yes`** — never call `xt end` without this flag; the bare command prompts interactively for worktree removal which blocks autonomous execution

## Success States

Use these mental result classes while operating:
- `SUCCESS_PR_CREATED`
- `SUCCESS_PR_CREATED_WITH_WARNINGS`
- `BLOCKED_UNCLOSED_SESSION_WORK`
- `BLOCKED_NO_COMMITS`
- `BLOCKED_AUTH`
- `BLOCKED_CONFLICTS`
- `BLOCKED_DIRTY_UNCLASSIFIED_CHANGES`

---

## Stage 1 — Session Work Audit

Run:
```bash
bd list --status=in_progress
bd list --status=open
git log --oneline @{upstream}..HEAD 2>/dev/null || git log --oneline origin/main..HEAD 2>/dev/null || git log --oneline
```

Rules:
- **Block** on `in_progress` issues
- **Do not block** on unrelated open backlog issues
- infer **session-touched issues** from commit messages and recent session work
- if a touched issue is still not closed, close it if the work is complete; otherwise stop with `BLOCKED_UNCLOSED_SESSION_WORK`

This skill is stricter about unfinished session work than about unrelated backlog.

---

## Stage 2 — Tree Normalization

Run:
```bash
git status --short
```

If clean, continue.

If dirty:
- if the changes clearly belong to the just-finished session work, commit them automatically
- if they look like unrelated WIP, stash them with a labeled stash message
- never run `xt end` with a dirty tree

Preferred automatic actions:
```bash
git add -A && git commit -m "<descriptive summary> (<issue-id>)"
# or

git stash push -m "xt-end:auto-stash before session close"
```

If changes cannot be classified safely, stop with `BLOCKED_DIRTY_UNCLASSIFIED_CHANGES`.

---

## Stage 2.5 — Scope Verification

Before committing or pushing, verify that branch changes match the expected scope of the session's closed issues. **Never skip this step** — unreviewed scope is the primary source of oversized or unintended PRs.

Run:
```bash
git diff --stat origin/main..HEAD 2>/dev/null || git diff --stat $(git merge-base HEAD main)..HEAD
```

For each significantly changed symbol, check blast radius:
```bash
npx gitnexus impact <symbol-name>                   # upstream dependants — what else breaks
npx gitnexus impact <symbol-name> -d downstream    # downstream dependencies
```

For Claude agents with MCP access, also run:
```
gitnexus_detect_changes({scope: "compare", base_ref: "main"})
```

**Rules:**
- Changes clearly tied to session issues → continue
- Files unrelated to session issues → classify as overscoped (handle in Stage 3D)
- `npx gitnexus impact` returns HIGH or CRITICAL risk on a changed symbol → **stop and report to user** before continuing

---

## Stage 3 — Dry Run and Anomaly Detection

Run:
```bash
xt end --dry-run
```

Parse the preview and check for anomalies:

### A. Generic PR title
Treat these as invalid:
- `session changes`
- `update`
- `updates`
- `misc`
- `wip`
- `work in progress`

Auto-remediation:
- prefer closed issue titles from this session
- otherwise infer from changed files / dominant area
- examples:
  - `Add docs cross-check command and tests`
  - `Integrate docs workflow with sync-docs`
  - `Update docs workflow and CLI help`

### B. Missing beads linkage
If dry-run says no beads issues were found, but commit messages contain issue-like IDs, treat that as a tooling mismatch.

Auto-remediation:
- extract issue IDs directly from commit messages
- continue with those IDs as manually inferred linkage
- report the mismatch in the final summary

### C. Generated artifacts in scope
If files like `dist/` are included:
- keep them if the repo conventionally commits built artifacts
- otherwise revert them before continuing

Use repository history/common practice as the heuristic; do not ask.

### D. Overscoped PR
Classify the PR scope into buckets:
- source
- tests
- docs
- skills
- generated artifacts

If all buckets support one coherent feature/change, continue.
If they look unrelated, continue but mark the PR as `WITH_WARNINGS` and mention overscope in the final report.

After auto-remediating anomalies, re-run:
```bash
xt end --dry-run
```

Repeat until the preview is acceptable or a hard blocker appears.

---

## Stage 4 — No-Commit / Session-Sanity Gate

Before actual execution, ensure the branch really has changes:
```bash
git log --oneline @{upstream}..HEAD 2>/dev/null || git log --oneline origin/main..HEAD 2>/dev/null
```

If there are no commits ahead of base, stop with `BLOCKED_NO_COMMITS`.

---

## Stage 5 — Run xt end

Run:
```bash
xt end --yes
```

Use non-interactive mode by default for autonomous execution.

### If it succeeds
Capture:
- rebase success
- push success
- PR URL
- linked issue count

### If rebase conflicts occur
Run:
```bash
git status
```

Resolve all conflict markers, then:
```bash
git add <resolved-files>
git rebase --continue
xt end --yes
```

If conflicts are too complex to resolve safely, stop with `BLOCKED_CONFLICTS`.

### If push fails
Try:
```bash
git fetch origin
xt end --yes
```

### If `gh` auth fails
Stop with `BLOCKED_AUTH` and report:
```bash
gh auth login
```

---

## Stage 6 — Autonomous Cleanup

Default behavior: **remove the worktree automatically** after a successful PR creation.

Rationale:
- branch is pushed
- PR is open
- worktree is disposable local state

If cleanup is needed after `xt end --yes`:
```bash
git worktree remove <path> --force
```

Keep the worktree only if an explicit keep policy exists (for example, known immediate follow-up work on the same branch).

---

## Stage 7 — Final Report

Always report:
- final result class (`SUCCESS_PR_CREATED` or `SUCCESS_PR_CREATED_WITH_WARNINGS`)
- PR URL
- linked or inferred issues
- whether anomalies were auto-remediated
- whether the worktree was removed
- reminder: monitor CI and merge when green; no auto-merge assumption

If linkage had to be inferred from commits rather than detected by `xt end`, say so explicitly.

---

## Edge Cases

**Already on main/master/default branch**
- stop immediately; this is not an xt worktree session

**No commits yet on branch**
- stop with `BLOCKED_NO_COMMITS`

**Dirty tree with unclear ownership**
- stop with `BLOCKED_DIRTY_UNCLASSIFIED_CHANGES`

**`gh` not authenticated**
- stop with `BLOCKED_AUTH`

**beads unavailable**
- continue PR creation if possible
- infer issues from commit messages when available
- report linkage as unavailable/manual

**Multiple anomalies at once**
- remediate in order:
  1. dirty tree
  2. missing commits
  3. generic title
  4. missing issue linkage
  5. generated artifacts
  6. overscope warning

## Policy Summary

The autonomous rule is simple:
- normalize the session
- verify scope with gitnexus before committing
- dry-run
- auto-fix predictable anomalies
- rerun dry-run
- execute non-interactively
- clean up automatically
- stop only on genuine safety blockers
