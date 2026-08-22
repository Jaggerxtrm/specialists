# Design — navigation index

> Specialists-package specific design lives here. Cross-cutting XTRM runtime, Substrate, Channels, telemetry and Console design lives in `xtrm-dev/xtrm`.

## Current Specialists authorities

- **[`roadmap/specialists-prd.md`](roadmap/specialists-prd.md)** — CANONICAL programme requirements and acceptance contract. All 90 historical `WP-*` identifiers remain traceable through `roadmap/wp-continuity.json`.
- **[`roadmap/specialists-roadmap.md`](roadmap/specialists-roadmap.md)** — CANONICAL Specialists package architecture and delivery sequence.
- **[`execution-protocol-design/specialist-execution-protocol.md`](execution-protocol-design/specialist-execution-protocol.md)** — CANONICAL deterministic lifecycle for one managed Specialist activation.
- **[`execution-protocol-design/specialist-execution-protocol-ownership-decision.md`](execution-protocol-design/specialist-execution-protocol-ownership-decision.md)** — ownership boundary for the activation protocol.
- **[`roadmap/current-release-snapshot.md`](roadmap/current-release-snapshot.md)** — mutable release/landed-state ledger; not architecture authority.
- **[`roadmap/chain-templates/`](roadmap/chain-templates/)** — 15 executable `.formula.json` compatibility ChainSource assets plus operator/source mechanics.
- **[`roadmap/README.md`](roadmap/README.md)** — detailed roadmap-area reading/authority map.
- **[`roadmap/history/`](roadmap/history/)** — historical artifacts and superseded programme documents. Read for provenance, do not execute them as current plans.

`roadmap/enhanced-prd.md` is retained only as a compatibility breadcrumb to the current PRD and the exact archived v3.2 document.

## Specialists-package design notes

- **[`gzrx-tool-catalog.md`](gzrx-tool-catalog.md)** — gzrx manifest/tool-catalog design.
- **[`gzrx-completion-critique.md`](gzrx-completion-critique.md)** — gap analysis for the gzrx completion epic (`unitAI-qujxo`).
- **[`gzrx-research-notes.md`](gzrx-research-notes.md)** — research findings on agent-runtime tool registries.
- **[`darth-feedor-migration.md`](darth-feedor-migration.md)** — Darth Feedor migration onto specialists-service.

## Historical / archived Specialists material

Earlier design iterations and planning that have been absorbed into current authorities live under `roadmap/history/` and `../archive/`. Historical documents preserve reasoning, old release snapshots, Beads migrations, proposed prompt bodies and predecessor designs; they do not override current code, the roadmap, the current PRD or the execution protocol.

## Cross-cutting XTRM design — external authority

Current cross-domain architecture lives in `xtrm-dev/xtrm`:

- [`docs/runtime/README.md`](https://github.com/xtrm-dev/xtrm/blob/main/docs/runtime/README.md) — integrated runtime MOC and authority hierarchy.
- [`docs/runtime/prd/native-chain-runtime.md`](https://github.com/xtrm-dev/xtrm/blob/main/docs/runtime/prd/native-chain-runtime.md) — integrated ChainSource→ChainRun runtime requirements.
- [`docs/runtime/adr/`](https://github.com/xtrm-dev/xtrm/tree/main/docs/runtime/adr) — chain authoring, durability, native AgentSession, Specialist activation/capabilities/probes, Channels cooperation and supervision boundaries.
- [`docs/substrate/substrate_design_it.md`](https://github.com/xtrm-dev/xtrm/blob/main/docs/substrate/substrate_design_it.md) — canonical Substrate target design (rev12).
- [`docs/substrate/chain_templates.md`](https://github.com/xtrm-dev/xtrm/blob/main/docs/substrate/chain_templates.md) — canonical production-diff template doctrine and catalog semantics.
- [`docs/channels/channels.md`](https://github.com/xtrm-dev/xtrm/blob/main/docs/channels/channels.md) — canonical Channels semantic contract.
- [`docs/telemetry/`](https://github.com/xtrm-dev/xtrm/tree/main/docs/telemetry) — forensic and metrics contracts.
- [`docs/console/`](https://github.com/xtrm-dev/xtrm/tree/main/docs/console) — cross-domain Console product/handoff contracts.

The XTRM runtime canon owns cross-domain workflow/runtime meaning. This repository owns Specialist definitions, activation semantics, package-specific evaluation/prompt work and executable compatibility assets.