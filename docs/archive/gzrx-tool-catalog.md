# gzrx — Centralized Specialists Manifest + Tool Catalog Design

> Status: **DRAFT — design phase**. Implementation tracked under `unitAI-8vb65`.
> Author: Pi in-pi coding agent (evidence-driven), with research overlay
> (`gzrx-research-notes.md`) and overthinker critique (`unitAI-o6icy`) folded
> into §3.0 (precedence), §3.3 (health), §7 (migration), §8 (open questions).
> Last updated: 2026-05-03.

This document is the canonical design for `unitAI-gzrx`. The design is split
into the **manifest overlay** (transport) and the **tool catalog + capability
matrix** (content). The original overthinker pass produced the manifest; this
doc fills in the catalog half on top of firsthand evidence from a pi session
that can introspect its own toolbox.

---

## 0. Problem statement

The current runtime has hardcoded tier→tool mappings in
`src/pi/session.ts::mapPermissionToTools` (constants `GITNEXUS_READ_TOOLS`,
`SERENA_READ_TOOLS`, `SERENA_LOW_TOOLS`, `SERENA_WRITE_TOOLS`,
`GITNEXUS_WRITE_TOOLS`, plus inline native tool literals). The hotfix
`unitAI-2s7y8` added extension tool names so they are *available* per tier, but:

- Native tools (`read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`) and
  extension tools coexist with no policy distinguishing **preferred** from
  **fallback**.
- There is no concept of "deny native `grep` when GitNexus is loaded" —
  explorer can still reach for `grep` instead of `gitnexus_query`.
- Specialists cannot override tier policy without forking the JSON config or
  hacking `excludeExtensions`.
- There is no `sp config show <name> --resolved` to debug what a specialist
  *actually* gets at runtime.

This design fixes all four.

---

## 1. Evidence — current state

> Evidence was gathered from this pi harness, `src/pi/session.ts`, and the
> installed `pi-gitnexus` / `pi-serena-tools` packages.

### 1.1 Native tool universe

The specialist runtime's native tier universe is exactly the seven names listed
in `src/pi/session.ts:225-231`:

- READ_ONLY native tools: `read`, `grep`, `find`, `ls`
- LOW adds: `bash`
- MEDIUM adds: `edit`
- HIGH adds: `write`

This pi harness also exposes orchestration/admin tools to the top-level agent
outside the specialist permission map (`process`, `structured_return`, `mcp`,
`interactive_shell`, plus `multi_tool_use.parallel`). Those are not part of
`mapPermissionToTools` and should not be treated as native specialist tools
unless a future catalog explicitly models harness-only capabilities.

Behavior observed in this session: native `grep` and `bash` are callable even
while GitNexus and Serena are loaded; native `read` is currently blocked by the
harness with `Tool 'read' is disabled. Use Serena tools instead.` That block is
visible to the agent as a normal tool error, not silently hidden.

### 1.2 Serena tool universe (via `pi-serena-tools` extension)

`pi-serena-tools` registers these 43 tools in
`pi-serena-tools/serenaTools.ts:25-695`:

- Meta / lifecycle: `serena_list_tools`, `get_current_config`,
  `activate_project`, `remove_project`, `switch_modes`, `open_dashboard`,
  `check_onboarding_performed`, `onboarding`, `initial_instructions`,
  `prepare_for_new_conversation`, `summarize_changes`,
  `think_about_collected_information`, `think_about_task_adherence`,
  `think_about_whether_you_are_done`, `serena_mcp_reset`
- Symbol/navigation: `find_symbol`, `find_referencing_symbols`, `read_file`,
  `get_symbols_overview`, `jet_brains_get_symbols_overview`,
  `jet_brains_find_symbol`, `jet_brains_find_referencing_symbols`,
  `jet_brains_type_hierarchy`, `search_for_pattern`, `list_dir`, `find_file`
- Writes/refactors: `insert_after_symbol`, `replace_symbol_body`,
  `insert_before_symbol`, `rename_symbol`, `create_text_file`,
  `replace_content`, `delete_lines`, `replace_lines`, `insert_at_line`,
  `restart_language_server`
- Shell: `execute_shell_command`
- Memory: `read_memory`, `write_memory`, `list_memories`, `delete_memory`,
  `rename_memory`, `edit_memory`

Comparison with `src/pi/session.ts:164-214`: no drift in tool *names*. The
source map contains the same 43 names split as 21 READ_ONLY, 1 LOW, and 21
WRITE tools. The split is policy, not package capability: the extension
registers the whole surface; `--tools` chooses which names are
advertised/allowed.

The capability-taxonomy grouping above (Meta / Symbol-nav / Writes / Shell /
Memory) is *not* the same axis as source's READ/LOW/WRITE tier-allowlist
grouping. The source treats anything that mutates Serena state — including
admin/lifecycle ops and memory mutators — as WRITE-tier, not READ-tier.
Capability taxonomy is for manifest design (§2-3); the table below is the
authoritative source-tier assignment per tool.

#### 1.2.1 Source-tier cross-reference

Tools where the doc's capability-group differs from the source-tier are
flagged ⚠. They remain mutating ops in source policy regardless of
capability label; the design must preserve the source split in default
output (§7 step 2: byte-equivalent snapshot tests).

| Tool | Doc group | Source tier (`pi/session.ts:164-214`) | Note |
|------|-----------|---------------------------------------|------|
| `serena_list_tools` | Meta | READ_ONLY | |
| `get_current_config` | Meta | READ_ONLY | |
| `activate_project` | Meta | READ_ONLY | |
| `check_onboarding_performed` | Meta | READ_ONLY | |
| `initial_instructions` | Meta | READ_ONLY | |
| `think_about_collected_information` | Meta | READ_ONLY | |
| `think_about_task_adherence` | Meta | READ_ONLY | |
| `think_about_whether_you_are_done` | Meta | READ_ONLY | |
| `remove_project` | Meta | **WRITE** | ⚠ admin/lifecycle treated as mutation |
| `switch_modes` | Meta | **WRITE** | ⚠ admin/lifecycle |
| `open_dashboard` | Meta | **WRITE** | ⚠ admin/lifecycle |
| `onboarding` | Meta | **WRITE** | ⚠ admin/lifecycle |
| `prepare_for_new_conversation` | Meta | **WRITE** | ⚠ admin/lifecycle |
| `summarize_changes` | Meta | **WRITE** | ⚠ admin/lifecycle |
| `serena_mcp_reset` | Meta | **WRITE** | ⚠ admin/lifecycle |
| `find_symbol` | Symbol/nav | READ_ONLY | |
| `find_referencing_symbols` | Symbol/nav | READ_ONLY | |
| `read_file` | Symbol/nav | READ_ONLY | |
| `get_symbols_overview` | Symbol/nav | READ_ONLY | |
| `jet_brains_get_symbols_overview` | Symbol/nav | READ_ONLY | |
| `jet_brains_find_symbol` | Symbol/nav | READ_ONLY | |
| `jet_brains_find_referencing_symbols` | Symbol/nav | READ_ONLY | |
| `jet_brains_type_hierarchy` | Symbol/nav | READ_ONLY | |
| `search_for_pattern` | Symbol/nav | READ_ONLY | |
| `list_dir` | Symbol/nav | READ_ONLY | |
| `find_file` | Symbol/nav | READ_ONLY | |
| `execute_shell_command` | Shell | LOW | |
| `insert_after_symbol` | Writes | WRITE | |
| `replace_symbol_body` | Writes | WRITE | |
| `insert_before_symbol` | Writes | WRITE | |
| `rename_symbol` | Writes | WRITE | |
| `restart_language_server` | Writes | WRITE | mutates LSP state |
| `create_text_file` | Writes | WRITE | |
| `replace_content` | Writes | WRITE | |
| `delete_lines` | Writes | WRITE | |
| `replace_lines` | Writes | WRITE | |
| `insert_at_line` | Writes | WRITE | |
| `list_memories` | Memory | READ_ONLY | |
| `read_memory` | Memory | READ_ONLY | |
| `write_memory` | Memory | **WRITE** | ⚠ memory mutator |
| `delete_memory` | Memory | **WRITE** | ⚠ memory mutator |
| `rename_memory` | Memory | **WRITE** | ⚠ memory mutator |
| `edit_memory` | Memory | **WRITE** | ⚠ memory mutator |

Implication for §3 tier capabilities: `memory` capability cannot be a
single bucket. It must split into `memory.read` (READ_ONLY+) and
`memory.write` (WRITE+). The same applies to `admin.serena` — must split
into read-only meta probes (config/onboarding/think_*) and lifecycle
mutators (remove_project/switch_modes/open_dashboard/onboarding/
prepare_for_new_conversation/summarize_changes/serena_mcp_reset).

### 1.3 GitNexus tool universe (via `pi-gitnexus` extension)

`pi-gitnexus` registers seven tools in
`pi-gitnexus/dist/tools.js:86-216`:

- READ/analyze: `gitnexus_list_repos`, `gitnexus_query`, `gitnexus_context`,
  `gitnexus_impact`, `gitnexus_detect_changes`
- WRITE/refactor/admin: `gitnexus_rename`, `gitnexus_cypher`

Comparison with `src/pi/session.ts:156-219`: no drift found. The READ array
contains the first five names, and the WRITE array contains `gitnexus_rename`
and `gitnexus_cypher`. `gitnexus_query` and `gitnexus_detect_changes` both
worked in this pi session against the indexed `specialists` repo.

### 1.4 Other extensions observed

Source extension loading in `src/pi/session.ts:650-672` currently adds:

- directory extension `service-skills` if present under pi's extension dir;
- directory extension `caveman` if present;
- npm package extension `pi-gitnexus` if installed and not excluded;
- npm package extension `pi-serena-tools` if installed and not excluded.

In this environment, global npm packages include `pi-gitnexus`,
`pi-serena-tools`, `pi-interactive-shell`, and `context-mode`. The specialist
runtime only auto-loads the first two via `src/pi/session.ts:657-672`.
`pi-interactive-shell` registers `interactive_shell` in its own extension
(`pi-interactive-shell/index.ts:1072`), but it is top-level harness tooling, not
part of specialist tier policy. Quality gates in this repo are Claude/pi hooks
(`.claude/hooks/quality-check.cjs`, `.claude/hooks/quality-check.py`, and
`.xtrm/hooks/*`), not a pi tool namespace in `mapPermissionToTools`.

### 1.5 Current tier→tool mapping (from source)

| Tier | Native | Serena | GitNexus | Notes |
|------|--------|--------|----------|-------|
| READ_ONLY | read, grep, find, ls | SERENA_READ_TOOLS (~21) | GITNEXUS_READ_TOOLS (5) | no bash, no writes |
| LOW | + bash | + SERENA_LOW_TOOLS (execute_shell_command) | (same) | inspect/run, no edits |
| MEDIUM | + edit | + SERENA_WRITE_TOOLS (~20) | + GITNEXUS_WRITE_TOOLS (rename, cypher) | edit existing files |
| HIGH | + write | (same) | (same) | full access |

> Source: `src/pi/session.ts:225-243` (`mapPermissionToTools`).

### 1.6 Behavioral evidence

Observed directly in this pi session:

- Native and extension tools coexist. A native `grep` command against
  `src/pi/session.ts` succeeded while GitNexus was loaded; GitNexus then added
  related-symbol context after the grep output. Nothing prevented the native
  search path.
- Native `read` was visible enough to call, but the harness returned a visible
  error: `Tool 'read' is disabled. Use Serena tools instead.` This proves a
  hard-deny can be surfaced as an explicit tool error to the agent.
- Serena calls (`read_file`, `serena_list_tools`) succeeded, but the current
  pi UI summarized some Serena results instead of printing full payloads. For
  exact package evidence, source inspection of `pi-serena-tools/serenaTools.ts`
  was more reliable.
- GitNexus health in this repo is good: `gitnexus_list_repos`,
  `gitnexus_query`, and `gitnexus_detect_changes` are callable. `pi-gitnexus`
  implements a missing-index guard in `dist/tools.js:10-104`: when no repo
  override is provided and no index is found under cwd, read/query tools return
  the visible text `No GitNexus index found. Run: /gitnexus analyze`.
- Extension packages that are not installed are silently skipped by
  `src/pi/session.ts:657-672`; there is no startup warning in the current code.
- Serena LSP/index failure behavior is tool-level, not startup-level: the
  extension registers tools up front, then individual tool calls route through
  the Serena MCP client. The design should treat this as `loaded_unhealthy`
  when probes fail, not as `not_installed`.

---

## 2. Capability axes

Tools should be classified by *what they do*, not which package they came
from. Proposed capability tags:

| Capability | Description | Examples |
|------------|-------------|----------|
| `read` | Open and emit file contents | native `read`, serena `read_file` |
| `search.text` | Lexical/regex search across files | native `grep`, serena `search_for_pattern` |
| `search.symbol` | Symbol-aware code search | serena `find_symbol`, gitnexus `gitnexus_context` |
| `analyze.graph` | Call graph / impact / process flows | gitnexus `gitnexus_impact`, `gitnexus_query`, `gitnexus_detect_changes` |
| `analyze.refs` | Find references to a symbol | serena `find_referencing_symbols` |
| `nav.fs` | Filesystem listing/finding | native `ls`, `find`, serena `list_dir`, `find_file` |
| `shell` | Execute arbitrary commands | native `bash`, serena `execute_shell_command` |
| `write.text` | Edit existing files (line/text scope) | native `edit`, serena `replace_content`, `replace_lines` |
| `write.symbol` | Symbol-aware edits | serena `replace_symbol_body`, `insert_after_symbol` |
| `write.create` | Create new files | native `write`, serena `create_text_file` |
| `mutate.rename` | Project-wide rename | serena `rename_symbol`, gitnexus `gitnexus_rename` |
| `mutate.graph` | Mutate the graph store | gitnexus `gitnexus_cypher` (when used as write) |
| `admin.serena.read` | Read-only Serena meta probes | `get_current_config`, `check_onboarding_performed`, `initial_instructions`, `think_about_*` |
| `admin.serena.write` | Serena lifecycle mutators | `restart_language_server`, `serena_mcp_reset`, `switch_modes`, `remove_project`, `open_dashboard`, `onboarding`, `prepare_for_new_conversation`, `summarize_changes` |
| `memory.read` | Serena memory readers | `read_memory`, `list_memories` |
| `memory.write` | Serena memory mutators | `write_memory`, `delete_memory`, `rename_memory`, `edit_memory` |
| `meta` | Self-introspection | `serena_list_tools`, `gitnexus_list_repos` |

> Decision: model `memory` as a normal READ_ONLY+ capability. It is currently
> available whenever `pi-serena-tools` is loaded, but explicit cataloging keeps
> it visible in `sp config show --resolved` and allows future denial if needed.

---

## 3. Tier policy

A tier is **a set of capability tags** plus **deny rules**. Concrete tools are
derived from `(catalog filter capabilities ∩ tier.capabilities) − tier.denied`.

### 3.0 Precedence and conflict resolution

Six layers can each express an opinion on a single tool. The resolver merges
them in this fixed order, lowest-to-highest precedence:

1. **Catalog metadata** — tool exists, capabilities declared.
2. **Default tier policy** — `READ_ONLY/LOW/MEDIUM/HIGH` capability sets and
   denied-natives rules.
3. **Project manifest tier overrides** — `permissions.<TIER>` block in
   `.specialists/config.json`.
4. **Specialist manifest overrides** — `specialists.<name>` block in
   `.specialists/config.json`.
5. **Specialist JSON availability** — `execution.extensions.{serena,gitnexus}`,
   `execution.permission` in `config/specialists/<name>.specialist.json`.
6. **Runtime health downgrade** — health probes can downgrade `hard` →
   `soft` and restore native fallbacks.

Conflict rules:

- **Most restrictive wins** for tool inclusion (any layer that denies a tool
  removes it).
- **Exception:** runtime health degradation (layer 6) **restores** native
  fallbacks even if higher layers denied them, because availability of a
  replacement is the precondition for denying its native equivalent.
- Hard-deny in layer 4 (specialist override) does **not** override layer 6
  health. If GitNexus is `loaded_unhealthy`, explorer's `hard-deny grep` is
  downgraded to `soft` until GitNexus recovers.
- Layer attribution is preserved through resolution. `sp config show
  --resolved` (§6) prints which layer set each final value.

Inspired by Gemini CLI's `PolicyEngine` priority tiers
(`packages/core/src/policy/policy.ts`); see `gzrx-research-notes.md`.

### 3.1 Proposed tier capability sets

Default policy must be backward-compatible: if no catalog/manifest is present,
`mapPermissionToTools` output remains byte-for-byte equivalent to
`src/pi/session.ts:225-243`. The capability policy below is the manifest-driven
replacement target:

```yaml
READ_ONLY:
  capabilities:
    - read
    - search.text
    - search.symbol
    - analyze.graph
    - analyze.refs
    - nav.fs
    - memory.read
    - admin.serena.read
    - meta
  denied_natives_when_extension:
    read: [read_file]
    grep: [gitnexus_query, search_for_pattern]
    find: [find_file]
    ls: [list_dir]
  denied_natives_mode: soft

LOW:
  inherits: READ_ONLY
  capabilities: [shell]
  denied_natives_when_extension: same-as-READ_ONLY
  # Keep native bash by default. Serena execute_shell_command is useful but not
  # proven equivalent for cwd/env/TTY behavior.

MEDIUM:
  inherits: LOW
  capabilities:
    - write.text
    - write.symbol
    - mutate.rename
    - admin.serena.write    # restart_language_server, serena_mcp_reset, switch_modes,
                            # remove_project, open_dashboard, onboarding,
                            # prepare_for_new_conversation, summarize_changes
    - memory.write          # write_memory, delete_memory, rename_memory, edit_memory
  denied_natives_when_extension:
    edit: [replace_content, replace_lines, replace_symbol_body]
  denied_natives_mode: soft

HIGH:
  inherits: MEDIUM
  capabilities:
    - write.create
    - mutate.graph
  denied_natives_when_extension:
    write: [create_text_file]
  denied_natives_mode: soft
```

The `memory.write` and `admin.serena.write` capabilities are gated to MEDIUM+
because their tools live in `SERENA_WRITE_TOOLS` per source policy. Promoting
them to READ_ONLY would be a behavior change and must not happen by default.
The byte-equivalent snapshot test in §7 step 2 enforces this.

Specialists can opt into harder policy. Recommended first override:
`explorer.denied_natives_mode = hard` for `grep`, `find`, and `ls` while keeping
`read` soft until Serena `read_file` output behavior is verified across large
files and non-code files.

Rollout note: explorer hard-deny is isolated in specialist permissions only. Revert by
removing explorer permissions block; generic deny engine stays unchanged.

### 3.2 "Denied native when extension available" semantics

This is the core behavioral change. The explorer-uses-grep problem stems from
the runtime exposing both `grep` and `gitnexus_query` with no preference
signal.

Two enforcement options:

1. **Hard deny** — strip `grep` from `--tools` when pi-gitnexus is loaded.
   Problem: GitNexus index may be stale and the agent has no fallback.
2. **Soft deny via prompt** — both tools available; system-prompt instruction
   tells the agent to prefer GitNexus and reach for grep only on stale-index
   warnings or when scope is outside the indexed tree.

Recommended: **soft deny by default, with hard-deny opt-in** per tier. The
manifest exposes both modes.

### 3.3 Fallback behavior

Extension state is **per-capability**, not extension-wide on/off. A single
extension can have some capabilities healthy and others degraded
simultaneously (Serena LSP partial outage; GitNexus stale-but-callable).

Per-capability state machine:

| State | Meaning | Policy |
|-------|---------|--------|
| `not_installed` | package/extension path absent | warn in `--resolved`; remove its tools; do not deny native fallbacks |
| `disabled` | specialist JSON or project manifest excludes it | show disabled source; remove its tools; do not deny native fallbacks |
| `loaded_healthy` | extension registered and capability probe passed | apply preferred/denied-native policy |
| `loaded_degraded` | capability probe partially failed (e.g. some Serena tools work, others don't) | keep tools; downgrade hard-deny → soft for affected capabilities; print warning |
| `loaded_unhealthy` | capability probe failed completely | keep tools if self-recovery possible; downgrade hard-deny → soft; print warning |
| `version_mismatch` | package installed but version drifts from catalog | treat as `loaded_degraded`; emit catalog-drift warning; defer to drift policy (§6.1) |

Specifics:

- **GitNexus missing index:** `pi-gitnexus` returns visible text
  `No GitNexus index found. Run: /gitnexus analyze`. Treat as
  `loaded_unhealthy` for `analyze.graph` and `search.symbol` capabilities.
  Native `grep`/`find` remain available unless the specialist explicitly sets
  `fallback_on_extension_failure: error`.
- **GitNexus stale-but-callable index:** if a tool returns a stale-index
  warning but still produces output, classify as `loaded_degraded` for the
  affected capability. Keep graph tools, add prompt-visible warning, allow
  native fallback for that turn. Do not promote to `loaded_unhealthy` —
  callable-with-warning is materially different from unusable.
- **Serena LSP offline:** per-capability probes (not extension-wide). Probe
  `find_symbol` for `search.symbol`; probe `read_file` for `read`; probe
  `replace_symbol_body` for `write.symbol`. Each capability gets its own
  state. Native `read`/`grep`/`find`/`ls`/`edit` are not hard-denied while any
  Serena capability is `loaded_unhealthy` or `loaded_degraded`.
- **Package not installed:** current code silently skips packages via
  `existsSync(...)` in `src/pi/session.ts:657-672`. New resolver makes that
  visible in `sp config show --resolved` and emits a single startup line. Does
  not fail session start unless manifest says
  `fallback_on_extension_failure: error`.
- **Package version mismatch:** if an installed extension's manifest version
  drifts from the catalog file's `expected_version`, treat as
  `version_mismatch`. Drift detection (§6.1) decides whether to warn-only or
  hard-fail per project policy.

---

## 4. Tool catalog schema

Stored at `.specialists/catalog/{native,serena,gitnexus}.json` (or single
`catalog.json` keyed by source). Editable by hand; loaded at session start.

```json
{
  "version": 1,
  "source": "pi-gitnexus",
  "tools": [
    {
      "name": "gitnexus_query",
      "capabilities": ["search.symbol", "analyze.graph"],
      "preferred_over": ["grep"],
      "stale_index_behavior": "warn",
      "description": "Find code by concept; returns process-grouped results."
    },
    {
      "name": "gitnexus_impact",
      "capabilities": ["analyze.graph"],
      "description": "Blast radius for a symbol."
    }
  ]
}
```

Native tools live in `.specialists/catalog/native.json` shipped with the
package; extensions can declare their own catalog file in their npm package
root (`pi-catalog.json`) which the runtime merges.

---

## 5. Manifest extension (on top of existing overthinker design)

The existing manifest schema (in `unitAI-gzrx` description) defines:

```json
"permissions": {
  "READ_ONLY": {
    "extensions": { "mode": "none|allowlist", "allowlist": [...] },
    ...
  }
}
```

This is **incomplete** — it specifies extension *availability* but not
tier *capabilities* or *denied natives*. Extend to:

```json
"permissions": {
  "READ_ONLY": {
    "capabilities": ["read", "search.text", "search.symbol", ...],
    "denied_natives_when_extension": ["grep", "find", "ls", "read"],
    "denied_natives_mode": "soft|hard",
    "extensions": { "mode": "allowlist", "allowlist": ["pi-gitnexus", "pi-serena-tools"] },
    "fallback_on_extension_failure": "warn|error|silent",
    "beads": { "can_close": false },
    "behavior": { "auto_append_output_to_bead": true }
  }
}
```

Per-specialist override extends the same shape:

```json
"specialists": {
  "explorer": {
    "denied_natives_mode": "hard"
  }
}
```

---

### 5.1 Drift detection

Hand-edited JSON catalogs drift from the live extension surface. The resolver
runs a startup drift check:

- For each catalog entry, verify the tool name still exists in the loaded
  extension's registered tool set.
- For each loaded extension tool, verify it exists in the catalog (warn on
  unknown tools).
- Compare catalog `expected_version` against the installed package version.

Drift policy is set per project in manifest:

```json
"drift_policy": {
  "mode": "warn|error|ignore",
  "downgrade_hard_deny_on_drift": true
}
```

Default `warn`: log to `--resolved` output, downgrade affected hard-denies to
soft. `error` fails session start. Drift is not the same as `version_mismatch`
on a single package — drift is a catalog↔extension shape mismatch.

---

## 6. Resolved-debug surface

`sp config show <name> --resolved` must print:

1. Effective manifest (defaults + tier policy + specialist override merged).
2. Tier policy file path used.
3. Extension availability (loaded / not installed / disabled).
4. Final `--tools` string passed to pi.
5. Native tools denied (with reason: which extension preempts each).
6. Per-layer attribution: which value came from which precedence layer.

Sample output sketch:

```
specialist: explorer
permission_required: READ_ONLY
sources:
  manifest_defaults:        .specialists/config.json
  tier_policy:              .specialists/config.json#permissions.READ_ONLY
  specialist_override:      .specialists/config.json#specialists.explorer
  specialist_json:          config/specialists/explorer.specialist.json

extensions:
  pi-gitnexus              loaded   (via npm global)
  pi-serena-tools          loaded   (via npm global)
  quality-gates            disabled (tier disallows)

capabilities (effective):
  read, search.text, search.symbol, analyze.graph, analyze.refs,
  nav.fs, memory, meta

natives denied (mode=hard, source=specialist override):
  grep      -> preempted by gitnexus_query, search_for_pattern
  find      -> preempted by find_file
  ls        -> preempted by list_dir
  read      -> preempted by read_file (serena)

--tools (effective):
  gitnexus_query,gitnexus_context,gitnexus_impact,gitnexus_detect_changes,
  gitnexus_list_repos,find_symbol,find_referencing_symbols,read_file,
  get_symbols_overview,search_for_pattern,list_dir,find_file,
  list_memories,read_memory,serena_list_tools,...

behavior:
  auto_append_output_to_bead: true   (from tier READ_ONLY)
```

---

## 7. Migration plan

This ordering is the post-overthinker revision. The original §7 placed runtime
threading before resolved-debug; that order made the resolver impossible to
diagnose in production. Resolved-debug and per-capability health probes now
land **before** runtime threading.

Each behavior-changing step has explicit abort criteria. If any criterion
fires, halt the migration and resolve the regression before continuing.

1. **Specify precedence in design + code comments.** Document the six-layer
   precedence (§3.0) as a header comment in `src/specialist/manifest.ts` and
   in inline commentary on the resolver entry point. No code behavior yet.

2. **Add catalog files + JSON schema validation.**
   - `.specialists/catalog/native.json`
   - `.specialists/catalog/serena.json`
   - `.specialists/catalog/gitnexus.json`
   - Validate tool names, capabilities, source-tier, package/version metadata.
   - Optional package-side `pi-catalog.json` discovery is **deferred** — first
     PR ships hand-edited JSON only.
   - **Abort if** catalog schema fails or any catalog tool's source-tier
     differs from the §1.2.1/§1.3 cross-reference.

3. **Implement resolver as a pure library** (`src/specialist/manifest.ts` or
   `tool-manifest.ts`). Inputs: tier, catalogs, manifest, specialist override,
   specialist exclusions, extension state. Outputs: final `--tools`, denied natives
   with reason, warnings, per-layer attribution. **No `src/pi/session.ts`
   threading yet.**

4. **Tests before integration:**
   - Byte-equivalence snapshots for `READ_ONLY/LOW/MEDIUM/HIGH` (default
     config) vs current `mapPermissionToTools` output.
   - Matrix tests across **(tier × extension health × specialist override ×
     specialist exclusion)**. Per-tier snapshots alone do not catch interaction
     bugs.
   - Invariants:
     - Soft mode never changes final `--tools`.
     - Hard mode restores natives when replacement capability is
       `loaded_unhealthy`, `loaded_degraded`, `version_mismatch`, or unknown.
   - **Abort if** any default tier output differs byte-for-byte from legacy.

5. **Add `sp config show <specialist> --resolved`** in `src/cli/config.ts`.
   Must use the **same** resolver library as the future runtime path. Print
   effective manifest, per-layer attribution, per-capability extension
   health, catalog drift, hard-deny downgrades, denied natives with reason,
   final `--tools`. **Abort if** any tool inclusion/exclusion lacks layer
   attribution.

6. **Add per-capability health probes + drift detection.**
   - GitNexus: missing index, stale-but-callable, callable/degraded.
   - Serena: per-capability probes (`search.symbol`, `read`, `write.symbol`,
     etc.), not extension-wide on/off.
   - Package version vs catalog `expected_version`.
   - Catalog↔extension shape drift (§5.1).
   - Drift or degraded forces hard-deny → soft (per layer 6 in §3.0).
   - **Abort if** drift detector cannot distinguish `loaded_degraded` from
     `loaded_unhealthy`.

7. **Thread resolver into `src/pi/session.ts`** behind a feature flag.
   Flag-off = legacy hardcoded arrays. Flag-on + default config =
   byte-equivalent to legacy. Keep hardcoded arrays as fallback for one
   release. **Abort if** flag-off output differs from legacy in any tier.

8. **Enable `denied_natives_when_extension` in soft mode** for all tiers.
   Tools remain callable; prompts and resolved-debug output express
   preferences. **Abort if** soft mode changes final `--tools` for any tier.

9. **Add hard-deny support in resolver.** Verify natives are removed from
   `--tools` when replacement capability is healthy, and restored when
   unhealthy/degraded/unknown/catalog-incompatible. **Abort if** natives are
   not restored on any unhealthy state.

10. **Enable explorer hard-deny for `grep`/`find`/`ls`.** Keep `read` soft
    pending Serena `read_file` large-file and non-code verification. Gated on
    healthy GitNexus + Serena replacements. Monitor via `--resolved` output
    for one week minimum.

11. **Remove old hardcoded arrays** from `src/pi/session.ts`. **Abort until**
    one release has shipped with parity verified and resolved-debug output
    available in production.

### 7.1 Defer to follow-up beads

- Package-side `pi-catalog.json` discovery for arbitrary extensions.
- Catalog codegen from extension source (first PR ships hand JSON + drift
  detector; codegen is a separate optimization).
- Full migration of this design to `docs/manifest.md` and cross-link from
  `docs/cli-reference.md`.
- Hard-deny `read` (waits on Serena large-file/non-code verification).
- Per-tool health beyond the minimum per-capability probes in step 6.

---

## 8. Open questions and decisions

1. `bash` and `execute_shell_command` should not be marked equivalent yet.
   They share the `shell` capability, but native `bash` is the proven specialist
   LOW-tier tool and may differ in cwd/env/output handling. Keep both when both
   are allowed; prefer native `bash` for operator commands.
2. Pi's `--tools` should be treated as an allowlist contract. This session
   showed denied native `read` failing visibly at call time, so hard deny is
   observable to the agent rather than silent. The design should still verify
   this with a specialist subprocess test during implementation.
3. Native-tool blocking is visible as a tool error in this harness. That is
   acceptable for hard-deny mode, but the error text should name the preferred
   replacement tool.
4. `serena_list_tools` is a meta tool and may report the Serena server's full
   surface rather than the current `--tools` allowlist. `sp config show
   --resolved` must therefore be the authoritative debug surface for effective
   tool access.
5. Keep `meta` tools on for READ_ONLY+ by default. They are essential for
   debugging loaded/unhealthy extension states. If security becomes a concern,
   add a separate `meta` deny list rather than hiding them implicitly.
6. `loaded_degraded` vs `loaded_unhealthy` boundary is sometimes fuzzy
   (e.g. GitNexus index present but 30+ days stale). Default rule: a tool that
   still returns useful output with a warning is `loaded_degraded`; a tool
   that errors or returns "unavailable" text is `loaded_unhealthy`. Drift
   detector (§5.1) escalation policy refines this per project.
7. `version_mismatch` policy default: `warn-only` for catalog-vs-package skew
   on minor/patch; `error` on major skew. Manifest can override per
   extension. Concrete thresholds to be set during step 6 of §7.

### 8.1 Resolved by the post-overthinker revision

Items previously open or under-specified that are now closed:

- **Precedence order across the six layers** — locked in §3.0.
- **Per-capability health vs extension-wide** — §3.3 splits state into
  per-capability with explicit `loaded_degraded`.
- **Drift between hand-edited catalog and live extension surface** — §5.1
  adds startup drift detection with project-level policy.
- **Order of `--resolved` debug surface vs runtime threading** — §7 step 5
  lands resolved-debug *before* step 7 runtime threading. Original §7 had
  this reversed and would have shipped a resolver with no diagnostic surface.
- **Snapshot-only test sufficiency** — §7 step 4 requires the
  (tier × health × override × specialist exclusion) matrix; per-tier snapshots alone are
  insufficient.
- **Soft-vs-hard deny effectiveness** — §3.2 + §7 step 8/9 split: soft
  is preference/debug only and does not change `--tools`; hard is the only
  mode that fixes the explorer-grep problem, gated on replacement health.

---

## 9. Non-goals

- No change to specialist JSON schema (`*.specialist.json`) for `model`,
  `prompt`, `output_schema`, metadata.
- No replacement of the JSON-as-identity model. Manifest is overlay.
- No new CLI surface beyond `sp config show <name> --resolved` and the
  catalog files.
- No change to mandatory rules system or beads context loading.

---

## 10. References

- `docs/design/gzrx-research-notes.md` — survey of pi-mono, Gemini CLI, Claude
  Code, VS Code, Aider, OpenHands. Source of the precedence-engine pattern
  (Gemini `PolicyEngine`), per-capability health model (Gemini
  `McpClientManager`), and extension-prefixed tool naming (VS Code
  `extensionPrefixedIdentifier`).
- Bead `unitAI-gzrx` — original design bead (closed).
- Bead `unitAI-6b821` — researcher chain (closed).
- Bead `unitAI-o6icy` — overthinker critique that produced the §7 reorder,
  precedence rules, per-capability health, drift detection, and abort
  criteria (closed).
- Bead `unitAI-8vb65` — implementation bead carrying the same refined
  ordering as the in-doc §7. Notes mirror this doc; the doc is canonical.

---

## 11. Drift policy for this document

If §7 ordering or abort criteria change, update this doc **first**, then
sync `unitAI-8vb65` notes. The bead notes are a copy; the doc is canonical.
Any executor work that diverges from §7 must amend the doc in the same PR.
