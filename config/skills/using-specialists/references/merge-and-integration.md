# Merge and integration

> Manual merge doctrine, cherry-pick playbook, debugger-restitch, worktree cleanup, commit ordering, E2E smoke, failure recovery.
> Loaded on demand from [SKILL.md](../SKILL.md) — not eagerly injected.
> Always-needed policy (rules, gates, escalation, specialist choice) stays in the router; it is not repeated here.

## Merge And Publication (manual git is canonical)

> **Rule #9:** `sp merge` and `sp epic merge` are prohibited — known broken, awaiting a separate rework epic. Even if `sp help` shows them, do not use. The Cherry-Pick Playbook below is the canonical merge path for specialist-owned work.

### Per-chain merge (standalone or one chain at a time inside an epic)

After reviewer PASS on a chain whose work lives in `feature/<bead-id>-<slug>` worktree:

```bash
# 1. Verify reviewer PASS verdict was recorded (Release Checklist clean)
bd show <bead-id>   # check notes for the verdict

# 2. Verify the chain's gates passed:
#    seconder OK | obligations-scanner CLEAN | security-auditor clean (if surface)
#    Reviewer's Release Checklist block enumerates these.

# 3. Switch to target branch (master or integration/<date>) and FF or merge
git checkout <target>
git pull --ff-only origin <target>
git merge --no-ff feature/<bead-id>-<slug> -m "Merge <bead-id>: <summary>"
git push origin <target>

# 4. Cleanup the chain worktree + branch
git worktree remove <chain-worktree-path>
git branch -d feature/<bead-id>-<slug>
git worktree prune
```

Use `git update-ref` for FF-equivalent when checkout is blocked by transient working-tree state (e.g., bd auto-export churn on `.beads/issues.jsonl`):

```bash
git merge-base --is-ancestor <target> feature/<bead-id>-<slug> && \
  git update-ref refs/heads/<target> feature/<bead-id>-<slug> && \
  git push origin <target>
```

### Multi-chain epic merge

Use the Cherry-Pick Playbook (below). Each chain lands as one squash commit on an integration branch (visible to operator before main), then operator FF-merges integration → main when satisfied.

### Closing the keep-alive specialists

If reviewer/executor jobs are still `waiting` after PASS:

```bash
sp stop <waiting-job-id>   # explicit close per job; verify with sp ps before
```

No automatic cascade-finalizer. Close each waiting job explicitly. (Yes, this is more ceremony than `sp finalize` provided — but `sp finalize` lived inside the broken sp merge path.)

### Rules

- Merge only after reviewer PASS + clean Release Checklist unless operator explicitly accepts a draft.
- Always use `git merge --no-ff` for chain merges to keep the chain branch visible in history.
- If merge reports a dirty worktree on the target branch, inspect what's dirty. Revert generated noise (e.g., `.beads/issues.jsonl` churn) only when clearly unrelated; otherwise ask the operator.
- After merge, always remove the chain worktree + delete the branch + prune.
- Stale-base failures: per Git State Precondition section, dispatch chains only when target branch HEAD contains all prior dependent chains' commits.

## Integration Phase — Cherry-Pick Playbook (canonical multi-chain merge)

The canonical path for landing multiple specialist chains. Operator gets visibility on an integration branch before the work hits main.

### Step-by-step

1. Stash uncommitted state on working branch: `git stash push -u -m "pre-integration"`.
2. Create integration branch off the working branch: `git checkout -b integration/<date>-orchestrator`.
3. For each non-overlapping chain (security/critical first, then test-baseline, then features):
   - `git merge --squash <chain-branch>`
   - Restore noise files (see "Chain noise filter checklist" below)
   - **Advisory passes** before commit: if the staged diff smells overcomplicated/duplicative/type-risky, dispatch `seconder --job <last-exec-job-of-chain>`; if it touches auth/secrets/input/agent-config, dispatch `security-auditor --job <last-exec-job-of-chain>`. Link those beads with `bd dep add <advisory-bead> <chain-bead> --type validates`. Apply findings or document why skipped.
   - `git commit -m "<type>(<scope>): <summary> (<bead-id>)"` — one squash commit per chain.
4. For each overlapping chain, add `bd dep relate <overlap-a> <overlap-b>` if not already linked, then switch to the **debugger-restitch** pattern (next section).
5. Before publication, run `bd dep cycles`; fix any accidental cycle before operator FF-merges integration → main.
6. After all chains land, run E2E smoke phase (below) before declaring done.
7. Operator FF-merges integration → main when satisfied.

### Chain noise filter checklist

For manual cherry-pick / squash flows, unstage these before committing (otherwise the chain commit will carry orchestrator-bookkeeping noise):

- `.pi/npm` — accidentally created by xt commands inside worktrees
- `cli/pnpm-lock.yaml`, `cli/pnpm-workspace.yaml` — pnpm side-effects
- `AGENTS.md`, `CLAUDE.md` — gitnexus stat-refresh hook noise
- `.beads/issues.jsonl`, `.beads/interactions.jsonl` — bd state churn
- `.specialists/executor-result.md` — transient specialist output

```bash
git restore --staged .beads .pi AGENTS.md CLAUDE.md
git checkout HEAD -- .beads AGENTS.md CLAUDE.md
rm -f .pi/npm
```

If a chain commits its own `.beads` symlink (older bd-in-worktree behavior), `rm -f .beads` then `git checkout HEAD -- .beads` to restore the real directory.

## Debugger-Restitch Pattern

When chain X conflicts with already-landed chain Y on shared files, raw `git cherry-pick` will revert Y's work. The debugger-restitch pattern preserves both, but only when the debugger gets an explicit "preserve already-landed work" contract.

1. **Reopen X**: `bd reopen <X> --reason="integration stitch onto post-Y state"`. If the old X chain is no longer publishable, create a restitch bead and mark replacement explicitly: `bd supersede <X> --with <X-restitch>`. Link X and Y with `bd dep relate <X-restitch> <Y>` for conflict context; use `caused-by` only when a concrete failure bead is attributable to Y's already-landed change.
2. **Strengthen the bead contract** with these fields:
   - `## CRITICAL CONSTRAINTS:` heading at the top.
   - "Fork off `integration/<date>-orchestrator`. Verify with `git log integration/...$..HEAD` empty before any commits."
   - List the symbols/lines from Y that MUST be preserved verbatim (with file paths).
   - "ADD X's intent ON TOP" with a numbered list of the additions.
   - "Reference original `feature/<X>-executor` for symbol shapes only — do NOT cherry-pick or merge. Re-implement on integration's current state."
   - `## VALIDATION:` includes both Y's tests passing AND X's new tests passing.
   - `## OUTPUT:` mandates a 5-line code excerpt showing both Y and X features coexisting.
3. **Dispatch debugger** with `--force-stale-base` if X is an epic child:
   ```bash
   sp run debugger --bead <X> --force-stale-base --keep-alive
   ```
4. **Sanity check the result**: when debugger reports back:
   ```bash
   git log integration/<date>..feature/<X>-debugger --oneline
   git diff integration/<date>...feature/<X>-debugger -- <key-files>
   ```
   Confirm the debugger's diff is **additive** — no reverts of Y's lines.
5. **Advisory passes**: before landing the restitch, dispatch `seconder --job <debugger-job>` if the restitch added control-flow complexity, and `security-auditor --job <debugger-job>` if it touched a sensitive surface. Link each advisory bead back with `bd dep add <advisory> <X-restitch-or-X> --type validates`. Restitched diffs are higher-risk than fresh executor diffs because the debugger had to thread around already-landed work.
6. **Land via FF or cherry-pick the named commit** (NOT the checkpoint commit). Look for the commit with the proper `<type>(<scope>):` message; ignore `checkpoint(debugger):` commits above it.
7. **Verify tests** before marking done.

### Failure mode to watch for

If the debugger forks off the OLD baseline (pre-Y) instead of integration, its commit will revert Y. Symptom: `git diff integration..feature/<X>-debugger -- <Y's-file>` shows DELETIONS of Y's symbols. Fix: resume the debugger with explicit "cd to a fresh worktree forked from `integration/<date>-orchestrator`" instruction. Re-verify with `git log integration..HEAD` empty. If the bad restitch became a tracked bead, supersede it with the corrected restitch bead so nobody merges the obsolete chain.

## Worktree Cleanup After Merge

Merge is now manual (see `Merge And Publication` below). You own cleanup after every merge.

After every merge, verify:

```bash
git worktree list                 # any orphaned worktrees from this session?
sp ps                             # any leftover jobs?
git worktree prune                # drop stale worktree metadata
```

Always remove the merged feature/epic worktree explicitly:

```bash
git worktree remove <path>
git branch -d <merged-branch>     # only after confirming merged into target
```

`sp ps` must have no active jobs and no unresolved terminal problems before session close. If it only shows old terminal history that you have intentionally acknowledged, run `sp clean --ps --dry-run` and then `sp clean --ps` to soft-hide those rows from the default dashboard. This does not delete SQLite history or change job status; use `sp ps --include-cleaned` or `sp ps --all` for audit visibility. Stale worktrees and stale jobs both block future dispatches.

## Bead Lifecycle And Parallel Commit Ordering

The bd commit-gate is **project-wide**, not per-worktree. While **any** bead in the project is `in_progress`, **no** worktree can commit. Practical consequences for parallel-chain epics:

- You CAN dispatch two executors in parallel — they work in separate worktrees, no commit-time collision.
- But once executor A returns and executor B is still running, you CANNOT commit A's worktree until B's bead is closed (or vice versa).
- Workflow: close the finished chain's executor bead FIRST (memory-ack + `bd close`), THEN commit that chain's worktree, THEN wait on the other chain.
- This forces a serial-tail on the commit step. Plan for it: parallel-dispatch saves time on the *thinking* step, not the commit step.

If the commit-gate blocks unexpectedly mid-orchestration, `bd query "status=in_progress"` reveals which claim is holding it open.

### Memory-gate batch close

`bd close` is blocked until `memory-acked:<id>` exists. For batch-closing many orchestrator-internal beads (sanity beads, reviewer beads, decomposition trackers), use:

```bash
for id in <impl> <sanity?> <review>; do
  bd kv set "memory-acked:$id" "saved:<chain-memory-key>"   # OR "nothing novel: <reason>"
done
bd close <impl> <sanity?> <review> <parent> --reason "..."
```

The chain memory key holds the actual durable insight (one per real fix). Sanity/review beads get "nothing novel" — the parent insight covers them.

## E2E Smoke Phase

Run **every** npm script + entry point that any chain added or modified. The smoke phase is the only way to catch missed chains, false-positive CI gates, missing intermediate files, and runtime regressions invisible to unit tests.

### Procedure

```bash
# Build sanity
bun run build   # or equivalent

# Test sanity — record PRE-baseline first
git checkout <baseline-branch>
bun test 2>&1 | tail -5   # record N failed / M passed

# Switch back and re-run
git checkout integration/<date>-orchestrator
bun test 2>&1 | tail -5   # MUST be ≥ baseline. Net regression is a stop-the-line.

# Run every check:* script the integration added
for s in $(jq -r '.scripts | keys[] | select(startswith("check:"))' package.json); do
  echo "=== $s ==="
  npm run "$s" 2>&1 | tail -10
done

# Targeted unit tests for chains touching the same files
bunx vitest run <chain-test-files>
```

For each smoke that fails, decide before continuing:
- False positive (script flags itself) → file follow-up bead, document, continue
- Missing dependency (vendor not run) → expected gate, document
- Real regression → stop, dispatch debugger to fix, re-smoke

### Cross-cutting security-auditor pass

If any landed chain in this integration touched auth, secrets, input handling, dependency lockfiles, or agent/MCP/config surfaces, dispatch one `security-auditor` on the cumulative integration diff BEFORE declaring smoke done:

```bash
git diff <baseline>..integration/<date>-orchestrator > /tmp/integration-diff.patch
sp run security-auditor --bead <sec-bead> --context-depth 3
```

Per-chain security-auditor passes catch chain-local risks; this cross-cutting pass catches interaction risks that only appear once all chains coexist (e.g. one chain weakens an input validator that another newly relies on). Skipping this on a sensitive-surface integration is an escalation event.

Record all smoke results in the session-close-report under a `## Smoke test results` table (see `/session-close-report` skill).

## Failure Recovery

When something fails:

```bash
sp ps <job-id>
sp feed <job-id>
sp result <job-id>
sp doctor
```

Then choose one action:

- Resume waiting executor/debugger with exact findings.
- Re-run with better bead if contract was weak.
- Re-scope bead if scope was wrong.
- Escalate if human decision is needed.
- Replace specialist only if failure mode repeats.

### Common failure patterns (and the canonical fix)

| Symptom | Cause | Fix |
|---|---|---|
| `git checkout <branch>` aborts with "would overwrite untracked/changes" mid-orchestration | bd auto-export keeps re-staging `.beads/issues.jsonl` after every bd op | Use `git update-ref refs/heads/<target> <source>` for FF-equivalent without checkout; or commit the .beads churn as a separate "chore(beads): export state" commit before switching |
| Stale `.git/index.lock` blocks git commands | bd hooks or other tooling crashed mid-operation | Check no real git process is running (`ps -ef \| grep "git "`); if clear, `rm -f .git/index.lock` and retry |
| `git add .beads/issues.jsonl` says "ignored by gitignore" but `git status` shows it modified | File is in `.git/info/exclude` but already tracked in the index | The staged change can still be committed directly (`git commit` without `git add`); don't fight the exclude |
| Validation fails with `command not found`, `vitest: not found`, missing Python tools, or `ERR_MODULE_NOT_FOUND` in a fresh worktree | Normal git worktree behavior: ignored dependency dirs (`node_modules/`, `.venv/`) are not copied into new worktrees | Run the repo's standard bootstrap inside that worktree (`make bootstrap`, `just setup`, `npm ci`, `uv sync`, etc.) or report bootstrap-required. Do not track dependency artifacts. |
| `sp ps` shows old terminal jobs after a session | Default dashboard keeps unresolved terminal problems visible until acknowledged | `sp clean --ps --dry-run`, then `sp clean --ps` to soft-hide from default ps; use `sp ps --include-cleaned`/`--all` for audit history |
| Reviewer keeps returning PARTIAL on functional contracts already met | Reviewer demanding tool-event evidence — typically obsoleted after the gate relaxation, but if it persists check the executor's `gitnexus_detect_changes` ran and use the rebuttal pattern (see Specialist Rebuttal As Routine) | Rebut with cited evidence; second FAIL = escalate |
| Multiple `sp run` background launches drop silently under shell parallelism | Known launch-ceremony race | Re-check `sp ps` after each dispatch and retry the missing one; serialize when reliability matters |
| `sp run` returns `Warning: job started but ID not yet available` and nothing appears in `sp ps --bead <id>` after 30s | Dispatch was refused by epic guard or base-staleness check; stderr now surfaces the refusal reason (see `sp run --background` post-fix) | Read the surfaced reason; retry with `--force-stale-base` if intentional, or fix the bead/lineage |
| `sp feed <job-id>` returns short tail with no tool events | Confirms DB-backed replay is active; if you see ≤10 lines on a real run, the DB is missing events for that job — verify with raw SQL on observability.db | If DB truly lacks events: re-run job; if DB has events but feed truncates: file bug bead — should not happen on current build |
| bd "database not found" or per-project Dolt server respawn | bd has spawned a per-project Dolt instead of routing to the shared server | `ps aux \| grep "<repo>/.beads/dolt" \| awk '{print $2}' \| xargs -r kill -9`; ensure `.beads/config.yaml` contains `dolt.shared-server: true`; `bd ready` should now route to `~/.beads/shared-server/` |
| Dolt journal corruption (`possible data loss detected at offset N`) | bd-internal | Operator-only — do NOT auto-recover. Stop bd writes, snapshot `~/.beads/shared-server/dolt`, run `dolt fsck` (read-only) first. Operator decides on `--revive-journal-with-data-loss` after reviewing the warning |

