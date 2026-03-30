---
name: creating-service-skills
description: >-
  Generate operational service skill packages for any service in the project.
  Produces SKILL.md documentation, diagnostic scripts, and references through a
  mandatory two-phase workflow. Use when onboarding to a new service, adding a
  new skill, or when a skill is missing from the catalog.
allowed-tools: Bash(python3 *), Read, Grep, Glob
---

# Creating Service Skills

## Role: The Architect

You are the **Service Skills Architect**. Your job is to produce complete, operational
skill packages for project services — not stubs, not placeholders. The output must be
immediately useful to any agent working on the service.

---

## Mandatory Two-Phase Workflow

**Use both phases every time.** Phase 1 gives structure; Phase 2 grounds the skill in real service behavior.

---

### Phase 1: Automated Skeleton (Always First)

Run the scaffolder to build a structural skeleton from static analysis of
`docker-compose*.yml`, `Dockerfile`, and dependency files. It also detects
technologies and auto-populates official documentation links.

```bash
# Create a skeleton for a service
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/creating-service-skills/scripts/scaffolder.py" \
  create <service-id> <territory-path> "<description>"

# Example
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/creating-service-skills/scripts/scaffolder.py" \
  create auth-service src/auth/ "JWT authentication and session management"
```

The skeleton creates at `.claude/skills/<service-id>/`:
- `SKILL.md` with `[PENDING RESEARCH]` markers
- `scripts/health_probe.py` stub
- `scripts/log_hunter.py` stub
- `scripts/data_explorer.py` stub
- `references/deep_dive.md` research checklist

**The skeleton is never sufficient.** It has structural facts but no semantic knowledge.

Classify the service type to determine which specialist script to add:

```bash
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/creating-service-skills/scripts/deep_dive.py" \
  classify <territory-path>
```

Print the full Phase 2 research agenda:

```bash
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/creating-service-skills/scripts/deep_dive.py" \
  questions <service-type>
```

---

### Phase 2: Agentic Deep Dive

After the skeleton exists, answer every research question by reading the actual
source code. Use **Serena LSP tools exclusively** — never read entire files.

#### Serena Tool Protocol for Deep Dive

| What you need to find | Serena tool to use |
|---|---|
| Module/class structure | `get_symbols_overview(relative_path, depth=1)` |
| Body of a specific function | `find_symbol(name_path, include_body=True)` |
| Log/error message strings | `search_for_pattern("logger.error|raise|except")` |
| All SQL queries | `search_for_pattern("SELECT|INSERT|UPDATE|COPY")` |
| Env var usage | `search_for_pattern("os.getenv|os.environ|settings\\.")` |
| Data flow (who calls what) | `find_referencing_symbols(name_path, relative_path)` |
| Entry point detection | `search_for_pattern('if __name__|def main|async def main')` |
| Docker port mapping | `search_for_pattern("ports:|DB_PORT|POSTGRES_PORT")` |
| **Actual table names** | `execute_db_query("SELECT tablename FROM pg_tables WHERE schemaname='public'")` |
| **Actual column names** | `execute_db_query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='X'")` |

**Do NOT read entire files.** Map first → read only the symbols you need.

#### Required Research Sections

**Container & Runtime**
- Exact entry point (Dockerfile CMD + docker-compose `command:`)
- Critical env vars that crash the service if missing (no default)
- Volumes read from / written to
- Service type: daemon / one-shot / cron?
- Restart policy and `depends_on:` conditions

**Data Layer** — verify ALL of these against the live DB before writing any scripts:
- Run `SELECT tablename FROM pg_tables WHERE schemaname='public'` → get exact table list
- For each output table: run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<table>'` → get exact column names
- Confirm which tables have a timestamp column and which do not (use `COUNT(*)` freshness check for tables with no timestamp)
- Which tables does it WRITE vs. only READ?
- Realistic stale threshold per table (in minutes)
- Redis/S3/file state usage
- SQL parameterization: flag any f-string SQL

**Failure Modes** — build this table with ≥5 rows from real exception handlers:

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| (log output) | (root cause) | (exact fix command) |

**Log Patterns** — source from actual codebase, not invented:
- `search_for_pattern("logger.info|logging.info")` → `info` patterns
- `search_for_pattern("logger.error|logger.warning")` → `error/warning`
- `search_for_pattern("logger.critical|panic!")` → `critical`

---

### Phase 2 Script Writing (Complete Implementation)

After research is complete, replace all `[PENDING RESEARCH]` stubs in `scripts/`.
Scripts should be ready to run end-to-end, without TODO markers or placeholder SQL.

#### Mandatory DB Connection Pattern (all scripts that touch the DB)

```python
from dotenv import load_dotenv
from pathlib import Path
import sys

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
env_file = project_root / ".env"
if env_file.exists():
    load_dotenv(str(env_file))

sys.path.insert(0, str(project_root))
from shared.db_pool_manager import execute_db_query
```

Never use raw `psycopg2` or hardcoded credentials. Always use `execute_db_query` from
`shared.db_pool_manager`. The `.env` load is mandatory — scripts without it will fail
when the environment is clean.

#### Script Integrity Rules

1. **Schema first** — query `information_schema` before writing any SQL. Never guess table or column names.
2. **Every `try` has an `except`** — incomplete try/except blocks crash silently. Every DB call must be wrapped with a matching except that captures the error into the result.
3. **Function names match call sites** — after renaming any function, search for all call sites and update them.
4. **`qwen -y` for delegation** — when delegating Phase 2 to Qwen, always pass the `-y` flag (YOLO/non-interactive mode) otherwise Qwen will research but never write files.
5. **No `ccs gemini`** — Gemini is invoked as `gemini -p "..."` directly; GLM is `env -u CLAUDECODE ccs glm -p "..."`; Qwen is `qwen -y "..."`.
6. **`venv/bin/python3` for testing** — diagnostic scripts must be tested with the project venv, not system python, which may lack `dotenv` and other deps.

#### `scripts/health_probe.py`

Required features:
- `check_container()`: `docker inspect -f {{.State.Running}} <container>`
- `check_table_freshness()`: `SELECT MAX(<ts_col>) FROM <table>` — compare vs stale threshold
- Use **external mapped port** (e.g. 5433 for host), NOT container-internal port (5432)
- Print exact fix command on failure: `docker compose restart <service>` or SQL correction
- Support `--json` flag for machine-readable output

```python
STALE_CHECKS = [
    {"table": "actual_table", "ts_col": "created_at", "stale_minutes": 10},
]
DB_PORT = 5433  # external mapped port — verify in docker-compose.yml
```

#### `scripts/log_hunter.py`

Required features:
- PATTERNS list sourced from actual codebase error strings (not generic names)
- Severity bucketing: `critical → error → warning → info`
- `--tail N`, `--since <time>`, `--errors-only`, `--json` flags
- Print specific fix command when critical pattern detected

```python
# RIGHT — from actual codebase
PATTERNS = [
    ("OAuth expired", r"invalid_grant|token.*expired", "critical"),
    ("PDF parse error", r"PdfReadError|pdf.*format.*changed", "error"),
    ("Report saved", r"report.*ingested|saved.*DB", "info"),
]
# WRONG — never use generic patterns
PATTERNS = [("Error", r"ERROR|Exception|ConnectionError", "error")]
```

#### `scripts/data_explorer.py`

Required features:
- Real table name, correct external DB_PORT
- All queries parameterized: `WHERE symbol = %s` (never f-strings in SQL)
- `--limit`, `--json`, `--symbol` flags
- Read-only: no INSERT/UPDATE/DELETE

#### Specialist Script (based on service type)

| Service Type | Script | Core Logic |
|---|---|---|
| `continuous_db_writer` | `data_explorer.py` | DISTINCT ON latest-per-symbol |
| `http_api_server` | `endpoint_tester.py` | Probe real routes, check response codes |
| `one_shot_migration` | `coverage_checker.py` | Verify expected schema/table exists |
| `file_watcher` | `state_inspector.py` | Mount accessible + state file present |
| `scheduled_poller` | `auth_checker.py` | Token file present + not expired |

See [references/script_quality_standards.md](references/script_quality_standards.md) for complete templates.

#### `scripts/Makefile` (required)

The scaffolder creates a stub `Makefile` in Phase 1. In Phase 2, verify it is
correct and complete because it is the primary entry point for diagnostics.

**Standard template** (copy verbatim, replace `<service-id>` comment only):

```makefile
# Skill diagnostic scripts for <service-id>
# Usage: make <target>   (from this directory)
# Override python: make health PYTHON=/path/to/python3

# Auto-detect: prefer project venv (4 levels up), fall back to system python3
_VENV := $(wildcard ../../../../venv/bin/python3)
PYTHON ?= $(if $(_VENV),../../../../venv/bin/python3,python3)

.PHONY: health health-json data data-json logs errors db help

help:
	@echo "Available targets:"
	@echo "  health      - Run health probe (human readable)"
	@echo "  health-json - Run health probe (JSON output)"
	@echo "  data        - Show latest DB records"
	@echo "  data-json   - Show latest DB records (JSON, limit 5)"
	@echo "  logs        - Tail and analyze recent logs"
	@echo "  errors      - Show errors/criticals only"
	@echo "  db          - Run DB helper example queries"
	@echo ""
	@echo "Python: $(PYTHON)"

health:
	$(PYTHON) health_probe.py

health-json:
	$(PYTHON) health_probe.py --json

data:
	$(PYTHON) data_explorer.py

data-json:
	$(PYTHON) data_explorer.py --json --limit 5

logs:
	$(PYTHON) log_hunter.py --tail 50

errors:
	$(PYTHON) log_hunter.py --errors-only --tail 50

db:
	$(PYTHON) db_helper.py
```

**Rules for the delegated Phase 2 agent:**

1. **Keep standard targets stable** — avoid removing or renaming them because downstream workflows depend on them.
2. **Add service-specific targets** below the standard block if the service needs them (e.g. `make auth`, `make schema`, `make backfill`).
3. **Keep the `_VENV` auto-detect path (`../../../../venv/bin/python3`) unchanged** — it resolves from `scripts/` → service dir → `skills/` → `.claude/` → project root → `venv/`.
4. **Use real tab characters in recipe lines** so Makefile parsing works consistently.
5. **Run `make help` after updates** and confirm the Python path resolves to the project venv.

---

## Official Documentation Auto-Population

The scaffolder detects technologies from:
- `docker-compose*.yml` image tags
- `requirements.txt` / `pyproject.toml` package names
- `Cargo.toml` crate names
- `package.json` dependencies

And automatically adds relevant official documentation links to the `## References`
section of the generated SKILL.md. Verify these links are correct during Phase 2.

---

## Phase 3: Hook Registration (After Phase 2)

Once the skill is complete, verify that the `PreToolUse` skill activator hook is
wired in the project's `.claude/settings.json`. It should already be there if
you ran `install-service-skills.py` — but confirm it, and explain it to the user.

### What the hook does

The `skill_activator.py` hook fires **before** any `Read`, `Write`, `Edit`, `Grep`,
`Glob`, or `Bash` operation. It checks whether the operation touches a registered
service territory (from `service-registry.json`). If it does, it injects:

```
[Service Skill] You are about to work with the '<service-id>' service territory.
  Load the expert skill before proceeding: Read .claude/skills/<service-id>/SKILL.md
  The skill contains: operational knowledge, failure modes, diagnostic scripts,
  and the correct methods for managing this service.
  Do not use ad-hoc approaches (raw SQL, improvised docker commands) when the
  skill defines the correct method.
```

This means: from the moment the skill is registered, Claude will **automatically**
be reminded to load and apply it whenever working on relevant files or running
commands that mention the service — without you having to ask.

### Verify hook is active

Check `.claude/settings.json` contains a `PreToolUse` entry:

```json
"PreToolUse": [{
  "matcher": "Read|Write|Edit|Glob|Grep|Bash",
  "hooks": [{"type": "command",
    "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/skills/using-service-skills/scripts/skill_activator.py\""}]
}]
```

If missing, run the installer again or add it manually.

### Verify the service is registered

```bash
python3 .claude/skills/using-service-skills/scripts/cataloger.py
```

The service should appear in the output catalog. If not, the territory may not
be registered in `service-registry.json` — re-run the scaffolder for Phase 1.

### Communicate to the user

After completing Phase 3, confirm:

```
✅ Hook registered: '<service-id>' skill is now auto-activated.

Whenever you (or I) work with files in <territory> or run commands mentioning
'<service-id>', I will automatically load .claude/skills/<service-id>/SKILL.md
and apply its expert knowledge — including using the correct diagnostic scripts
instead of ad-hoc queries.
```

---

## Skill Completion Checklist

A skill is **complete** (not a draft) when ALL of these are true:

**Schema verification (before writing any script):**
- [ ] `SELECT tablename FROM pg_tables WHERE schemaname='public'` run — real table names confirmed
- [ ] `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='X'` run per output table
- [ ] Tables with no timestamp column identified — `COUNT(*)` used for freshness check instead

**Script completeness:**
- [ ] No `[PENDING RESEARCH]` markers remain in SKILL.md
- [ ] Service type classified and documented
- [ ] All scripts use mandatory DB connection pattern (`dotenv` + `shared.db_pool_manager`)
- [ ] `health_probe.py`: real container check + actual table freshness + fix commands; every `try` has `except`
- [ ] `log_hunter.py`: patterns sourced from codebase, not invented; severity bucketed
- [ ] `data_explorer.py`: real table + real column names + parameterized SQL
- [ ] `db_helper.py`: example queries against real tables with correct column names
- [ ] At least one specialist script for the service type
- [ ] All function names consistent between definition and call sites
- [ ] Troubleshooting table has ≥5 rows from real failure modes
- [ ] All docker compose commands verified against actual config
- [ ] All scripts support `--json` flag
- [ ] `scripts/Makefile` generated with standard targets: `health`, `health-json`, `data`, `data-json`, `logs`, `errors`, `db`
- [ ] Scripts tested with `venv/bin/python3` (not system python3) — 0 import errors

**Registration:**
- [ ] `references/deep_dive.md` Phase 2 checklist completed
- [ ] Official docs links in References section verified
- [ ] Service registered in `.claude/skills/service-registry.json`
- [ ] `PreToolUse` skill activator hook confirmed in `.claude/settings.json`
- [ ] User informed: skill auto-activates on territory file access and service-name commands

---

## Output Format

After successful completion:

```
✅ Created expert skill: `<service-id>`

**Classification**: <service-type> (confidence: high/medium/low)
**Territory**: <file patterns>
**Specialist Script**: <script-name.py>
**Health Strategy**: <strategy>
**Skill Path**: `.claude/skills/<service-id>/SKILL.md`
**Official Docs**: <detected technologies>

**Phase 2 Status**: Complete
- [PENDING RESEARCH] markers: 0
- Scripts implemented: health_probe.py, log_hunter.py, data_explorer.py, <specialist>.py

**Phase 3 Status**: Hook registered
- PreToolUse activator: confirmed in settings.json
- Auto-activation: triggers on territory files + service name in commands

⚠️  If Phase 2 is incomplete, the skill is NOT ready for use.
⚠️  If Phase 3 is skipped, the skill exists but will not enforce itself.
```

---

## Tool Restrictions

Write to:
- ✅ `.claude/skills/<service-id>/` (new skill packages)
- ✅ `.claude/skills/service-registry.json` (registration)

Do not:
- ❌ Modify source code outside `.claude/skills/`
- ❌ Delete existing skills or registry entries

---

## References

- [references/script_quality_standards.md](references/script_quality_standards.md) — Script templates and anti-patterns
- [references/service_skill_system_guide.md](references/service_skill_system_guide.md) — System architecture
- `scripts/scaffolder.py` — Phase 1 skeleton generator with official docs detection
- `scripts/deep_dive.py` — Service classifier + Phase 2 research agenda
- `scripts/bootstrap.py` — Registry CRUD and path resolution utilities

## Related Skills

- `/using-service-skills` — Discover and activate expert personas at session start
- `/updating-service-skills` — Sync skills when implementation drifts
