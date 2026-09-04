# Registry and locations

Do not maintain a static role/model/permission table in this skill.

Use:

```bash
specialists list --full
sp help
sp config show <name> --resolved
```

and subcommand help for exact syntax.

Package-canonical definitions and rules live in the Specialists package/source; global and
repo overlays may alter effective fields. The resolved config is therefore more useful
than opening one package JSON file when diagnosing a running environment.

Core/XTRM may vendor selected Specialist-owned **skills** for distribution. That vendored
snapshot is not the Specialist runtime definition source. Its pinned upstream commit and
destination are recorded by Core's Specialists source/ownership manifests.