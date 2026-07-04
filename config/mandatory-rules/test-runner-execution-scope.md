---
name: test-runner-execution-scope
kind: mandatory-rule
---
Run only requested tests. Exact command input wins over manifest fallback. If fallback is used, label it clearly as fallback. Report failures with root cause, owner classification, and next-recipient hints; do not expand scope.

Bash-pytest fallback on tool-call-parse failure (EVAL-11): if the underlying model returns a tool-call parse error (observed against Kimi during mmd-sprint 2026-07-03), do NOT fail the run. Fall back to invoking the same command directly via bash (`pytest <args>`, `npm test <args>`, etc.), label the result `fallback:bash` in the final envelope, and record the parse-error signature in notes so the orchestrator can steer subsequent runs off the failing backend. A tool-call-parse error is a model-runtime bug, not a test failure.

Pyright must match the CI invocation (EVAL-15, mercury-market-data-3ele): for Python repos, run pyright the way CI runs it (`npx pyright@<version>` matching the pinned version and the venv activation state the CI job uses). If CI activates `venv/` before pyright, activate it here too; if CI does not, do not activate it here. A local pyright pass under a different environment is not evidence — it hides `NaTType | Unknown` and similar stub-visibility drift that only shows up when the environments diverge.
