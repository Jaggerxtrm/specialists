---
name: xt-merge
description: |
  Merges queued PRs from xt worktree sessions in the correct order (FIFO), maintaining linear
  history by rebasing remaining PRs after each merge. Use this skill whenever the user has
  multiple open PRs from xt worktrees, asks to "merge my PRs", "process the PR queue",
  "drain the queue", "merge worktree branches", or says "what PRs do I have open".
  Also activate after any xt-end completion when other PRs are already open, or when the
  user asks "can I merge yet" or "is CI green". Handles the full sequence: list → sort →
  CI check → merge oldest → rebase cascade → repeat until queue is empty.
---

# merge-prs — Worktree PR Merge Workflow

You are draining a queue of PRs created by `xt end` from multiple worktree sessions.
The key constraint is **ordering**: merge in FIFO order and rebase the remaining PRs
after each merge. Work through the stages below in sequence.

---

## Why FIFO and why the rebase cascade matters

When `xt end` runs, it rebases the worktree branch onto `origin/main` at that moment
and pushes. If you ran three sessions in sequence:

```
Session A finishes at t=1 → xt/feature-a rebased onto main@sha1
Session B finishes at t=2 → xt/feature-b rebased onto main@sha2 (sha2 >= sha1)
Session C finishes at t=3 → xt/feature-c rebased onto main@sha3 (sha3 >= sha2)
```

After merging A, main advances to sha4. Branch B is now based on sha2 — it still
compiles and CI passes, but it doesn't include A's changes. You must rebase B onto
sha4 before merging, so the history stays linear and B's CI reflects the real state
of main + B.

**FIFO = merge the oldest-created PR first.** The older the PR, the smaller the
rebase cascade it triggers in subsequent branches. Merging out of order means
you're rebasing more than necessary and risk conflicts that wouldn't have existed.

---

## Stage 0 — Pre-flight checks

Run these before touching any branch.

**1. Verify you are in a git repository:**
```bash
git rev-parse --git-dir
```
Stop immediately if this fails.

**2. Verify gh auth:**
```bash
gh auth status
```
If this fails, stop immediately. Without auth, `gh pr merge` will silently fail or
produce confusing errors mid-run.

**3. Fetch all remotes:**
```bash
git fetch --all --prune
```
This ensures local remote-tracking refs reflect current upstream state before any
rebase or CI check. Without this, CI status checks and rebase targets may be stale.

**4. Check for uncommitted local changes:**
```bash
git status --porcelain
```
If the output is non-empty, **warn the user and stop**. The rebase cascade will
check out other branches (`git checkout xt/<branch>`), which will either fail or
silently carry dirty changes into the wrong branch. Resolve before continuing:
- `git stash push -m "xt-merge cascade stash"` — stash and pop after cascade finishes
- Or commit the work first
- Or abort if the changes belong to a live worktree session

If the user stashes, record the stash ref (`git stash list | head -1`) so you can
pop it when done in Stage 6.

---

## Stage 1 — Build the queue

List all open PRs from xt worktree branches:

```bash
gh pr list --state open --json number,title,headRefName,createdAt,isDraft \
  --jq '.[] | select(.headRefName | startswith("xt/")) | [.number, .createdAt, .headRefName, .title] | @tsv' \
  | sort -k2
```

This sorts by creation time. The top row is the **head of the queue** — merge it first.

If there are draft PRs in the list, skip them. Drafts are not ready to merge.

If `gh pr list` returns an error (network, auth, wrong repo), stop and report the
error. Do not continue with stale or incomplete data.

Present the sorted queue to the user before proceeding:
```
Queue (oldest → newest):
  #42  xt/fix-auth-gate       "Fix beads edit gate claim check"     2026-03-21 10:14
  #45  xt/add-release-script  "Add release script for npm publish"  2026-03-21 14:32
  #47  xt/default-branch      "Detect default branch in xt end"     2026-03-22 09:11
```

---

## Stage 2 — Check CI on the head PR

```bash
gh pr checks <number>
```

**Stale CI warning:** After a rebase cascade the PR's HEAD SHA changes. Always verify
the SHA that CI ran against matches the current branch tip before trusting a green result:
```bash
gh pr view <number> --json headRefOid --jq '.headRefOid'
# compare against the commit SHA shown in gh pr checks output
```
If they differ, the green result is from before the rebase — wait for the new run.

Wait for all checks to pass. If CI is still running, tell the user and pause — don't
merge a PR with pending or failing checks.

If CI is failing:
- Show the failing check names and link to the run
- Do NOT proceed with the merge
- Let the user decide: fix the issue in the worktree (may already be deleted), push a
  fixup commit directly to the branch, or close the PR

---

## Stage 3 — Merge the head PR

```bash
gh pr merge <number> --rebase --delete-branch
```

Use `--rebase` (not `--squash` or `--merge`) to keep linear history and preserve
individual commits from the session. Use `--delete-branch` to clean up the remote branch.

If `gh pr merge` fails with "No commits between main and xt/<branch>", the branch's
commits were already absorbed into main (e.g. from a previous push). Close the PR
and continue to the next.

After merge, fetch and confirm main advanced:
```bash
git fetch origin
git log origin/main --oneline -3
```

Record the new HEAD SHA of main — you will verify the cascade rebases onto it.

---

## Stage 4 — Rebase cascade (all remaining PRs)

For every remaining PR in the queue, rebase its branch onto the new main:

```bash
git fetch origin main
git checkout xt/<branch>
git rebase origin/main
git push origin xt/<branch> --force-with-lease --force-if-includes
```

`--force-with-lease` rejects the push if the remote has commits your local ref
doesn't know about. `--force-if-includes` additionally verifies that whatever
you're overwriting was reachable from your local history — together they prevent
accidentally overwriting a collaborator's push that arrived after your last fetch.
(Requires Git 2.30+. If not available, `--force-with-lease` alone is acceptable.)

**After each push, verify it landed:**
```bash
git rev-parse HEAD
git rev-parse origin/xt/<branch>
```
Both SHAs must match. If the push was rejected (lease violation or other error),
stop and report — do not silently continue to the next branch.

Repeat for each remaining branch in queue order (oldest next).

After pushing, GitHub will re-trigger CI on each rebased PR. You don't need to wait
for CI here — the rebase just gets the branches current. CI will run in parallel.

### If rebase conflicts occur

```bash
git status          # shows conflicted files
# edit each file to resolve <<<< ==== >>>> markers
git add <resolved-files>
git rebase --continue
```

If you cannot safely resolve a conflict, **abort the rebase immediately**:
```bash
git rebase --abort
```
The branch is left unchanged. Report the branch name and conflicted files to the
user. Continue the cascade for remaining branches; the user can resolve and push
this one manually before you loop back to merge it.

Conflicts mean two sessions touched the same file. Resolve carefully:
- Keep both changes if they're in different parts of the file
- If they overlap, understand what each session was doing and merge the intent
- When unsure, abort and escalate to the user

After resolving, push with `--force-with-lease --force-if-includes` and verify the
push landed (SHA check above) before moving to the next branch.

---

## Stage 5 — Repeat

Go back to Stage 2 with the new head of the queue. Check CI on the **new SHA**
produced by the rebase cascade push — not a pre-rebase result. Merge, cascade,
repeat until the queue is empty.

The full loop:
```
while queue not empty:
  check CI on head PR
    → verify: gh pr view <n> headRefOid == SHA in gh pr checks output
    → wait for green; stop if failing
  merge head PR (--rebase --delete-branch)
  git fetch origin → confirm main advanced
  for each remaining branch in queue order:
    git checkout xt/<branch>
    git rebase origin/main
    git push --force-with-lease --force-if-includes
    verify: git rev-parse HEAD == git rev-parse origin/xt/<branch>
```

---

## Stage 6 — Done

When the queue is empty:

```bash
# If you stashed changes in Stage 0, pop now:
git stash pop   # report any conflicts — do not discard silently

gh pr list --state open
git log origin/main --oneline -5
```

Confirm no open xt/ PRs remain and show the user the final state of main.

---

## Edge cases

**PR was already merged**: `gh pr merge` will error. Skip it and continue.

**No commits between main and xt/branch**: branch was already absorbed into main.
Close the PR and continue.

**Branch was deleted** (worktree cleaned up by `xt end`): The remote branch
still exists (pushed by `xt end`). The local branch may not. Check out from remote:
```bash
git fetch origin
git checkout -b xt/<branch> origin/xt/<branch>
```

**CI never triggers after rebase push**: GitHub sometimes needs a nudge. Close and
re-open the PR, or push an empty commit:
```bash
git commit --allow-empty -m "trigger CI"
git push origin xt/<branch>
```

**Stale CI result after rebase**: Always confirm the SHA in `gh pr checks` matches
`git rev-parse origin/xt/<branch>` before treating a green result as valid. If they
differ, wait for the new run.

**Push rejected (lease violation)**: Do not retry blindly. Fetch and inspect:
```bash
git fetch origin xt/<branch>
git log origin/xt/<branch> --oneline -5
```
Decide whether the remote commits should be incorporated or overwritten, then act
deliberately.

**`gh auth` expired mid-run**: Stop the cascade immediately. Report which branches
were successfully rebased/pushed and which were not, so the user can resume from the
right point after re-authenticating.

**Uncommitted changes on current branch**: Stash before the cascade, pop after:
```bash
git stash push -m "xt-merge cascade stash"
# ... run cascade ...
git stash pop
```
If `git stash pop` produces conflicts, report them — do not silently discard work.

**Dependent sessions** (B was intentionally built on A's work): If session B was
started from inside session A's worktree rather than from main, B's branch already
contains A's commits. B will rebase cleanly onto main after A merges — the rebase
eliminates the duplicate commits. No special handling needed.

**Multiple conflicts across many PRs**: Abort each failing rebase (`git rebase --abort`)
and tackle them one at a time in queue order after the user resolves. Push each
resolved branch immediately so CI starts running in parallel.

**Rollback / abort mid-cascade**: If anything goes wrong and you need to stop cleanly:
1. `git rebase --abort` if a rebase is in progress
2. `git checkout <original-branch>` to return to where you started
3. `git stash pop` if you stashed in Stage 0
4. Report exactly which PRs were merged, which were rebased-and-pushed, and which
   were untouched — so the user can resume or restart from the correct point.
