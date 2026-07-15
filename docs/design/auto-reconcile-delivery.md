# Auto-reconcile PR delivery — SUPERSEDED

This design is SUPERSEDED on 2026-06-26 by:
`xtrm-dev/xtrm`:`docs/devops/mercury-devops-collaborator.md`
(see Sections 3, 4, 8 for the container architecture that replaces the
A/B/C/D options analyzed in the original draft).

The original Path A/B/C/D analysis is retained in git history (commit
`d2c3eca5`) for the historical record, but the design questions it answered
are subsumed by the container model. The container resolves the gh-on-self-hosted
blocker that gated Option B by baking `gh` into a deterministic image-baked
toolchain, and retires CI-based execution entirely (container doc §12).
