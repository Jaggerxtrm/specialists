# Smoke — python kernel tool in service-knowledge-sync (xtrm-vs7f8 follow-up)

Date: 2026-08-28. Target repo: `/home/dawid/projects/mercury/economic-data`
(3 services: mcp_server, calendar_api, calendar_updater; pending drift marker
`.xtrm/.service-knowledge-drift-pending`, 45 files drifted).

## Goal

Teach the canonical `service-knowledge-sync` specialist to use the new
`python` kernel tool (persistent in-kernel REPL with the `service_knowledge`
package importable), then smoke the taught recipes on a real repo.

## Change set (specialists repo)

1. `config/catalog/python-kernel.json` — new extension catalog: `python` tool
   at MEDIUM/HIGH tiers (kernel can mutate → same tier as `edit`/`write`).
2. `config/catalog/index.json` — precedence `[native, gitnexus, python-kernel]`.
3. `src/specialist/tool-catalog.ts` — LayerSchema + SPECIALIST_TOOL_PRECEDENCE.
4. `src/specialist/manifest-resolver.ts` — python-kernel tools join toolsList
   when the extension state is available (mirrors gitnexus gate).
5. `src/pi/session.ts` — resolve `@jaggerxtrm/pi-extensions` from global
   node_modules, inject `-e <pkg>/extensions/python-kernel/index.ts` for
   MEDIUM/HIGH sessions; set `PI_KERNEL_AUDIT_POLICY=1` so kernel mutations
   are audit-visible.
6. `src/pi/python-kernel-extension.ts` — package resolver (fail-open).
7. specialist prompt — "Python kernel tool" section with concrete
   `service_knowledge` recipes (index build/search/evidence_for_files);
   version bump 1.7.0 → 1.8.0.

## Verified

| Check | Result |
|-------|--------|
| Resolved tool contract at MEDIUM includes `python` | `toolsFlag: read,grep,find,ls,bash,edit,python`; `extensionTools: ["python"]`; ext `available`, `activeTools: ["python"]` |
| `-e` injection + `--tools ... python` yields a working kernel | `6*7` → `42` via the python tool |
| `service_knowledge` importable in-kernel | v0.7.0; `search`/`build`/`evidence_for_files` callable |
| `search(Path('.'), 'calendar', limit=3)` | `SEARCH_RESULTS 3`; items have keys `item/score/signals/penalties/advisories` |
| `evidence_for_files(Path('.'), ['mcp_server'])` | `EVIDENCE_ITEMS 7` |
| audit seam in specialist context | `PI_KERNEL_AUDIT_POLICY=1` → `[audit policy] blocked 1 out-of-session writes` on a `/etc/hosts` write |
| service-knowledge ext context note on economic-data | `service registry: 1 pack(s), 3 service(s)` + `drift: PENDING marker present (.xtrm/.service-knowledge-drift-pending)` (new-format marker; legacy marker also handled per xtrm-6z6.2) |

## Gates

- `tsc --noEmit` clean
- `bun --bun vitest run tests/unit`: 159 files / 1881 pass / 2 skip / 0 fail
- catalog/specialist JSONs validate; prompt-capability audit (required_tools
  satisfiable) passes
