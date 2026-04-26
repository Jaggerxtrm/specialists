# Internal core module layout

This directory is the internal home for shared code that previously lived in the published `@xtrm/pi-core` package.

## Contract for follow-up phases

- Keep all shared runtime helpers under `src/core/**`.
- Import from relative paths inside `@jaggerxtrm/pi-extensions`; do not publish or depend on `@xtrm/pi-core`.
- Delegate concrete extension entrypoints from `extensions/**` through the package root `src/index.ts`.
