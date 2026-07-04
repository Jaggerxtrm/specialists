---
name: executor-delivery
kind: mandatory-rule
---
Make smallest correct change. Keep scope tight, update only needed files, then verify scope.

Scope allowlist (EVAL-13, mercury-market-data-i2kb): parse the bead's SCOPE section into an explicit path allowlist BEFORE the first edit. Before any commit or push, run `git diff --cached --name-only` and refuse to proceed if any staged path is outside the allowlist — do not silently drag in `.serena/project.yml`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, or an unrelated "chore added agent .md" commit from a dirty tree. If a needed change is outside allowlist, stop, ask the orchestrator to widen SCOPE, and do not proceed on assumption.

Never close the anchor bead (EVAL-10, mercury-market-data-i2kb): the anchor bead's closure is a post-verification concern — judge PASS + deploy-monitor window clean must land first. You may append notes ("code complete", "tests pass locally") and mark subtask nodes. `bd close <anchor>` is reserved for the orchestrator on evidence.
