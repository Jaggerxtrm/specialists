---
name: sync-docs-scope-discipline
kind: mandatory-rule
---
ONE DOC PER INVOCATION. The bead's `SCOPE` field MUST name exactly one doc path. If `SCOPE` names zero docs, more than one doc, or anything other than a single `docs/<name>.md` (or `CHANGELOG.md` / `README.md` if that IS the SCOPE doc), STOP immediately and emit a `BLOCKED: scope-violation` report. Do not proceed.

INPUTS ARE FIXED. Your only sources of truth for what changed in the project:
- The pre-script output above (latest xt report excerpt + recent master commits).
- Your one doc's content (read with `Read`).
- `python3 .xtrm/skills/default/sync-docs/scripts/drift_detector.py scan --json` — output MUST be filtered to your one SCOPE doc (jq or python filter). Discard all other entries.
- `python3 .xtrm/skills/default/sync-docs/scripts/context_gatherer.py --doc <YOUR_SCOPE_DOC>` — exactly that doc, no broader flags.

DIFF ESCAPE VALVE — STRICT. When a commit subject is insufficient to judge a claim in your doc, run `git show <hash> -- <path1> [<path2>...]` for ONE commit, naming only paths the doc actually claims about. Maximum 3 such commits per run. FORBIDDEN: `git diff <a>..<b>` (range diffs), `git show <hash>` without `--`, `git log -p`, `git log --stat` over more than 5 commits.

DO NOT INSPECT SOURCE FILES BY ANY TOOL. The following are forbidden on `src/`, `tests/`, `pi/`, `packages/`, `config/specialists/`, `.specialists/default/`, or any non-doc path:
- `Read` / `cat` / `head` / `tail` / `sed -n` / `awk` / `less` / `more`
- `Grep` / `grep` / `rg` / `git grep`
- `Glob` / `find` / `ls -R`
- `python -c "open(...)"`, `python -c "Path(...).read_text()"`, or any scripted file slurp
- `Bash` invocations that pipe source files anywhere (`< srcfile`, `cat srcfile | ...`)

The pre-script context plus per-commit `git show -- <paths>` is exhaustive. Reading source by any other route is the failure mode this specialist exists to prevent.

EXCEPTION (sole allowed source-inspection path): the `git show <hash> -- <paths>` form described above. No other tool, command, or pattern is permitted to read source files. The "DO NOT INSPECT SOURCE FILES" ban applies to every tool *except* this one bounded form.

EDIT BOUNDARY. Edit ONLY your one SCOPE doc. NEVER touch CHANGELOG (unless it IS your SCOPE doc), README, `.xtrm/skills/`, other docs, or any source file. Cross-cutting updates are separate beads with their own SCOPE.

NO RE-READING. If you have already gathered context this turn, refer to your prior output. Do NOT re-fetch after compaction. If prior gathered context is unreachable after compaction, STOP and emit `BLOCKED: context-lost-after-compaction` — do not re-run tools to recover.

OBEY STEER AND STOP. When the orchestrator or user issues a steer or stop, comply on the very next tool call. Do not finish "one more thing".

BUDGET. Per run: ONE drift scan (filtered), ONE context_gatherer call (only if pre-script context is insufficient), max THREE `git show <hash> -- <paths>` calls, ONE doc edit pass, ONE final drift validation. No exploratory loops.

STOP CONDITIONS. Stop and emit your final report when ANY is true:
- The one doc has been edited and stamped (`VERDICT: UPDATED`).
- You determine no edit is needed (`VERDICT: NO_CHANGE_NEEDED`, cite commit evidence).
- A precondition above is violated (`VERDICT: BLOCKED`, name the violation).
- Steer or stop received.

OUTPUT SHAPE. Final report must include: `DOC: <path>`, `VERDICT: <UPDATED|NO_CHANGE_NEEDED|BLOCKED>`, `COMMITS_REVIEWED: <hashes>`, `EDITS: <summary or "none">`, `DRIFT_BEFORE`, `DRIFT_AFTER`, optional `SUGGESTED_FOLLOWUPS: <other doc names — never edited>`.
