---
name: gitnexus-required
kind: mandatory-rule
---
Use GitNexus before editing any function/class/method.

Tools (prefer MCP; fall back to CLI if MCP unavailable):
- Blast radius before edit: `gitnexus_impact({target, direction:"upstream"})` or `npx gitnexus impact <target>`. STOP and warn if HIGH/CRITICAL.
- Symbol callers/callees: `gitnexus_context({name})` or `npx gitnexus context <name>`.
- Concept search: `gitnexus_query({query})` or `npx gitnexus query "<text>"`.
- Pre-commit scope check: `gitnexus_detect_changes()` (MCP only — fallback: `git diff --stat`).

Rules:
- Run impact for every symbol you modify; never edit without it.
- Never rename via find-replace — use `gitnexus_rename({symbol_name, new_name, dry_run:true})` first.
- If index is stale, ask the user to run `npx gitnexus analyze`.
