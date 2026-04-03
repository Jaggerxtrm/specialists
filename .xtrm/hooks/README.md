# Hooks

Claude Code hooks that extend agent behavior with automated checks, workflow enhancements, and safety guardrails.

## Overview

Hooks intercept specific events in the Claude Code lifecycle. Following architecture decisions in v2.0.0+, the hook ecosystem is designed exclusively for Claude Code.

*Note: In v2.1.15+, several older hooks (`skill-suggestion.py`, `skill-discovery.py`, `gitnexus-impact-reminder.py`, and `type-safety-enforcement.py`) were removed or superseded by native capabilities, CLI commands, and consolidated quality gates.*

## Project Hooks

### gitnexus-hook.cjs

**Purpose**: Enriches tool calls with knowledge graph context via `gitnexus augment`. Now supports Serena tools and uses a deduplication cache for efficiency.

**Trigger**: PostToolUse (Grep|Glob|Bash|Serena edit tools)

## Beads Issue Tracking Gates

The beads gate hooks integrate the `bd` (beads) issue tracker directly into Claude's workflow, ensuring no code changes happen without an active ticket.

**Installation**: Installed with `xtrm install all` or included when `beads`+`dolt` is available.

### Core Gates
- **`beads-edit-gate.mjs`** (PreToolUse) — Blocks writes/edits without an active issue claim.
- **`beads-commit-gate.mjs`** (PreToolUse) — Blocks commits with an unresolved session claim.
- **`beads-stop-gate.mjs`** (Stop) — Blocks session stop while a claim remains open.
- **`beads-close-memory-gate.mjs`** (PreToolUse) — Blocks `bd close` until memory handoff is acknowledged per issue.
- **`beads-memory-gate.mjs`** (Stop) — Fallback reminder if close-time memory acknowledgment is missing.

### Compaction & State Preservation (v2.1.18+)
- **`beads-pre-compact.mjs`** (PreCompact) — Saves the currently `in_progress` beads state before Claude clears context.
- **`beads-session-start.mjs`** (SessionStart) — Restores the `in_progress` state when the session restarts after compaction.

*Note: As of v2.1.18+, hook blocking messages are quieted and compacted to save tokens.*

## Hook Timeouts

Adjust hook execution timeouts in `settings.json` if commands take longer than expected:

```json
{
  "hooks": {
    "PostToolUse": [{
      "hooks": [{
        "timeout": 5000  // Timeout in milliseconds (5000ms = 5 seconds)
      }]
    }]
  }
}
```

## Creating Custom Hooks

To create new project-specific hooks, use the `hook-development` global skill. Follow the canonical structure defined in the `xtrm-tools` core libraries.

For debugging orphaned hooks, use `xtrm clean`.

## Pi Extensions Migration

Core workflow hooks have been migrated to native Pi Extensions for better performance and integration. See the [Pi Extensions Migration Guide](../docs/pi-extensions-migration.md) for details.
