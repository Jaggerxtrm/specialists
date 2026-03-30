# docs/ Structure Guide

This reference defines what belongs in each focused docs/ file vs README.md.

## The Rule

**README.md** is an entry point — a quick-start and orientation map. It should be < 200 lines. Anything that requires more than a few bullet points belongs in a focused docs/ file.

**docs/** holds focused, public-facing SSOT files for each subsystem. Each file:
- Has YAML frontmatter (see `schema.md`)
- Covers exactly one subsystem or concern
- Is linked from README.md with a single line

---

## What Goes Where

| Content Type | Location | When to Create |
|---|---|---|
| Quick start, one-liner install | `README.md` | Always |
| Feature overview table | `README.md` | Always, < 20 lines |
| Hook events, scripts, behavior | `docs/hooks.md` | When hooks/ dir exists |
| Pi/Copilot extension catalog | `docs/pi-extensions.md` | When config/pi/extensions/ exists |
| System architecture, components | `docs/architecture.md` | When > 2 major subsystems |
| Policy rules and enforcement | `docs/policies.md` | When policies/ dir exists |
| MCP server config and usage | `docs/mcp-servers.md` | When .mcp.json or mcp servers exist |
| Skills catalog | `docs/skills.md` | When skills/ dir has > 5 skills |
| CLI commands reference | `docs/cli-reference.md` | When CLI has > 10 commands |
| Troubleshooting and FAQs | `docs/troubleshooting.md` | When recurring issues exist |
| In-progress work plans | `docs/plans/` | Always for planning docs |

---

## Standard File Shapes

### docs/hooks.md
Covers: hook events, what triggers each hook, which scripts run, output format.
Section outline:
```
## Overview
## Hook Events
## Scripts Reference
## Adding a New Hook
```

### docs/pi-extensions.md
Covers: what Pi extensions are installed, their events, behavior, and configuration.
Section outline:
```
## Overview
## Installed Extensions
## Extension Events
## Configuration
```

### docs/architecture.md
Covers: system overview, key components, data flow, dependency diagram.
Section outline:
```
## System Overview
## Key Components
## Data Flow
## Directory Structure
```

### docs/policies.md
Covers: what policies exist, what each enforces, runtime targets.
Section outline:
```
## Overview
## Policy Files
## Policy Compiler
## Adding a Policy
```

---

## Detecting When README is Too Big

The `doc_structure_analyzer.py` script flags README as `BLOATED` when:
1. Line count > 200, AND
2. At least one section has a matching `docs/` file that doesn't exist yet

The `EXTRACTABLE` status means sections are present but README isn't over threshold yet — worth noting but not urgent.

---

## Extraction Process

When extracting a section from README to docs/:

1. Identify the target section heading and its body in `README.md`
2. Create `docs/X.md` with `validate_doc.py --generate`
3. Move the section content into the new file
4. Replace the original README section with:
   ```markdown
   See [docs/X.md](docs/X.md) for the full reference.
   ```
5. Run `validate_doc.py docs/X.md` to confirm schema
