# Specialists Roadmap Index

This directory contains the requirements, semantic design and historical reconciliation material for the pre-Substrate Specialists runtime programme.

Do not infer current implementation state from document dates or old handoff Beads. Begin with the mutable release snapshot and the current XTRM execution plan.

## What to read when

| When | File | What it gives you |
|---|---|---|
| **You need current release and landed-state truth** | [`current-release-snapshot.md`](current-release-snapshot.md) | Current Core/Specialists/xtmux release ledger; delivered, partial and unimplemented capability classification |
| **You need the current implementation sequence** | `xtrm-dev/xtrm/docs/shared/xtrm-current-execution-plan.md` | Critical path, workstream IDs, dependencies, promotion gates and Jira disposition |
| **You are compiling the plan into local Beads** | `xtrm-dev/xtrm/docs/shared/xtrm-local-coordinator-bootstrap.md` | Repository-owned Beads structure, first audit wave and dispatch restrictions |
| **You need accepted requirements and success criteria** | [`enhanced-prd.md`](enhanced-prd.md) | Canonical implementation PRD and work-package acceptance |
| **You need the bridge runtime roadmap and design rationale** | [`specialists-roadmap.md`](specialists-roadmap.md) | Opportunities, decisions, substrate reads-forward and historical sequencing rationale |
| **You need chain-template semantics** | [`chain-templates/README.md`](chain-templates/README.md) and the formula files | Source template catalog, formula mechanics and known bridge limitations |
| **You need prompt/eval design detail** | [`chains-prompt-evals.md`](chains-prompt-evals.md) | Chain context, prompt experimentation and evaluation design |
| **You need historical substrate reconciliation** | [`history/substrate-reconciliation.md`](history/substrate-reconciliation.md) | Design-delta history already absorbed into the canonical roadmap |
| **You need the original substrate handoff** | [`history/handoff-from-substrate-design.md`](history/handoff-from-substrate-design.md) | Historical handoff context only |

## Current control model

```text
released packages and current code
→ executable schemas/tests/public contracts
→ current release snapshot and XTRM execution plan
→ PRD and semantic roadmap
→ Jira projection
→ historical artifacts
```

Repository-local Beads are the implementation truth. Jira is the portfolio projection. Git is the branch, commit and integration truth.

## Chain-template status

The directory contains fifteen `.formula.json` source assets. They are not yet a released orchestration product.

Before production promotion, the programme still requires:

- supported package/install delivery;
- one pure compiler to `specialists.resolved-chain.v1`;
- persisted draft and approved topology;
- manual `sp chain review|insert|approve|show`;
- minimum `specialists.execution.v1` enforcement;
- an evidence-driven reducer and exact scheduler intents;
- a released-trio end-to-end fixture.

Do not copy the formulas to user-global paths or dispatch production work merely because the source files exist.

## What this directory is not

- It is not the Substrate design; that lives under [`../substrate/`](../substrate/).
- It is not a live release ledger; use `current-release-snapshot.md`.
- It is not the current dispatch queue; use repository-local Beads generated from the XTRM current execution plan.
- It is not authority to start every PRD work package concurrently.

## Current implementation centre

```text
approved root contract
→ persisted deterministic execution shape
→ exact idempotent command intent
→ validated participant result
→ evidence-driven next transition
```

The first executable programme packet is limited to deterministic command outcomes, the minimum activation protocol, the chain compiler/durable spine and the reducer/promotion fixture. Evaluation, memory, adapters and product surfaces remain gated later programmes.