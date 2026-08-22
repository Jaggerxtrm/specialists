# Specialists Roadmap Index

This directory contains the current Specialists requirements/roadmap, mutable release truth, executable chain-source assets, and historical reconciliation material.

Do not infer current implementation state from document dates or old handoff Beads. Begin with the mutable release snapshot and the current XTRM execution plan.

## What to read when

| When | File | What it gives you |
|---|---|---|
| **You need current release and landed-state truth** | [`current-release-snapshot.md`](current-release-snapshot.md) | Current Core/Specialists/xtmux release ledger and delivered/partial/unimplemented classification |
| **You need the current implementation sequence** | [XTRM current execution plan](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.md) | Critical path, workstream IDs, dependencies, promotion gates and cross-repo sequencing |
| **You need the machine-readable dependency graph** | [XTRM execution-plan JSON](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.json) | Referential workstream/gate graph for local planning |
| **You need accepted Specialists requirements and success criteria** | [`specialists-prd.md`](specialists-prd.md) | Current canonical Specialists programme PRD; work-package families, requirements, acceptance and promotion rules |
| **You need per-ID WP continuity** | [`wp-continuity.json`](wp-continuity.json) | All 90 historical `WP-*` identifiers with source, status claim, evidence and residual risk |
| **You need Specialists-owned architecture and sequencing** | [`specialists-roadmap.md`](specialists-roadmap.md) | Package semantic decisions, bridge/read-forward boundaries and delivery sequence |
| **You need one activation's deterministic lifecycle** | [`../execution-protocol-design/specialist-execution-protocol.md`](../execution-protocol-design/specialist-execution-protocol.md) | PREPARE → PLAN → EXECUTE → FINALIZE, identity/grants/probes/recovery/finalization |
| **You need the integrated cross-domain runtime model** | [XTRM runtime MOC](https://github.com/xtrm-dev/xtrm/blob/main/docs/runtime/README.md) | ChainSource→ChainRun, supervision boundaries, Channels/Substrate/telemetry authority map and ADR index |
| **You need canonical chain-template doctrine** | [XTRM chain-template canon](https://github.com/xtrm-dev/xtrm/blob/main/docs/substrate/chain_templates.md) | Canonical pipeline, template semantics, composition and evolution rules |
| **You need local formula/source mechanics** | [`chain-templates/README.md`](chain-templates/README.md) and the formula files | Beads formula mechanics and compatibility ChainSource catalog; not the generic chain ontology |
| **You need the old full v3.2 investigation/implementation packet** | [`history/enhanced-prd-v3.2-2026-07-24.md`](history/enhanced-prd-v3.2-2026-07-24.md) | Historical release snapshots, full original WP tables, filed-Beads dispositions, prompt proposals and revision narrative |
| **You need the earlier prompt/eval predecessor** | [`history/chains-prompt-evals.md`](history/chains-prompt-evals.md) | Historical chain-context/prompt/eval design; superseded by the current PRD |
| **You need historical substrate reconciliation** | [`history/substrate-reconciliation.md`](history/substrate-reconciliation.md) | Design-delta history already absorbed into current authorities |
| **You need the original substrate handoff** | [`history/handoff-from-substrate-design.md`](history/handoff-from-substrate-design.md) | Historical handoff context only |

## Authority by claim type

```text
release and landed-state claims
  released packages/current code → current-release-snapshot.md

cross-repository sequence and promotion gates
  XTRM current execution plan + JSON graph

integrated runtime architecture
  xtrm-dev/xtrm:docs/runtime/**

Specialists package architecture
  specialists-roadmap.md + execution-protocol decisions

accepted Specialists programme scope and success criteria
  specialists-prd.md

per-ID historical work-package continuity
  wp-continuity.json

implementation tasks and completion
  repository-local Beads + Git evidence
```

A current-state update may classify an accepted capability as delivered, partial or residual. It may not silently redesign roadmap decisions or remove PRD scope.

## Chain-template status

Fifteen `.formula.json` source assets exist. They are compatibility `ChainSource` assets, not the generic chain ontology and not by themselves a released orchestration product.

Before production promotion, the programme requires the current XTRM chain/runtime gates: generic ChainSource/ChainDefinition loading, pure compilation/freeze to ResolvedChain, Beads materialization, participant execution through the governed runtime, evidence-driven reducer/scheduler semantics, and an end-to-end fixture.

Do not install or dispatch production chains merely because the source formulas exist.

## What this directory is not

- It is not the cross-domain XTRM runtime canon; use `xtrm-dev/xtrm:docs/runtime/`.
- It is not the Substrate design; that lives in XTRM `docs/substrate/`.
- It is not the mutable release ledger; use `current-release-snapshot.md`.
- It is not the current dispatch queue; use repository-local Beads derived from the current execution plan.
- It is not authority to start every PRD work package concurrently.

## Current implementation centre

```text
ChainSource / ChainDefinition
→ ResolvedChain freeze
→ governed participant activation
→ validated evidence
→ pure reducer / exact scheduler intent
→ durable/recoverable next transition
```

The next bounded milestone is the data-defined SRE chain documented by the XTRM runtime canon. Eval, memory and broader authority promotion remain gated by their named evidence requirements.

## Historical PRD compatibility path

`enhanced-prd.md` is now a short historical pointer. The exact former v3.2 document is preserved under `history/`; automation and agents must use `specialists-prd.md` for current requirements.