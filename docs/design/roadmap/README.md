# Specialists Roadmap Index

This directory contains requirements, semantic design and historical reconciliation material for the pre-Substrate Specialists runtime programme.

Do not infer current implementation state from document dates or old handoff Beads. Begin with the mutable release snapshot and the current XTRM execution packet.

## What to read when

| When | File | What it gives you |
|---|---|---|
| **You need current release and landed-state truth** | [`current-release-snapshot.md`](current-release-snapshot.md) | Current Core/Specialists/xtmux release ledger and delivered/partial/unimplemented classification |
| **You need the current implementation sequence** | [XTRM current execution plan](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.md) | Critical path, workstream IDs, dependencies, gates and Jira disposition |
| **You need the machine-readable dependency graph** | [XTRM execution-plan JSON](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-current-execution-plan.json) | Referential workstream/gate graph for local planning |
| **You are compiling the plan into local Beads** | [XTRM local coordinator bootstrap](https://github.com/xtrm-dev/xtrm/blob/main/docs/shared/xtrm-local-coordinator-bootstrap.md) | Repository-owned Beads structure, first audit wave and dispatch restrictions |
| **You need accepted requirements and success criteria** | [`enhanced-prd.md`](enhanced-prd.md) | Canonical implementation PRD and work-package acceptance |
| **You need bridge-runtime architecture and accepted Opportunities** | [`specialists-roadmap.md`](specialists-roadmap.md) | Semantic decisions, substrate reads-forward and historical implementation rationale |
| **You need canonical chain semantics** | [XTRM chain-template canon](https://github.com/xtrm-dev/xtrm/blob/main/docs/substrate/chain_templates.md) | Canonical pipeline, template semantics, composition and evolution rules |
| **You need local formula/source mechanics** | [`chain-templates/README.md`](chain-templates/README.md) and the formula files | Beads formula mechanics, source catalog and bridge limitations; not the semantic canon |
| **You need prompt/eval design detail** | [`chains-prompt-evals.md`](chains-prompt-evals.md) | Chain context, prompt experimentation and evaluation design |
| **You need historical substrate reconciliation** | [`history/substrate-reconciliation.md`](history/substrate-reconciliation.md) | Design-delta history already absorbed into the canonical roadmap |
| **You need the original substrate handoff** | [`history/handoff-from-substrate-design.md`](history/handoff-from-substrate-design.md) | Historical handoff context only |

## Authority by claim type

```text
release and landed-state claims
  released packages/current code → current-release-snapshot.md

current sequencing and promotion gates
  xtrm current execution plan + JSON graph

runtime architecture and semantic decisions
  specialists-roadmap.md + execution-protocol decisions + chain-template canon

accepted programme scope and success criteria
  enhanced-prd.md

implementation tasks and completion
  repository-local Beads + Git evidence
```

A current-state update may classify an accepted capability as delivered, partial or residual. It may not silently redesign roadmap decisions or remove PRD scope.

## Chain-template status

Fifteen `.formula.json` source assets exist. They are not yet a released orchestration product.

Before production promotion, the programme requires:

- supported package/install delivery;
- one pure compiler to `specialists.resolved-chain.v1`;
- persisted draft and approved topology;
- manual `sp chain review|insert|approve|show`;
- minimum `specialists.execution.v1` enforcement;
- evidence-driven reducer and exact scheduler intents;
- released-trio end-to-end fixture.

Do not install or dispatch production chains merely because the source formulas exist.

## What this directory is not

- It is not the Substrate design; that lives under [`../substrate/`](../substrate/).
- It is not the mutable release ledger; use `current-release-snapshot.md`.
- It is not the current dispatch queue; use repository-local Beads compiled from the XTRM execution plan.
- It is not authority to start every PRD work package concurrently.

## Current implementation centre

```text
approved root contract
→ persisted deterministic execution shape
→ exact idempotent command intent
→ validated participant result
→ evidence-driven next transition
```

The first executable packet is limited to deterministic command outcomes, the minimum activation protocol, the chain compiler/durable spine and the reducer/promotion fixture. Evaluation, memory, adapters and product surfaces remain gated later programmes.

## Merge-order requirement

This index depends on the four canonical files introduced by `xtrm-dev/xtrm#31`. Merge that PR before this Specialists reconciliation so the direct `main` links resolve in fresh checkouts.