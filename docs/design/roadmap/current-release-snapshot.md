# Specialists Programme Current Release Snapshot

**Status:** mutable current-state ledger  
**Last reconciled:** 2026-08-02, Europe/Rome  
**Requirements canon:** [`enhanced-prd.md`](enhanced-prd.md)  
**Semantic roadmap:** [`specialists-roadmap.md`](specialists-roadmap.md)  
**Current sequencing:** [XTRM current execution plan](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.md)  
**Machine graph:** [XTRM current execution plan JSON](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.json)  

## Purpose

The PRD and roadmap are large, slow-changing semantic documents. Their embedded release snapshots become historical after a coordinated release.

This file is the compact current-state ledger used before planning or dispatch. It records what is released, what exists only in source, and what remains unimplemented.

It does not override accepted architecture or requirements.

## Authority by claim type

Different documents are authoritative for different claims:

| Claim type | Authority |
|---|---|
| Current release identity and landed/source-only state | released package, current code, executable tests/contracts, then this snapshot |
| Current implementation sequence and promotion gates | [XTRM current execution plan](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.md) |
| Specialist runtime architecture, Opportunities and semantic decisions | [`specialists-roadmap.md`](specialists-roadmap.md), execution-protocol ownership decision and chain-template canon |
| Accepted programme scope, invariants, work-package gates and success criteria | [`enhanced-prd.md`](enhanced-prd.md) |
| Portfolio status | Jira projection after reconciliation |
| Implementation tasks, dependencies and completion | repository-local Beads and Git evidence |

A release/status refresh may change a capability from planned to delivered. It may not silently redesign an accepted semantic decision or delete PRD scope.

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
- reply/FYI/receipt/fulfilment semantics.

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

Fifteen formula files exist in source. They are not a released orchestration product.

The semantic canon is [XTRM chain templates](https://github.com/xtrm-dev/xtrm/blob/main/docs/substrate/chain_templates.md). The local [`chain-templates/README.md`](chain-templates/README.md) documents source-asset and Beads formula mechanics; it is not the semantic authority.

The released `sp` command catalog has no `chain` command. The roadmap's composition commands and semantic-edge helper remain design work.

Do not report chain templates as production-ready until:

1. the catalog ships through a supported package/install path;
2. one pure compiler emits a persisted `ResolvedChain`;
3. the minimum activation protocol is enforced;
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

Detailed workstream IDs, dependencies and gates live in the current execution plan and JSON companion.

## Before every planning or implementation run

1. Refresh all three release versions and default heads.
2. Inspect recent merged PRs and existing Beads.
3. Classify claims as released, source-only, partial, superseded or unimplemented.
4. Use the current execution plan for sequencing.
5. Use the roadmap/PRD for semantics, accepted scope and acceptance.
6. Update this snapshot in the same coordinated release wave when classifications change.

## Supersession boundary

The `24 July 2026` release table embedded in `enhanced-prd.md` remains historical evidence for that reconciliation.

This file supersedes it only for:

- current package versions;
- current default-branch drift;
- delivered/source-only/partial/unimplemented classification.

It does not supersede:

- PRD scope, invariants, gates or success criteria;
- roadmap Opportunities, architectural decisions or substrate reads-forward;
- the execution-protocol semantic contract.