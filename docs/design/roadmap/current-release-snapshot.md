# Specialists Programme Current Release Snapshot

**Status:** mutable current-state ledger  
**Last reconciled:** 2026-08-22, Europe/Rome  
**Requirements canon:** [`specialists-prd.md`](specialists-prd.md)  
**Semantic roadmap:** [`specialists-roadmap.md`](specialists-roadmap.md)  
**Integrated runtime canon:** [XTRM runtime MOC](https://github.com/xtrm-dev/xtrm/blob/main/docs/runtime/README.md)  
**Current sequencing:** [XTRM current execution plan](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.md)  
**Machine graph:** [XTRM current execution plan JSON](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.json)

## Purpose

The PRD and roadmap are slow-changing semantic documents. Historical release snapshots embedded in old design documents are not current-state truth.

This file is the compact mutable ledger used before planning or dispatch. It records the latest verified coordinated release identities plus conservative delivered/partial/residual classifications. It does not override accepted architecture or requirements.

The 2026-08-22 refresh verified release/version identity and documentation authority. It did **not** re-run a full source/runtime delivery audit for every historical capability row below; ambiguous residual classifications therefore remain conservative until current code/tests/installed runtime or repository-local Beads prove otherwise.

## Authority by claim type

| Claim type | Authority |
|---|---|
| Current release identity and landed/source-only state | released package/current code/executable tests/contracts, then this snapshot |
| Current implementation sequence and promotion gates | [XTRM current execution plan](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.md) |
| Integrated cross-domain runtime architecture | [XTRM `docs/runtime/`](https://github.com/xtrm-dev/xtrm/tree/main/docs/runtime) |
| Specialists package architecture and semantic decisions | [`specialists-roadmap.md`](specialists-roadmap.md) + execution-protocol decisions |
| Accepted Specialists programme scope, invariants, work-package families and success criteria | [`specialists-prd.md`](specialists-prd.md) |
| Per-ID historical WP continuity | [`wp-continuity.json`](wp-continuity.json) |
| Portfolio status | Jira projection after reconciliation |
| Implementation tasks, dependencies and completion | repository-local Beads and Git evidence |

A release/status refresh may change a capability from planned to delivered. It may not silently redesign an accepted semantic decision or delete PRD scope.

## Released trio

| Repository | Package | Released version | Release evidence | Default-branch drift at this refresh |
|---|---|---:|---|---|
| `xtrm-dev/core` | `xtrm-tools` | `0.11.6` | PR `#595`, commit `ba3515330b17` (`release: v0.11.6`) | none observed |
| `xtrm-dev/specialists` | `@jaggerxtrm/specialists` | `3.21.5` | commit `0253e3e4b823` (`release: v3.21.5`) | one docs-only canon commit `e200b175` (#270) |
| `Jaggerxtrm/xtmux` | `@jaggerxtrm/xtmux` | `0.2.4` | PR `#113`, commit `aebb885f4296` (`release: v0.2.4`) | none observed |

The post-`3.21.5` Specialists delta represented by #270 is documentation/canon reconciliation, not released runtime behavior. This PRD-consolidation branch is likewise documentation-only until merged.

## Delivered foundation

The following foundation was already documented as released before this refresh and remains useful current orientation. Verify exact command/field details against current `--help`, code and tests before relying on them operationally.

### Core

- `xt spec draft|validate|doctor|apply|status|archive` and planner/spec surfaces;
- `/planning` and `/test-planning`;
- Pi/Claude role and subordinate launch infrastructure;
- runtime-origin/coordinator lineage;
- read-only topology projections/views;
- shared XTRM contracts and install/release/runtime compatibility machinery.

### Specialists

- structured Pi-compatible `run/feed` progress and replay ordering;
- exact result/status/integration-evidence surfaces;
- task/Bead rendering surfaces;
- runtime-origin/coordinator ancestry;
- terminal parent notifications for released terminal states;
- interactive `chain-coordinator` bridge persona;
- forensic/Prometheus foundations;
- package-level SpecialistLoader/effective-definition machinery used by the native-harness experiments.

### xtmux

- SQLite V2 typed messages/receipts, reply obligations, waits/wakes and delivery evidence;
- agent instances/transitions/turns, monitors and handoffs;
- runtime/session/pane/role/branch/worktree/parent identity;
- Pi/Claude/Codex lifecycle adapters;
- terminal projection/orphan cleanup;
- reply/FYI/receipt/fulfilment semantics.

## Partially delivered / experiment-proven surfaces

| Surface | Proven/delivered basis | Residual to product promotion |
|---|---|---|
| chain source assets | fifteen `.formula.json` compatibility assets | generic ChainSource/ChainDefinition loader/compiler/freeze/materialization path |
| native Pi hosting | AgentSession SRE vertical slice and Specialist JSON bridge experiments | generic product runtime, data-defined topology, production hardening/recovery |
| coordinator | interactive bridge persona | reducer-driven input, bounded authority and generic chain runtime integration |
| telemetry | forensic identity, structured feeds, Prometheus foundation | full telemetry-integrity suite and whole-chain evaluation evidence |
| assignment/recovery | launch/render/readiness/terminal-notification foundations | canonical ActivationSupervisor/recovery semantics across native product path |
| deterministic context | runtime origin, parent identity, exact result pointers | full ChainRun/step context, capability grants and evidence contracts |
| prompt modernization | selected progressive-disclosure/contract cleanup | generated SSOT output contract and measured prompt/model promotion |

## Not yet accepted as released generic native-chain runtime

The items below are product/canon residuals regardless of whether bounded experiments or bridge implementations already exist:

- generic `ChainSource → ChainDefinition → ResolvedChain → ChainRun` implementation;
- user/ad-hoc/imported ChainSources through one production loader/compiler;
- data-defined SRE topology with zero SRE-specific generic runtime code;
- production ActivationSupervisor integrated with PREPARE/capability-grant/probe/FINALIZE contracts;
- generic evidence-driven ChainReducer + exact scheduler/effect receipts;
- complete `uncertain` reconciliation and crash/replay hardening for the native product path;
- whole-chain Eval Core subjects/graders and promotion evidence;
- governed three-lens memory promotion in the native chain runtime;
- broad automatic coordinator/agent authority beyond explicitly promoted paths.

This list intentionally describes **generic product acceptance**, not whether a prototype or bridge contains part of the behavior.

## Chain-template / ChainSource truth

Fifteen formula files exist in source. They are supported compatibility `ChainSource` assets, not the generic chain ontology and not by themselves a released orchestration product.

- Generic chain ontology: [XTRM runtime PRD + ADR-001](https://github.com/xtrm-dev/xtrm/tree/main/docs/runtime).
- Canonical production-diff template doctrine: [XTRM chain-template canon](https://github.com/xtrm-dev/xtrm/blob/main/docs/substrate/chain_templates.md).
- Local executable/source mechanics: [`chain-templates/README.md`](chain-templates/README.md).

Do not report templates as a production generic chain runtime until the XTRM execution-plan gates prove loader/compiler/freeze/materialization, governed participant execution, evidence reduction, recovery and end-to-end acceptance.

## Current implementation centre

```text
ChainSource / ChainDefinition contracts
→ ChainLoader
→ pure compiler / frozen ResolvedChain
→ data-defined SRE parity
→ SpecialistActivationProfile + PREPARE/grants/probes
→ ActivationSupervisor + FINALIZE
→ receipts/recovery hardening
→ whole-chain Eval Core
```

The detailed cross-repository dependencies and promotion gates live in the XTRM execution plan and JSON companion.

## Before every planning or implementation run

1. Refresh release identities and default heads.
2. Inspect recent merged PRs and repository-local Beads.
3. Classify claims as released, source-only, experiment-proven, partial, superseded or unimplemented.
4. Use the XTRM current execution plan for sequencing.
5. Use `specialists-roadmap.md` / `specialists-prd.md` / the execution protocol for package semantics and acceptance.
6. Update this snapshot when a coordinated release or product-promotion gate materially changes a classification.

## Supersession boundary

The full 24 July v3.2 release table and reconciliation narrative are preserved in [`history/enhanced-prd-v3.2-2026-07-24.md`](history/enhanced-prd-v3.2-2026-07-24.md). They are historical evidence, not current release truth.

This snapshot owns mutable release/landed-state orientation only. It does not supersede PRD scope, roadmap architecture, the execution-protocol semantic contract, or the cross-domain XTRM runtime canon.