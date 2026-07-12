# Chain Templates — Default Catalog (operator quick-start)

> **Status:** operator quick-start to the executable `.formula.json` files in this directory.
>
> **Canonical design canon** for chain templates lives in [`docs/design/chain-templates.md`](../../chain-templates.md). That is where the canonical pipeline every production-diff chain runs (§2), the per-template resolved canonical chains (§3), the pending DevOps-gates gap (§4), composition mechanism (§5), and evolution protocol (§6) live. **Consult the canon first for design questions.** A non-maintained editorial snapshot in `substrate.html` style is at `chain-templates.html`. This README covers the operator quick-start: schema notes, pour mechanism, search-path resolution, post-pour edge helper, per-repo extension example.
>
> **Schema:** verified `bd formula` schema. Pour mechanism creates a `molecule` parent issue (the chain identity) + one bd issue per formula step as children with `parent-child` edge. `needs` produces `blocks` edges between siblings. Per-step `labels` carry role identity for the post-pour edge-wiring helper (roadmap Opportunity 5).
>
> **Reference:** `docs/design/roadmap/specialists-roadmap.md` §3 (twelve alignment opportunities), Opp 4 (`sp chain review/approve/insert`), Opp 10 (`--chain` redesign), Opp 14 (QA chain integration via `test-engineer` + `test-runner` upgrade), §12 (sp epic decoration). For substrate alignment: `docs/design/substrate/substrate.md` §6.9.10.

## What's in this directory

**15 chain template `.formula.json` files** currently in this directory (named `<template>.formula.json`). Each uses only `[package]` tier specialists from `config/specialists/` — these are the cross-repo defaults. Per-repo overrides via `extends` can add custom specialists (see market-data example pattern below).

**2 templates are authored in the canon and now shipped as formula files**: `code-with-tests` (dual-writer for production+tests at high+ scrutiny) and `test-only` (single-writer test-engineer chain). Both are wired for the same `test-engineer` specialist via position-specific mandate text in the formula step description.

Catalog table (for full per-template detail with mermaid step diagrams, severity floors, and the canonical pipeline that wraps production-diff chains, see [`chain-templates.md` §3](../../chain-templates.md#3-the-template-catalog)):

| File | Layer-1 roles (canonical pipeline §2 wraps production-diff chains) | Use case |
|---|---|---|
| `code-quick.formula.json` | root → reviewer *(test-engineer optional/skippable at low scrutiny)* | LOW-blast trivial change (one-line fix, typo) |
| `code-standard.formula.json` | root → executor → seconder → test-engineer → test-runner → obligations-scanner → reviewer | Production diff default — canonical pipeline applies |
| `code-with-advisors.formula.json` | root → [explorer + researcher + overthinker] → executor → seconder → test-engineer → test-runner → obligations-scanner → reviewer | HIGH/CRITICAL blast — canonical pipeline applies |
| `debug.formula.json` | root → debugger (non-skippable) → seconder → test-engineer → test-runner → obligations-scanner → reviewer | Bug fix — canonical pipeline applies; regression test mandatory |
| `security-deep.formula.json` | root → security-auditor (advisor) → executor → seconder → test-engineer → test-runner → security-auditor (gate) → obligations-scanner → reviewer | Sensitive surface; SCRUTINY: critical default; security-auditor runs twice |
| `release-prep.formula.json` | root → changelog-drafter → changelog-keeper | Release prep — reconcile [Unreleased] CHANGELOG.md (meta chain, pipeline N/A) |
| `triage.formula.json` | root → explorer → overthinker | Board health (READ_ONLY, pipeline N/A) |
| `research-only.formula.json` | root → {explorer or researcher via `{{specialist}}` var} | Investigation (READ_ONLY, pipeline N/A) |
| `restitch.formula.json` | root → debugger → seconder → test-engineer → test-runner → obligations-scanner → reviewer | Conflict recovery (inherits original chain's pipeline state) |
| `planning.formula.json` | root → planner | Vague initiative → phased bd issue board (pipeline N/A) |
| `premortem.formula.json` | root → overthinker | Devil's-advocate before risky decisions (pipeline N/A) |
| `doc-sync.formula.json` | root → sync-docs | Single-document drift-aware update (pipeline N/A) |
| `memory-hygiene.formula.json` | root → memory-processor | Stale memory consolidation (pipeline N/A) |

**Canonical pipeline.** The Layer-1 shapes above are what the formula files declare. On top of Layer-1, every production-diff chain runs the **canonical pipeline** described in [canon §2](../../chain-templates.md#2-the-canonical-pipeline) — `seconder → test-engineer → test-runner → security-auditor (if sensitive) → obligations-scanner → reviewer` with Release Checklist. The canonical pipeline is not opt-in; severity (`SCRUTINY: low|medium|high|critical`) modulates which steps fire. Each template's resolved canonical chain is in [canon §3](../../chain-templates.md#3-the-template-catalog).

**Status today.** The Iron portion of the canonical pipeline (seconder gate + obligations-scanner + reviewer + auto-escalation) is **in production** via `config/skills/using-specialists/SKILL.md`. The QA portion (`test-engineer` + upgraded `test-runner`) is now **wired in formula files** via epic `unitAI-f9kku` (blocked on sfwe1.1/.2 at specialist layer). Once shipped, both are canonical pipeline behavior — not "overlays." The one currently-pending piece is **DevOps gates** for operational validation ([canon §4](../../chain-templates.md#4-devops-gates--design-pending)); design fill follows in a separate session segment.

## Shipping path

Templates land in one of three bd formula search paths (resolution order):

1. **`<repo>/.beads/formulas/`** — per-repo, highest priority. Use for project-specific extensions (e.g. mercury's `quant-validation` extending `code-with-advisors`).
2. **`~/.beads/formulas/`** — user-global. Use to install personal preferences.
3. **`$GT_ROOT/.beads/formulas/`** — orchestrator-global (if `GT_ROOT` env set).

**Recommended shipping mechanism:** package these defaults into the `@jaggerxtrm/specialists` npm package and have `xt init` / `xt update` copy them to `~/.beads/formulas/` (or per-repo, behind a flag). Per-repo customizations live in `<repo>/.beads/formulas/` and `extends` the package defaults.

## How to use a template

```bash
# List available formulas
bd formula list

# Inspect a formula
bd formula show code-standard

# Dry-run pour (preview)
bd mol pour code-standard --dry-run --var root_title="Fix Treasury rounding" --var scope="analytics/**"

# Actual pour (creates the chain: molecule + step beads)
bd mol pour code-standard --var root_title="Fix Treasury rounding" --var scope="analytics/**"
# → returns the molecule id (this IS the chain identity)
# → produces N child beads (root step + step beads) with parent-child edges + blocks edges

# After pour: run the post-pour helper to apply semantic edges (validates/informs/etc.)
sp chain wire-edges <molecule-id>
# → reads each child's labels (role:X, edge:validates->root, etc.)
# → applies the semantic edge types beyond bd's native blocks-on
```

## Post-pour helper — `sp chain wire-edges`

bd formula's `needs` field only produces `blocks-on` edges (ordering). For the richer semantic edges from Opportunity 5 (`validates`, `informs`, `discovered-from`), each step's `labels` carry the intended edge type as `edge:<type>-><target-step-id>`. A small post-pour helper script applies these:

**Pseudocode:**
```
sp chain wire-edges <molecule-id>:
  for each child of <molecule-id>:
    for each label matching `edge:<type>-><target>`:
      target_bead_id = resolve <target> step within molecule
      bd dep add <child> <target_bead_id> --type <type>
```

The helper is ~50 LOC in shell or node. It runs immediately after `bd mol pour` (chained or called by `sp chain plan`). Idempotent: re-running is safe (bd dep add deduplicates by source+target+type).

**Why labels not formula extension:** bd formula's edge support is limited to `needs` (blocks-on). Putting edges in labels keeps formulas portable to vanilla bd while letting our helper layer richer semantics on top. When substrate lands and absorbs chain composition (§22 of friction audit), the edge information ships natively as substrate step-issue relationships — no helper needed at that point.

## Selection logic — NOT in formula

bd formula does NOT support `applies_when` matcher fields at the formula level. The choice of WHICH template to use for a given bead lives elsewhere:

1. **Claude Code hook on `bd create` (roadmap §4)** — detects bead type/scope/scrutiny/keywords and proposes a template. Highest-leverage layer.
2. **`sp chain plan <bead>` (roadmap §3.1.4)** — explicit composition gate; resolves template from bead attributes; pours; wires edges.
3. **Operator override** — `sp chain plan <bead> --template <name>` or direct `bd mol pour <template>`.

The selection matchers (scope_matches, type, scrutiny_gte, etc.) ship as a separate config file consumed by the hook + dispatcher. **One matcher language across the system** (substrate-review §18 reuse audit) — but applied at the selection layer, not encoded in each formula.

## Per-repo extension example

Market-data extends `code-with-advisors` with `quant-methodologist` and `quant-researcher`:

```jsonc
// ~/projects/mercury/market-data/.beads/formulas/quant-validation.formula.json
{
  "formula": "quant-validation",
  "type": "workflow",
  "version": 1,
  "description": "Per-repo quant chain extending code-with-advisors with mercury's domain specialists.",
  "extends": ["code-with-advisors"],
  "steps": [
    {
      "id": "quant-methodologist",
      "title": "quant-methodologist:{{root_title}}",
      "type": "task",
      "needs": ["root"],
      "description": "MANDATE: lock numerical methodology before executor. Define rounding policy, tick grid, statistical assumptions, real-data smoke requirements.\nINPUTS: root contract.\nOUTPUTS: methodology memo with concrete formulas/policies; required test vectors; smoke-data requirements.",
      "labels": ["chain-step", "kind:step", "role:quant-methodologist", "edge:informs->root", "advisor:pre-impl"]
    }
  ]
}
```

The child template's steps APPEND to parent's. Behavior: bd cook resolves parent + child steps into the full chain shape; pour creates the molecule with all steps.

## Limitations + future evolution

1. **`needs` is `blocks-on` only.** Semantic edges via labels + post-pour helper (above). Acceptable bridge; substrate §22 absorbs natively.
2. **`extends` APPENDS child steps** (not prepend, not replace). To put advisors BEFORE executor when extending, the child must duplicate the executor's `needs` to depend on the new advisors. We avoided extends in defaults; per-repo extension still uses it with this caveat.
3. **No `applies_when` in formula.** Selection logic external. Documented above.
4. **`bd mol pour` creates a NEW molecule** every time — operator can't pour into an existing molecule. For chain insertion (Opportunity 4 `sp chain insert`), helper logic creates step beads directly and wires edges, bypassing pour. Documented in roadmap §3.1.4.
5. **Variables substitute at pour time only.** No runtime variables; no late-binding from bd context. Fine for chain shape; selection logic handles dynamic context.

## Cross-reference

- **Design canon (philosophy + canonical pipeline)** [`docs/design/chain-templates.md`](../../chain-templates.md) — the source-of-truth for the canonical pipeline (§2), template catalog (§3), DevOps gates design gap (§4), composition mechanism (§5), evolution protocol (§6). Non-maintained editorial snapshot: [`chain-templates.html`](../../chain-templates.html).
- **Roadmap** `docs/design/roadmap/specialists-roadmap.md`:
  - §3 twelve alignment opportunities (Opp 4 `sp chain review/approve/insert`, Opp 5 step-bead conventions, Opp 10 `--chain` redesign, Opp 13 `sp stop --all` + `sp chain stop`, Opp 14 QA chain integration)
  - §12 `sp epic` decoration (chain ≡ bd molecule replaces the old chain ≡ bd epic mental model where molecule auto-creates)
  - Phase 6 `using-specialists-v4` SKILL (operator-facing how-to derived from the canon)
- **Substrate (background canonical future)** `docs/design/substrate/substrate.md`:
  - §6.9.2 step-issues (substrate analog of step beads)
  - §6.9.3 mandatory layer (substrate primitive that maps to the canonical pipeline)
  - §6.9.5 composition in three moments
  - §6.9.10 substrate-side catalog reference (points back at canon for full roster)
  - §4.3 chain coordinator (entry-gate at container start)
