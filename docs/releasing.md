# Release workflow

`npm version <patch|minor>` runs `bun run changelog` through the package `preversion` hook, so git-cliff refreshes `[Unreleased]` before the version commit and tag.

Before publishing:

```bash
bun run changelog:check
bun run build
bun test
npm pack --dry-run
```

Publishing is operator-approved only. After approval, publish the scoped package and create the matching GitHub release from the version tag using that version's CHANGELOG section.
