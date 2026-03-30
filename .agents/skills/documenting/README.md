# Documenting Skill

Comprehensive documentation management for projects using:
- **Serena SSOT** (.serena/memories/)
- **CHANGELOG.md** (Keep a Changelog format)
- **README.md**
- **CLAUDE.md / AGENT.md**

## Quick Start

### Initialize Project Documentation

```bash
# Create CHANGELOG.md
python3 scripts/changelog/init_changelog.py ./CHANGELOG.md

# Create .serena/memories directory
mkdir -p .serena/memories
```

### Document a Change

**Using Orchestrator (Recommended)**:

```bash
python3 scripts/orchestrator.py . feature "Add new search feature" \
  --scope=search \
  --category=backend
```

**Manual Workflow**:

1. Update CHANGELOG:
   ```bash
   python3 scripts/changelog/add_entry.py CHANGELOG.md Added "New feature"
   ```

2. Create SSOT (if needed):
   ```bash
   python3 scripts/generate_template.py ssot .serena/memories/ssot_search_engine_2026-02-01.md \
     title="Search Engine SSOT" \
     scope="search-engine" \
     domain="backend"
   ```

3. Update README.md and CLAUDE.md manually

4. Validate:
   ```bash
   python3 scripts/changelog/validate_changelog.py CHANGELOG.md
   python3 scripts/validate_metadata.py .serena/memories/ssot_*.md
   ```

### Release a Version

```bash
# Bump CHANGELOG
python3 scripts/changelog/bump_release.py CHANGELOG.md 1.2.0

# Validate
python3 scripts/changelog/validate_changelog.py CHANGELOG.md

# Commit and tag
git add CHANGELOG.md
git commit -m "chore: release v1.2.0"
git tag -a v1.2.0 -m "Release 1.2.0"
```

## Scripts Reference

### CHANGELOG Management

| Script | Purpose | Example |
|--------|---------|---------|
| `init_changelog.py` | Create new CHANGELOG.md | `init_changelog.py ./CHANGELOG.md` |
| `add_entry.py` | Add entry to [Unreleased] | `add_entry.py CHANGELOG.md Added "Feature X"` |
| `bump_release.py` | Release new version | `bump_release.py CHANGELOG.md 1.2.0` |
| `validate_changelog.py` | Validate format | `validate_changelog.py CHANGELOG.md` |

### SSOT Management

| Script | Purpose | Example |
|--------|---------|---------|
| `generate_template.py` | Create new SSOT | `generate_template.py ssot file.md title="X"` |
| `validate_metadata.py` | Validate SSOT metadata | `validate_metadata.py file.md` |
| `bump_version.sh` | Calculate next version | `bump_version.sh 1.0.0 patch` |

### Orchestration

| Script | Purpose | Example |
|--------|---------|---------|
| `orchestrator.py` | Coordinate all docs | `orchestrator.py . feature "X"` |

## File Structure

```
~/.claude/skills/documenting/
├── SKILL.md                      # Skill definition
├── README.md                     # This file
├── scripts/
│   ├── changelog/
│   │   ├── init_changelog.py    # Create CHANGELOG
│   │   ├── add_entry.py         # Add entries
│   │   ├── bump_release.py      # Release versions
│   │   └── validate_changelog.py # Validate format
│   ├── orchestrator.py          # Coordination
│   ├── generate_template.py     # SSOT templates
│   ├── validate_metadata.py     # SSOT validation
│   └── bump_version.sh          # Version bumping
├── templates/
│   └── CHANGELOG.md.template    # CHANGELOG template
├── references/
│   ├── metadata-schema.md       # SSOT schema
│   ├── changelog-format.md      # Keep a Changelog guide
│   └── taxonomy.md              # SSOT taxonomy
└── tests/
    ├── test_changelog.py        # CHANGELOG tests
    └── test_orchestrator.py     # Orchestrator tests
```

## Change Type Guide

- **feature**: New functionality → CHANGELOG: Added
- **bugfix**: Bug fixes → CHANGELOG: Fixed
- **refactor**: Code restructuring → CHANGELOG: Changed
- **breaking**: Breaking changes → CHANGELOG: Changed (with **BREAKING** prefix)
- **docs**: Documentation → CHANGELOG: Changed
- **chore**: Maintenance → CHANGELOG: Changed

## Validation

All scripts validate before modifying files:
- CHANGELOG: Keep a Changelog 1.0.0 format
- SSOT: Serena metadata schema
- Versions: Semantic Versioning 2.0.0

## Testing

```bash
# Run all tests
python -m pytest tests/

# Test specific module
python -m pytest tests/test_changelog.py -v

# Integration test
bash tests/integration_test.sh
```
