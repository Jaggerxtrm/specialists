---
name: update-specialists
description: >
  Optional maintainer workflow for reconciling Specialists package/runtime drift and
  XTRM-managed Specialist skill/vendor drift. Use when upgrading Specialists, checking
  stale package-owned definitions/rules, or verifying that Core's vendored Specialist
  skills match their pinned upstream source. Keep Specialists runtime updates and XTRM
  asset updates as separate ownership tracks.
disable-model-invocation: true
---

# Update Specialists

There are two different update problems.

```text
Specialists runtime/package definitions, rules, catalogs
  -> Specialists owns them

XTRM packaged skills/hooks/active views and vendored Specialist skill snapshots
  -> Core/XTRM owns distribution
```

Do not repair one by overwriting the other.

## Diagnose first

Use the current installed commands, not this file as a command reference:

```bash
sp --version
sp doctor --help
xt doctor --help
xt update --help
```

Inspect package/runtime drift with the current `sp doctor`/config surfaces. Inspect XTRM
managed-asset drift with `xt doctor` and dry-run `xt update` where supported.

## Preserve ownership

- Package-canonical Specialist definitions/rules come from the Specialists package/source.
- User/repo overlays are intentional until proven otherwise; do not overwrite them.
- XTRM default/optional skill payloads are generated/managed assets; change their source
  and regenerate rather than patching an installed active view.
- Core's vendored Specialist skills must match the pinned Specialists commit and declared
  destination pack/default placement.

## Apply narrowly

For one affected repo, keep the update local. For a fleet, collect a report first and
apply only after the operator can see which repositories/package versions/overlays will
change.

After an update, re-run the same diagnostics and verify effective resolved definitions and
XTRM active skill view. “Command completed” is not proof the runtime now resolves the
intended version.