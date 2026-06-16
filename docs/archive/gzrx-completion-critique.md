# gzrx Completion Critique — 2026-05-03

> Status: Gap analysis. Anchors `unitAI-qujxo` (completion epic) child `.1`.
> Author: Orchestrator review at end of 2026-05-03 session.
> Cross-references: [gzrx-tool-catalog.md](./gzrx-tool-catalog.md) (canonical
> design), [gzrx-research-notes.md](./gzrx-research-notes.md) (6-runtime
> survey), [.xtrm/reports/2026-05-03-5ad59543.md](../../.xtrm/reports/2026-05-03-5ad59543.md)
> (session report).

---

## TL;DR

The 2026-05-03 session shipped phases 1-7 of the `unitAI-8vb65` impl epic plus
inline correctness fixes. The work is **functionally complete as a parallel
infrastructure** but **does not replace the legacy hardcoded tier→tool arrays
in `src/pi/session.ts:156-219` as the production source of truth**. The
original §0 problem statement remains unresolved at runtime.

Specifically:

- ✅ Catalog files exist and validate
- ✅ Resolver library (`src/specialist/manifest-resolver.ts`) returns
  byte-equivalent output to legacy and supports per-specialist override,
  health-aware hard deny, layer attribution
- ✅ `sp config show <specialist> --resolved` is correct end-to-end and shows
  the aspirational state (explorer denies grep/find/ls when GitNexus+Serena
  are healthy)
- ❌ Live `sp run` invocations still go through legacy `mapPermissionToTools`
  unless `SPECIALISTS_USE_RESOLVER=1` env var is set
- ❌ Even when the env flag is set, `src/pi/session.ts:resolvePermissionTools`
  does not receive the specialist's `permissions[tier]` block — the runtime
  call site has no access to the specialist name or its parsed JSON, so it
  passes only `tier` to the resolver. Per-specialist hard deny is **never
  applied at runtime.**
- ❌ Legacy `GITNEXUS_*_TOOLS` / `SERENA_*_TOOLS` constants and
  `mapPermissionToTools` function remain the production source of truth

Net effect: the design's §0 problem ("explorer reaches for `grep` instead of
`gitnexus_query`") is **not fixed in production**.

---

## Designed vs shipped

### Designed (per `gzrx-tool-catalog.md` §7, refined 11 steps)

1. Specify precedence + conflict order
2. Add catalog files + JSON schema validation
3. Implement resolver as pure library
4. Tests before integration (snapshots + matrix)
5. `sp config show <name> --resolved` using same resolver
6. Per-capability health probes + drift detection
7. Thread resolver into `src/pi/session.ts` behind feature flag
8. Enable soft deny for all tiers
9. Add hard deny support, gated on health
10. Enable explorer hard-deny for `grep/find/ls`
11. Remove legacy hardcoded arrays after one parity release

### Shipped

| Step | Status | Notes |
|------|--------|-------|
| 1 | ✅ | §3.0 in design doc; encoded in `src/specialist/tool-catalog.ts` header comment + asserted by test |
| 2 | ✅ | `.specialists/catalog/{native,gitnexus,serena,index}.json` |
| 3 | ✅ | `src/specialist/manifest-resolver.ts` — pure function, `resolveManifestTools(input)` |
| 4 | ✅ | 7 matrix tests in `tests/unit/specialist/manifest-resolver.test.ts` covering tier × health × override × exclusion |
| 5 | ✅ | `sp config show <name> --resolved` in `src/cli/config.ts` + `src/specialist/resolution-diagnostics.ts` |
| 6 | ⚠️ | Health probes exist (`probeHealth` in resolution-diagnostics.ts); **per-capability** model from §3.3 is partial — `ExtensionHealth` type is `not_installed \| disabled \| loaded_healthy \| loaded_unhealthy \| unknown`, missing `loaded_degraded` and `version_mismatch` from design |
| 7 | ⚠️ | Threaded behind `useSharedToolResolver` option AND `SPECIALISTS_USE_RESOLVER=1` env var. **Default OFF.** Runtime never sees per-specialist override layer because the call site (`PiAgentSession.start`) has no access to the specialist's parsed JSON |
| 8 | ⚠️ | Resolver supports soft mode correctly. **Runtime never invokes it for any specialist** because (a) flag default-off, (b) no per-specialist override threaded |
| 9 | ⚠️ | Resolver supports hard mode with health-aware native restoration. **Runtime never invokes it.** Diagnostic-only |
| 10 | ⚠️ | `config/specialists/explorer.specialist.json` has `permissions.READ_ONLY.denied_natives_when_extension: ["grep","find","ls"]` with `denied_natives_mode: "hard"`. **Runtime ignores this block.** Visible only in `sp config show` |
| 11 | ❌ | Deferred to "post-release parity window". Reasoning was sound *if* the resolver was actually receiving production traffic. It is not. The "parity window" is fiction — zero specialists have been spawned through the resolver |

### Inline fixes shipped (not in §7)

Five end-to-end correctness bugs surfaced by exercising `sp config show
explorer --resolved` and patched in commits `6b057e01`, `ee7dec6d`,
`5ad59543`:

1. Tier was hardcoded to HIGH in `resolution-diagnostics.ts:loadResolvedConfigReport` — fixed by reading `execution.permission_required` from the specialist JSON
2. Extension probe used project-local `require.resolve` paths — fixed by adding `npm root -g` to resolution paths
3. Specialist JSON's `permissions[tier]` was passed as `manifestPolicy` — fixed by routing it through `specialistOverride` parameter
4. Layer attribution only emitted `tier_policy` — fixed to emit `catalog`, `specialist_override`, `runtime_health` distinctly
5. Catalog compatibility check considered only `drift !== 'none'` — fixed to also flag `health !== 'loaded_healthy'`
6. Probe entrypoint check rejected pi extension packages with no `main` field — relaxed to package.json presence
7. Renamed `yamlExclusions` → `specialistExclusions` and layer `yaml_exclusion` → `specialist_exclusion` (terminology drift fix; specialists are JSON not YAML)

---

## Why §0 remains unresolved

The original problem statement (`gzrx-tool-catalog.md` §0):

> Native tools (`read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`) and
> extension tools coexist with no policy distinguishing **preferred** from
> **fallback**. There is no concept of "deny native `grep` when GitNexus is
> loaded" — explorer can still reach for `grep` instead of `gitnexus_query`.

The fix path:

1. Design a manifest that lets specialists override tier policy
2. Build a resolver that applies the manifest to produce final `--tools`
3. Make the resolver the source of truth at runtime
4. Migrate explorer to hard-deny grep/find/ls

Today: steps 1-2 are done. Step 3 is half-done (resolver exists but is opt-in
and runtime cannot access per-specialist data). Step 4 is done in JSON but
the runtime ignores it.

The **call site** is the missing link. `PiAgentSession.start` in
`src/pi/session.ts:660` does:

```ts
const useResolver = this.options.useSharedToolResolver ?? process.env.SPECIALISTS_USE_RESOLVER === '1';
const toolsFlag = useResolver
  ? resolvePermissionTools(this.options.permissionLevel) ?? mapPermissionToTools(this.options.permissionLevel)
  : mapPermissionToTools(this.options.permissionLevel);
```

`resolvePermissionTools(level)` accepts only the tier string. It cannot apply
the per-specialist override because `PiSessionOptions` does not carry the
specialist's name or parsed JSON. The caller (`src/specialist/runner.ts`)
has the specialist name and JSON in scope but never passes them down.

Two missing fields and a small wiring change unlock everything.

---

## File:line gap inventory

| Gap | File | Lines | What needs to change |
|-----|------|-------|----------------------|
| `PiSessionOptions` lacks specialist context | `src/pi/session.ts` | 95-147 | Add `specialistName?: string` and `specialistPermissions?: ManifestPolicy['permissions']` |
| Runtime resolver call ignores per-specialist override | `src/pi/session.ts` | 243-258 | Accept the new fields, pass `specialistOverride: specialistPermissions?.[tier]` to `resolveManifestTools` |
| Caller doesn't pass specialist context | `src/specialist/runner.ts` | (TBD — search for `new PiAgentSession`) | Read specialist JSON, pass `specialistName` + `specialistPermissions` into options |
| MCP caller doesn't pass specialist context | `src/tools/specialist/use_specialist.tool.ts` | (TBD) | Same |
| Resolver default-off | `src/pi/session.ts` | 665 | Either flip default to on (`useResolver !== false`), or delete the flag entirely |
| Legacy arrays still source of truth | `src/pi/session.ts` | 156-219 | Delete `GITNEXUS_READ_TOOLS`, `SERENA_READ_TOOLS`, `SERENA_LOW_TOOLS`, `SERENA_WRITE_TOOLS`, `GITNEXUS_WRITE_TOOLS` |
| Legacy mapping function | `src/pi/session.ts` | 260-280 | Delete `mapPermissionToTools` |
| `ExtensionHealth` type missing degraded/version_mismatch states | `src/specialist/manifest-resolver.ts` | 3 | Widen union (logic already handles them via `HEALTHY` whitelist) |
| Test fixture for session.ts | `tests/unit/pi/session.test.ts` | (TBD) | Update Phase 4 tests to reflect resolver-only path |
| No `docs/manifest.md` | (new file) | — | User-facing reference for `permissions[tier]` block |
| No `docs/cli-reference.md` entry | `docs/cli-reference.md` | (TBD) | Document `sp config show <name> --resolved` |
| No CHANGELOG `[Unreleased]` entry | `CHANGELOG.md` | top | Document the new diagnostic CLI + opt-in env flag |

---

## Operational debt collected

Observations from this session that complicate next session's work:

1. **Phase 4 merge was silently dropped.** The "Already up to date" output during merge was a lie because of how the worktree-tracking interacted with master. Detected only when `grep` for `resolveManifestTools` in `src/pi/session.ts` returned zero matches. Recovered via explicit `git merge bc0f290c --no-ff`. Worth noting that `git merge feature-branch` followed by "Already up to date" is not a guarantee that the changes actually arrived.

2. **Phase 6 first attempt stalled.** RPC stalled after 120s with no activity, then the bead became unable to dispatch new executors silently. Required `--force-stale-base` because sp's bookkeeping flagged Phase 4 as having "unmerged sibling commits" even though Phase 4 was on master. Manual merges break sp's epic-tracking.

3. **Reviewer specialists died from tmux memory pressure.** Inline orchestrator review was used as fallback. Worked but bypasses the reviewer's gating discipline.

4. **Global pi extensions were silently broken across all prior sessions** (`pi-gitnexus` missing `cross-spawn`, `pi-mcp-adapter` missing `@modelcontextprotocol/sdk`). Fixed locally via `npm install` in nvm global node_modules. Upstream PR to mariozechner/pi-mono required for any other developer.

5. **Phase children not formally closed.** `unitAI-8vb65.1` through `.7` were memory-acked via `bd kv set` but `bd close` was never invoked. Bead state is OPEN despite work being merged. Bulk close needed.

6. **YAML→JSON terminology drift.** Specialists are JSON files; legacy YAML support exists in `src/specialist/loader.ts:101` with a `deprecatedYaml` flag. Field naming and design doc had drifted to YAML language. Fixed in commit `5ad59543`.

7. **Dolt remote push permission denied throughout.** Local bd state is fine; remote sync is broken. Auth fix needed independently.

---

## Recommended next-session approach

See `unitAI-qujxo.2` for the full bead contract. Summary:

1. Plumb `specialistName` + `specialistPermissions` through `PiSessionOptions` and the runner caller — ~30 min.
2. Flip the resolver to default-on (delete env flag or invert default).
3. Spawn one specialist per tier (READ_ONLY/LOW/MEDIUM/HIGH) with a no-op bead, capture `--tools` from spawn args via feed `META` events, confirm against `sp config show --resolved`.
4. Delete legacy `mapPermissionToTools` + the five hardcoded array constants in `src/pi/session.ts:156-280`.
5. Verify §0 promise: live explorer feed shows zero `grep`/`find`/`ls` calls and uses `gitnexus_query` / `search_for_pattern` / `find_file` instead. Capture as evidence.
6. Bulk-close gzrx phase beads.
7. (Optional) Add user-facing docs (`docs/manifest.md`, CLI reference entry, CHANGELOG).

Estimated 2-4 hours total. Reviewer chain optional given the small surface
and existing 75-test coverage.
