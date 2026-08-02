# Specialists Programme Current Release Snapshot

**Status:** mutable current-state ledger  
**Last reconciled:** 2026-08-02, Europe/Rome  
**Requirements canon:** `enhanced-prd.md`  
**Sequencing canon:** `xtrm-dev/xtrm/docs/shared/xtrm-current-execution-plan.md`  

## Purpose

The Specialists PRD and roadmap are large semantic and requirements documents. Their embedded release snapshots are historical after the next coordinated release.

This file is the compact current-state ledger used before planning or dispatch. It records what is released, what exists only in source, and what remains genuinely unimplemented.

Authority order:

```text
released package and current code
→ executable schemas/tests/public contracts
→ this snapshot and the XTRM current execution plan
→ roadmap and PRD work packages
→ Jira projections and historical planning artifacts
```

## Released trio

| Repository | Package | Released version | Release evidence | Default-branch drift |
|---|---|---:|---|---|
| `xtrm-dev/core` | `xtrm-tools` | `0.11.4` | PR `#535`, commit `9b823f80` | none |
| `xtrm-dev/specialists` | `@jaggerxtrm/specialists` | `3.21.2` | PR `#240`, commit `c1e660ab` | one release-maintenance commit |
| `Jaggerxtrm/xtmux` | `@jaggerxtrm/xtmux` | `0.2.3` | PR `#89`, commit `12d6709e` | none |

The Specialists source-only commit after `3.21.2` changes future npm changelog packaging/rendering. It does not add runtime behavior.

## Delivered foundation

### Core

Released:

- `xt spec draft|validate|doctor|apply|status|archive`;
- spec schema, XML change-contract generation and apply/reconcile state;
- `/spec-dispatch`, `/planning`, `/test-planning`;
- Pi/Claude role and subordinate launches;
- runtime-origin and coordinator lineage;
- read-only topology projection and views;
- shared XTRM contracts;
- install/release/runtime compatibility hardening.

### Specialists

Released:

- structured Pi-compatible `run/feed` progress and deterministic replay ordering;
- exact `result`, status and integration evidence surfaces;
- `render-task` and roleless `render-bead`;
- runtime-origin/coordinator ancestry;
- terminal parent notifications for `done`, `error`, `cancelled`;
- interactive `chain-coordinator` bridge persona;
- forensic and Prometheus foundations;
- audit/release/help/background closure work.

### xtmux

Released:

- SQLite V2 messages, reply obligations, monitors, wakes and delivery evidence;
- exact message and completed-turn retrieval;
- runtime/session/pane/role/branch/worktree/parent identity;
- canonical Beads event streaming;
- Pi, Claude and Codex lifecycle hooks;
- bounded capture, terminal monitor projection and orphan cleanup;
- clarified reply/FYI/receipt/fulfilment semantics.

## Partially delivered roadmap surfaces

| Surface | Delivered | Residual |
|---|---|---|
| `xt spec` | full v0 command family and planner dispatch | canonical chain compiler/composition handoff |
| chain templates | fifteen source `.formula.json` assets | package/install path, compiler, persistence, composition CLI |
| coordinator | interactive bridge persona | reducer input, bounded authority, incident/close/recovery semantics |
| telemetry | forensic identity, structured feeds, Prometheus foundations | `telemetry-integrity-v1`, Eval Core and promotion evidence |
| assignment/recovery | role launch, rendering, readiness and terminal notification foundations | logical-session identity, recovery classifier and safe resume |
| deterministic context | runtime origin, parent identity, exact result pointers | full chain position, gates, context completeness and handoff contract |
| prompt modernization | selected progressive-disclosure and contract cleanup | generated output contract and evidence-driven A/B promotion |

## Not implemented as released runtime

- `xtrm.command-outcome.v1`;
- executable `specialists.execution.v1` profiles and PREPARE/FINALIZE reducers;
- `sp chain review|insert|approve|show|wire-edges`;
- persisted `specialists.resolved-chain.v1`;
- pure evidence-driven chain reducer;
- exact idempotent scheduler intents;
- logical-session recovery model;
- Eval Core and `sp eval`;
- three-lens memory;
- thin native XTRM Claude/Pi tools;
- Pi runtime unification closure and `pi-extensible-workflows` integration;
- Core-owned `xt codex` launcher;
- Agent Workspace.

## Chain-template truth

The template directory currently contains fifteen formula files. They are valid source assets, not a released orchestration product.

The released `sp` command catalog has no `chain` command. The roadmap's `review`, `approve`, `insert` and semantic-edge helper remain design work.

Do not report chain templates as production-ready until:

1. the catalog ships through a supported package/install path;
2. one pure compiler emits a persisted `ResolvedChain`;
3. the minimum activation execution protocol is enforced;
4. manual composition commands exist;
5. the reducer derives next transitions from persisted evidence;
6. a coordinated released-trio fixture passes.

## Current critical path

```text
deterministic public command outcomes
→ minimum specialists.execution.v1
→ chain compiler and persisted ResolvedChain
→ manual composition gate
→ evidence reducer and scheduler intents
→ coordinator shadow mode
→ Eval Core and measured authority promotion
```

Detailed workstream IDs, dependencies and promotion gates live in the XTRM current execution plan and its JSON companion.

## Before every planning or implementation run

1. Refresh all three release versions and default heads.
2. Inspect recent merged PRs and existing Beads.
3. Classify claims as released, source-only, partial, superseded or unimplemented.
4. Use the current execution plan rather than the dates embedded in the PRD.
5. Update this snapshot in the same coordinated release wave when any classification changes.

## Supersession note

The `24 July 2026` release table embedded in `enhanced-prd.md` remains historical evidence for that reconciliation. This file supersedes it for current release identity and landed-state claims. The PRD remains authoritative for accepted requirements, invariants and work-package acceptance.