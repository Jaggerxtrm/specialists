---
name: documenting
description: >-
  Maintain SSOT documentation with drift detection. Runs drift_detector.py scan
  on invoke to identify stale memories. Creates/updates Serena memories with
  auto-generated INDEX blocks. MUST be suggested after any feature, refactor,
  or architecture change is verified complete.
gemini-command: document
gemini-prompt: |
  1. Identify the task: Create new memory, Update existing, or Validate compliance.
  2. For finalizing changes, use the orchestrator script to update CHANGELOG.md and README.md.
  3. Ensure SSOT memories are stored in .serena/memories/ with correct naming conventions.
  4. Validate YAML frontmatter metadata before completing the task.
version: 2.0.0
---

# Documenting Skill

This skill provides workflows and tools for maintaining the Serena Single Source of Truth (SSOT) documentation system/memories.

## 🚨 AGENT GUIDANCE: When to Suggest This Skill

**MANDATORY: Suggest or Use this skill in the following scenarios:**

### ✅ Explicit Triggers:
- User asks to "document this", "create memory", "update ssot".
- User asks to "validate documentation", "check metadata".
- User asks to "list memories", "show patterns".
- User asks to "bump version" of a document.

### 🤖 Autonomous Triggers (End of Task):
- **Condition**: A task (feature, refactor, bugfix) is **completed** and **verified** (tests passed).
- **Action**: The agent MUST check if SSOT documentation needs creation or update.
- **Guideline**: "Is this a new component? Update `_ssot`. Is this a new pattern? Create `_pattern`. Did I change architecture? Update `_ssot`."

### 📋 Detection Pattern:
```javascript
const shouldDocument = 
  /(document|ssot|memory|metadata|changelog|bump version)/i.test(userMessage) ||
  (taskCompleted && (newFeature || refactor || architectureChange));
```

---

## Core Capabilities

1. **Create Memories**: Generate new SSOT documents with correct metadata and structure.
2. **Update Memories**: Bump versions and maintain changelogs.
3. **Validate Compliance**: Ensure files follow naming conventions and metadata schemas.
4. **Navigate**: List and find memories by category.

## Workflows

**🚨 MANDATORY FIRST STEP FOR ALL WORKFLOWS:**

Before using ANY Serena tools, activate the project:

```javascript
mcp__plugin_serena_serena__activate_project({ project: "/path/to/current/working/directory" })
```

---

### Step 1: Detect drift

```bash
python3 "$HOME/.claude/skills/documenting/scripts/drift_detector.py" scan
```

Review the output. If nothing is stale and no explicit documentation request was made → confirm to user and stop.

### Step 2: Decide action

| Situation | Action |
|---|---|
| New feature shipped | Create new SSOT memory OR update existing |
| Refactor / architecture change | Update relevant SSOT, bump minor version |
| Bug fix only | CHANGELOG entry only (skip memory update unless behaviour changed) |
| SKILL.md drift flagged | Update skill + run `validate_metadata.py` on it |

### Step 3: Create or update memory

**Creating a new memory:**
```bash
python3 "$HOME/.claude/skills/documenting/scripts/generate_template.py" \
  ssot <name>_ssot.md title="..." domain="..." subcategory="..."
```
Fill `[PENDING]` placeholders. Add `tracks:` globs pointing to the files this memory documents.

**Updating an existing memory:**
1. Read the `<!-- INDEX -->` block only — identify which sections need updating
2. Use `search_for_pattern` to jump directly to stale sections (avoids reading the full file)
3. Bump `version:` (patch = content fix, minor = new section, major = full rewrite)
4. Update `updated:` timestamp to today

### Step 4: Regenerate INDEX

```bash
python3 "$HOME/.claude/skills/documenting/scripts/validate_metadata.py" <memory-file>
```

This regenerates the `<!-- INDEX -->` block automatically from the current `##` headings.

### Step 5: Update CHANGELOG

```bash
python3 "$HOME/.claude/skills/documenting/scripts/changelog/add_entry.py" \
  <changelog_file> <type> "<summary>"
```

> `<changelog_file>`: path to target CHANGELOG.md (e.g. `CHANGELOG.md` or `.serena/memories/CHANGELOG.md`)

Types: `Added`, `Changed`, `Fixed`, `Removed`.
