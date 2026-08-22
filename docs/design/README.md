# Design — navigation index

> **2026-06-07 cleanup (ownvq):** chain-templates and substrate canonical moved to `~/dev/xtrm/docs/` (xtrm-product cross-cutting). What stays here is **specialists-package specific** design. Cross-cutting xtrm design lives in the xtrm monorepo.

## 🛠 `roadmap/` — specialists runtime cleanup roadmap

The specialists-runtime cleanup + substrate-alignment effort designed in the 2026-05-27/28 sessions. **Still the actionable work for the specialists package.**

- **[`roadmap/specialists-roadmap.md`](roadmap/specialists-roadmap.md)** — CANONICAL roadmap (v3.3 baseline: single-Opportunity-19 deterministic execution framing, superseding the old 12-opportunity catalog). Decisions D1–D30 in §0.
- **[`roadmap/chain-templates/`](roadmap/chain-templates/)** — 15 evidence-backed `bd formula` files (verified vs `bd` binary). Phase 0.a installs them to `~/.beads/formulas/`.
- **[`roadmap/README.md`](roadmap/README.md)** — roadmap-area navigation.
- **[`roadmap/history/`](roadmap/history/)** — context-only artifacts that produced the roadmap. Read for context, do NOT act on.

## 📐 Specialists-package design notes (top-level)

- **[`gzrx-tool-catalog.md`](gzrx-tool-catalog.md)** — CANONICAL gzrx manifest + tool catalog design.
- **[`gzrx-completion-critique.md`](gzrx-completion-critique.md)** — gap analysis for the gzrx completion epic (`unitAI-qujxo`).
- **[`gzrx-research-notes.md`](gzrx-research-notes.md)** — research findings on agent-runtime tool registries.
- **[`darth-feedor-migration.md`](darth-feedor-migration.md)** — Darth Feedor migration onto specialists-service.

## 📦 `../archive/` — superseded artifacts

Earlier design iterations and historical planning that have been absorbed into canonical sources (vault, xtrm/docs, or substrate). Includes the issuetracking prototype, plans/, proposals/, other/, iron-review snapshots, friction audits, runtime critiques, substrate review notes, and Tether's predecessor design (`shepherd.md` → now `tether.md` in xtrm/docs/).

## 🏗 Cross-cutting xtrm design (NOT in this repo)

These now live in **`~/dev/xtrm/docs/`** (xtrm monorepo, vault-published):

- `substrate/substrate_design_it.md` — canonical substrate design (rev12, round-3 audit closed via `unitAI-bgyp0`).
- `substrate/substrate_design_en.md` — EN parallel (rev10 → rev12 propagation tracked in `unitAI-e3w1n`).
- `substrate/chain_templates.md` + `.html` — canonical chain-template catalog + pipeline.
- `channels/channels.md` — channel primitive design.
- `telemetry/*` — agentops + forensic + prometheus contracts.
- `console/*` — console product contract + handoffs.
- `tether.md` — always-on context injection (renamed from `shepherd.md`).
- `monorepo-migration.md` + `state-store-options.md` — migration architecture.
