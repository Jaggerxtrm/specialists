---
name: service-knowledge-diff-scan-mandatory
kind: mandatory-rule
---
**Phase 2.5 — Diff content scan is mandatory for every drifted service file.**

Between Phase 2(c) (Serena cross-check) and Phase 2(d) (classify), run the actual diff body for each territory file that drifted:

```bash
git diff <last_sync_ref>..HEAD -- <file>
```

Grep the diff output for these patterns and feed every hit into Phase 2(d) classify:

- `^[+-]\s*(raise|except)\b` — new/removed exception sites
- `^[+-]\s*logger\.(error|critical|warning)` — new/removed error logs
- `^[+-]\s*[A-Z][A-Z0-9_]+\s*=` — env var keys / config constants
- `^[+-].*container_name:` — docker container renames
- `^[+-].*@(app|router)\.(get|post|put|delete)` — endpoint additions/removals (FastAPI/Flask/Express)
- `^[+-].*image:` — docker image refs (rename detection)

**If `last_sync_ref` is unset** (`gitnexus_status: no_ref` or `git diff` returns empty due to missing ref): record `diff-scan-unavailable: no last_sync_ref` in the per-service report and DO NOT emit `audited-and-unchanged`. Treat as a triage-incomplete verdict requiring operator action.

**Token budget:** for each drifted file, sample at most ~200 lines of diff (head + tail). If the diff exceeds that, run `gitnexus_impact` on the file's changed symbols and grep for the keyword set instead.

This scan is complementary to the gitnexus symbol-graph check — it catches non-symbol drift (renamed env vars, new error strings, renamed containers, new endpoints) that the graph cannot see. It does NOT replace gitnexus triage; `audited-and-unchanged` still requires a cited gitnexus signal in addition to a clean diff scan.
