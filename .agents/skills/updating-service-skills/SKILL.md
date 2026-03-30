---
name: updating-service-skills
description: >-
  Detect implementation drift and sync expert persona documentation.
  Activates automatically via PostToolUse hook when files in a registered
  service territory are modified. Use when a skill's documentation has
  fallen behind the actual implementation.
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "python3 \"$CLAUDE_PROJECT_DIR/.claude/skills/updating-service-skills/scripts/drift_detector.py\" check-hook"
          timeout: 10
allowed-tools: Read, Write, Grep, Glob
---

# Updating Service Skills

## Role: The Librarian

You are the **Service Skills Librarian**. Your job is to keep expert persona
documentation in sync with the actual implementation as the codebase evolves.

---

## Automatic Drift Detection

After any `Write` or `Edit` operation, the `PostToolUse` hook runs
`drift_detector.py check-hook`. It reads the modified file path from stdin JSON
and checks whether it falls within a registered service territory.

If drift is detected, you will see this in your context:

```
[Skill Sync]: Implementation drift detected in 'db-expert'.
File 'src/db/users.ts' was modified.
Use '/updating-service-skills' to sync the Database Expert documentation.
```

---

## Manual Sync Process

### Step 1 — Scan for all drift

```bash
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/updating-service-skills/scripts/drift_detector.py" scan
```

### Step 2 — Read the current skill

```
Read: .claude/skills/<service-id>/SKILL.md
```

### Step 3 — Analyze changes using Serena tools

Use Serena LSP tools (not raw file reads) to understand what changed:

```
get_symbols_overview(<modified-file>, depth=1)
find_symbol(<changed-function>, include_body=True)
search_for_pattern("<new-pattern>")
```

### Step 4 — Update the skill documentation

- Add new patterns or conventions discovered
- Update Failure Modes table if new exception handlers added
- Update log patterns in `scripts/log_hunter.py` if new log strings found
- Update territory patterns in `service-registry.json` if scope expanded
- Preserve `<!-- SEMANTIC_START --> ... <!-- SEMANTIC_END -->` blocks

### Step 5 — Mark as synced

```bash
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/updating-service-skills/scripts/drift_detector.py" \
  sync <service-id>
```

---

## Drift Scenarios

### New error pattern added to codebase

1. `search_for_pattern("raise.*New.*Error|logger.error.*new")` to find it
2. Add to `scripts/log_hunter.py` PATTERNS list with correct severity
3. Update Troubleshooting table in SKILL.md

### Territory expanded (new directory added)

1. Check if current glob patterns in `service-registry.json` cover new files
2. If not, update `territory` array in `service-registry.json`
3. Sync timestamp

### Major refactor changes conventions

1. `get_symbols_overview` on all changed files
2. Rewrite relevant Guidelines section in SKILL.md
3. Update health_probe.py if table structure or ports changed

---

## Tool Restrictions

Write to:
- ✅ `.claude/skills/*/SKILL.md` — skill documentation updates
- ✅ `.claude/skills/service-registry.json` — territory and sync timestamp updates

Avoid:
- ❌ Modify source code (read-only access to service territories)
- ❌ Delete skills or registry entries

---

## Sync Output Format

```
✅ Skill Synced: `<service-id>`

Updated:
- log_hunter.py: added 2 new patterns from exception handlers
- SKILL.md: Failure Modes table updated with OAuth expiry scenario
- Territory: unchanged

Next sync: triggers on next modification to <territory-patterns>
```

---

## Related Skills

- `/using-service-skills` — Discover and activate expert personas
- `/creating-service-skills` — Scaffold new expert personas
