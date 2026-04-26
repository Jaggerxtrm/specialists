# @jaggerxtrm/pi-extensions

Unified runtime package for xtrm-managed Pi extensions.

## Publish contract

- Package is published as `@jaggerxtrm/pi-extensions` (public npm package).
- No build step is required. Pi loads raw TypeScript extension entrypoints at runtime.
- `prepublishOnly` runs `verify:runtime` to ensure required runtime assets exist:
  - `src/index.ts`
  - `src/registry.ts`
  - `extensions/`
  - `themes/`
- Files shipped to npm are controlled by `files` in `package.json`.

## Release workflow

From repository root:

```bash
npm run release:pi-extensions
```

To publish both root `xtrm-tools` and this package in one pass:

```bash
npm run release:all
```

## Install contract

Managed project runtime install path:

```bash
pi install npm:@jaggerxtrm/pi-extensions
```

Pi discovers this package through:

- `keywords: ["pi-package"]`
- `pi.extensions: ["./src/index.ts"]`

After install, keep `.pi/settings.json` package wiring pointed at `npm:@jaggerxtrm/pi-extensions`.
