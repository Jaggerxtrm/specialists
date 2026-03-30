# Versioning Rules for SSOT

This reference defines the semantic versioning rules for maintaining Serena memories.

## Core Principle

Treat documentation versioning with the same rigor as software versioning. This allows agents to determine if their context is outdated and understand the magnitude of changes.

## Version Format

Use Semantic Versioning 2.0.0: `MAJOR.MINOR.PATCH`

### Format: `x.y.z`

- **x (Major)**: Breaking changes / Rewrite
- **y (Minor)**: New features / Significant additions
- **z (Patch)**: Corrections / Clarifications / Minor updates

## Bumping Rules

### Patch (x.y.Z) -> (x.y.Z+1)
Increment the patch version for:
- Typos and grammar fixes
- Clarifications of existing content
- Adding examples
- Updating links or references
- Minor formatting changes
- Metadata updates (e.g., adding a tag)

### Minor (x.Y.0) -> (x.Y+1.0)
Increment the minor version for:
- Adding a new section or component description
- Extending the scope of the document
- Documenting new features added to the system
- Significant rewrites of specific sections that don't change the overall architecture
- Adding a new known limitation or workaround

### Major (X.0.0) -> (X+1.0.0)
Increment the major version for:
- Complete rewrite of the document
- Major architectural changes to the system described
- Fundamental change in the document's purpose or scope
- Marking large sections as deprecated/removed
- Changing the "Single Source of Truth" authority (e.g., merging two SSOTs)

## Changelog Maintenance

Every SSOT document must have a `changelog` list in the frontmatter.

### Format
```yaml
changelog:
  - VERSION (DATE): SUMMARY
```

### Guidelines
- **Reverse Chronological Order**: Newest entries first.
- **Concise**: Keep summaries under 140 characters if possible.
- **Date Format**: YYYY-MM-DD.

### Example
```yaml
changelog:
  - 1.2.0 (2026-01-20): Added section on Redis caching strategy.
  - 1.1.1 (2026-01-15): Fixed typos in configuration examples.
  - 1.1.0 (2026-01-10): Documented new async processing pipeline.
  - 1.0.0 (2026-01-01): Initial release.
```

## Workflow for Updating

1. **Assess Change**: Determine if it's Patch, Minor, or Major.
2. **Update Content**: Make the changes in the markdown body.
3. **Update Frontmatter**:
   - Update `version` field.
   - Update `updated` timestamp (ISO8601).
   - Add entry to top of `changelog`.
4. **Commit**: Save the file.
