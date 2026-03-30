#!/usr/bin/env python3
"""
Scaffolder for creating-service-skills.

Phase 1 of the two-phase workflow: generates a structural skeleton for a new
service skill by parsing docker-compose.yml, Dockerfiles, and dependency files.
The skeleton contains [PENDING RESEARCH] markers for the agent to fill in Phase 2.

Output location: .claude/skills/<service-id>/
"""

import sys
from pathlib import Path

# Resolve bootstrap from this script's directory
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from bootstrap import RootResolutionError, get_project_root, register_service  # noqa: E402

# ---------------------------------------------------------------------------
# Official documentation map — populated from detected technologies
# ---------------------------------------------------------------------------
OFFICIAL_DOCS: dict[str, tuple[str, str]] = {
    # Docker images / databases
    "postgres": ("PostgreSQL", "https://www.postgresql.org/docs/"),
    "timescale": ("TimescaleDB", "https://docs.timescale.com/"),
    "timescaledb": ("TimescaleDB", "https://docs.timescale.com/"),
    "redis": ("Redis", "https://redis.io/docs/"),
    "mysql": ("MySQL", "https://dev.mysql.com/doc/"),
    "mongodb": ("MongoDB", "https://www.mongodb.com/docs/"),
    "mongo": ("MongoDB", "https://www.mongodb.com/docs/"),
    "elasticsearch": ("Elasticsearch", "https://www.elastic.co/guide/"),
    "rabbitmq": ("RabbitMQ", "https://www.rabbitmq.com/documentation.html"),
    "kafka": ("Apache Kafka", "https://kafka.apache.org/documentation/"),
    "clickhouse": ("ClickHouse", "https://clickhouse.com/docs/"),
    # Python packages
    "fastapi": ("FastAPI", "https://fastapi.tiangolo.com/"),
    "flask": ("Flask", "https://flask.palletsprojects.com/"),
    "django": ("Django", "https://docs.djangoproject.com/"),
    "sqlalchemy": ("SQLAlchemy", "https://docs.sqlalchemy.org/"),
    "alembic": ("Alembic", "https://alembic.sqlalchemy.org/en/latest/"),
    "prisma": ("Prisma", "https://www.prisma.io/docs/"),
    "celery": ("Celery", "https://docs.celeryq.dev/"),
    "pydantic": ("Pydantic", "https://docs.pydantic.dev/"),
    "asyncpg": ("asyncpg", "https://magicstack.github.io/asyncpg/"),
    "psycopg2": ("psycopg2", "https://www.psycopg.org/docs/"),
    "psycopg": ("psycopg3", "https://www.psycopg.org/psycopg3/docs/"),
    "aiohttp": ("aiohttp", "https://docs.aiohttp.org/"),
    "httpx": ("HTTPX", "https://www.python-httpx.org/"),
}


def scaffold_service_skill(service_id: str, compose_data: dict) -> Path:
    """
    Main entry point for Phase 1 scaffolding.
    """
    try:
        project_root = get_project_root()
    except RootResolutionError as e:
        print(f"Error: {e}")
        sys.exit(1)

    skill_dir = Path(project_root) / ".claude" / "skills" / service_id
    if skill_dir.exists():
        print(f"Skill directory already exists: {skill_dir}")
        print("Aborting to prevent overwriting. Delete it manually if you want to re-scaffold.")
        sys.exit(1)

    print(f"Scaffolding new service skill: {service_id}")
    print(f"Target directory: {skill_dir}")

    skill_dir.mkdir(parents=True)
    (skill_dir / "scripts").mkdir()
    (skill_dir / "references").mkdir()
    (skill_dir / "assets").mkdir()

    # Detect service details from compose
    service_config = compose_data.get("services", {}).get(service_id, {})

    # 1. Generate SKILL.md
    write_skill_md(service_id, service_config, skill_dir)

    # 2. Generate script stubs
    write_script_stubs(service_id, skill_dir)

    # 3. Generate reference stubs
    write_reference_stubs(service_id, skill_dir)

    # 4. Register service in bootstrap state
    # [TODO] Fill in territory and name properly
    register_service(
        service_id, service_id, [], str((skill_dir / "SKILL.md").relative_to(project_root))
    )

    print(f"\n✅ Phase 1 Complete for {service_id}")
    print("Next step: Run Phase 2 deep dive for this service.")
    return skill_dir


def write_skill_md(service_id: str, config: dict, skill_dir: Path) -> None:
    """Generate the root SKILL.md file."""
    name = service_id.replace("-", " ").replace("_", " ").title()
    persona = f"{name} Expert"

    # Detect docs to link
    docs_section = ""
    # [PENDING] Implement documentation auto-detection logic here

    content = f"""---
name: {service_id}
description: >-
  [PENDING RESEARCH] Specialized knowledge for the {name} service.
  Use when debugging, analyzing performance, or understanding this service.
allowed-tools: Bash(python3 *), Read, Grep, Glob
---

# {name}

## Service Overview

[PENDING RESEARCH] Describe what this service does, its role in the system,
and whether it runs continuously, as a one-shot job, or on a schedule.

**Persona**: {persona}

## Architecture

[PENDING RESEARCH]

**Entry Point**: [Verify in Dockerfile CMD and docker-compose `command:` field]
**Container Name**: {service_id}
**Restart Policy**: [PENDING RESEARCH]

**Primary Modules**:
- [PENDING RESEARCH] List key modules after reading the source tree

**Dependencies**: [PENDING RESEARCH] PostgreSQL? Redis? External APIs?

## ⚠️ CRITICAL REQUIREMENTS

[PENDING RESEARCH] Add any mandatory patterns, initialization calls, or
invariants that must not be violated when modifying this service.

## Data Flows

[PENDING RESEARCH] Trace the primary data paths through the service.

## Database Interactions

[PENDING RESEARCH]

| Table | Operation | Timestamp Column | Stale Threshold |
|-------|-----------|-----------------|-----------------|
| [table] | INSERT/SELECT | [col] | [N min] |

## Common Operations

### Service Management

```bash
# Start the service
docker compose up -d {service_id}

# Check logs
docker logs {service_id} --tail 50

# Restart
docker compose restart {service_id}
```

### Data Inspection

- **Health check**: `python3 .claude/skills/{service_id}/scripts/health_probe.py`
- **Log analysis**: `python3 .claude/skills/{service_id}/scripts/log_hunter.py`
- **Data explorer**: `python3 .claude/skills/{service_id}/scripts/data_explorer.py`

## Troubleshooting Guide

[PENDING RESEARCH] Fill from exception handlers and code comments.

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| [what you see] | [root cause] | [exact command to fix] |

Minimum 5 rows required.

<!-- SEMANTIC_START -->
## Semantic Deep Dive (Human/Agent Refined)

[PENDING RESEARCH] Add deep operational knowledge after Phase 2 deep dive.

<!-- SEMANTIC_END -->

## Scripts

- `scripts/health_probe.py` — Container status + table freshness check
- `scripts/log_hunter.py` — Service-specific log pattern analysis
- `scripts/data_explorer.py` — Safe database inspection (read-only)

## References
{docs_section}
- `references/deep_dive.md` — Detailed Phase 2 research notes
- `references/architecture_ssot.md` — Architecture SSOT (link from project SSOT if available)

---

*Generated by creating-service-skills Phase 1. Run Phase 2 to fill [PENDING RESEARCH] markers.*
"""  # nosec B608
    (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")


def write_script_stubs(service_id: str, skill_dir: Path) -> None:
    """
    Write Phase 1 script stubs into the skill's scripts/ directory.
    """
    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    # health_probe.py stub (using replace to avoid f-string escaping hell)
    health_probe_tpl = '''#!/usr/bin/env python3
"""Health probe for {{SERVICE_ID}}.

[PENDING RESEARCH] Replace all [FILL] markers during Phase 2 deep dive.
"""
import json
import subprocess
import sys

CONTAINER = "{{SERVICE_ID}}"
# [PENDING RESEARCH] Set the actual external-mapped DB port (e.g. 5433 for host, 5432 for container)
DB_PORT = 5433
# [PENDING RESEARCH] Set the actual output table(s) and stale thresholds in minutes
STALE_CHECKS: list[dict] = [
    # {"table": "table_name", "ts_col": "created_at", "stale_minutes": 10},
]


def check_container() -> bool:
    result = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER],
        capture_output=True, text=True
    )
    running = result.stdout.strip() == "true"
    print(f"Container {CONTAINER}: {'RUNNING' if running else 'STOPPED'}")
    return running


def check_table_freshness() -> bool:
    """[PENDING RESEARCH] Query actual output tables with correct stale thresholds."""
    if not STALE_CHECKS:
        print("Table freshness: NOT CONFIGURED (Phase 2 required)")
        return True
    # [PENDING RESEARCH] Implement actual DB checks here
    return True


def main(as_json: bool = False) -> None:
    ok = check_container()
    ok &= check_table_freshness()
    if as_json:
        print(json.dumps({"healthy": ok, "service": CONTAINER}))
    else:
        print(f"\\nOverall: {'HEALTHY' if ok else 'UNHEALTHY'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    main(as_json=args.json)
'''
    (scripts_dir / "health_probe.py").write_text(
        health_probe_tpl.replace("{{SERVICE_ID}}", service_id), encoding="utf-8"
    )

    # log_hunter.py stub
    log_hunter_tpl = '''#!/usr/bin/env python3
"""Log hunter for {{SERVICE_ID}}.

[PENDING RESEARCH] Replace generic patterns with actual error strings
found in the codebase exception handlers during Phase 2 deep dive.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict

CONTAINER = "{{SERVICE_ID}}"

# [PENDING RESEARCH] Replace with patterns sourced from the actual codebase.
# Find them with: search_for_pattern("logger.error|raise|panic!")
PATTERNS: list[tuple[str, str, str]] = [
    ("ConnectionError", "ERROR", "Database or Redis connectivity issue"),
    ("TimeoutError", "WARNING", "External service latency detected"),
]


def hunt_logs(tail: int = 200) -> dict:
    """Tails logs and matches against patterns."""
    result = subprocess.run(
        ["docker", "logs", "--tail", str(tail), CONTAINER],
        capture_output=True, text=True
    )
    logs = result.stdout + result.stderr
    matches = defaultdict(int)

    for line in logs.splitlines():
        for pattern, level, desc in PATTERNS:
            if pattern in line:
                matches[pattern] += 1

    return dict(matches)


def main() -> None:
    results = hunt_logs()
    print(f"Log anomalies for {CONTAINER}:")
    if not results:
        print("  ✓ No known error patterns detected in recent logs.")
    else:
        for p, count in results.items():
            print(f"  - {p}: {count} occurrences")


if __name__ == "__main__":
    main()
'''
    (scripts_dir / "log_hunter.py").write_text(
        log_hunter_tpl.replace("{{SERVICE_ID}}", service_id), encoding="utf-8"
    )

    # data_explorer.py stub
    data_explorer_tpl = '''#!/usr/bin/env python3
"""Data explorer for {{SERVICE_ID}} — read-only DB inspection.

[PENDING RESEARCH] Fill in actual table names, columns, and host port
during Phase 2 deep dive. All queries must use parameterized %s placeholders.
"""
import json
import sys

# [PENDING RESEARCH] Set the actual table and connection settings
TABLE = "[PENDING RESEARCH]"
DB_HOST = "localhost"
DB_PORT = 5433  # [PENDING RESEARCH] external mapped port, not container-internal
DB_NAME = "[PENDING RESEARCH]"
DB_USER = "postgres"


def recent_rows(limit: int = 20, as_json: bool = False) -> None:
    """[PENDING RESEARCH] Query most recent rows from the output table."""
    print(f"[PENDING RESEARCH] Implement: SELECT * FROM {TABLE} ORDER BY created_at DESC LIMIT %s")
    print("Use parameterized queries only — no f-strings in SQL.")


def main() -> None:
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    recent_rows(args.limit, args.json)


if __name__ == "__main__":
    main()
'''
    (scripts_dir / "data_explorer.py").write_text(
        data_explorer_tpl.replace("{{SERVICE_ID}}", service_id), encoding="utf-8"
    )

    # Makefile — standard diagnostic runner for every skill
    makefile_tpl = """# Skill diagnostic scripts for {{SERVICE_ID}}
# Usage: make <target>   (from this directory)
# Override python: make health PYTHON=/path/to/python3

# Auto-detect: prefer project venv (4 levels up), fall back to system python3
_VENV := $(wildcard ../../../../venv/bin/python3)
PYTHON ?= $(if $(_VENV),../../../../venv/bin/python3,python3)

.PHONY: health health-json data data-json logs errors db help

help:
\t@echo "Available targets:"
\t@echo "  health      - Run health probe (human readable)"
\t@echo "  health-json - Run health probe (JSON output)"
\t@echo "  data        - Show latest DB records"
\t@echo "  data-json   - Show latest DB records (JSON, limit 5)"
\t@echo "  logs        - Tail and analyze recent logs"
\t@echo "  errors      - Show errors/criticals only"
\t@echo "  db          - Run DB helper example queries"
\t@echo ""
\t@echo "Python: $(PYTHON)"

health:
\t$(PYTHON) health_probe.py

health-json:
\t$(PYTHON) health_probe.py --json

data:
\t$(PYTHON) data_explorer.py

data-json:
\t$(PYTHON) data_explorer.py --json --limit 5

logs:
\t$(PYTHON) log_hunter.py --tail 50

errors:
\t$(PYTHON) log_hunter.py --errors-only --tail 50

db:
\t$(PYTHON) db_helper.py
"""
    (scripts_dir / "Makefile").write_text(
        makefile_tpl.replace("{{SERVICE_ID}}", service_id), encoding="utf-8"
    )


def write_reference_stubs(service_id: str, skill_dir: Path) -> None:
    """Generate reference markdown files."""
    name = service_id.replace("-", " ").replace("_", " ").title()

    # deep_dive.md
    (skill_dir / "references" / "deep_dive.md").write_text(
        f"""# Phase 2 Research: {name}

## Source Analysis
- **Entry Point**: [FILL]
- **Main Loop**: [FILL]
- **Error Handlers**: [FILL]

## Logic Trace
1. [Step 1]
2. [Step 2]

## Invariants
- [Must always X]
- [Must never Y]
""",
        encoding="utf-8",
    )

    # architecture_ssot.md (stub)
    (skill_dir / "references" / "architecture_ssot.md").write_text(
        f"""# {name} Architecture

[PENDING RESEARCH] Replace with link to project-level SSOT if exists,
otherwise document high-level components here.
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    import yaml

    if len(sys.argv) < 2:
        print("Usage: scaffolder.py <docker-compose-path> [service-id]")
        sys.exit(1)

    compose_path = Path(sys.argv[1])
    if not compose_path.exists():
        print(f"Compose file not found: {compose_path}")
        sys.exit(1)

    with open(compose_path) as f:
        data = yaml.safe_load(f)

    if len(sys.argv) > 2:
        # Scaffold specific service
        sid = sys.argv[2]
        scaffold_service_skill(sid, data)
    else:
        # Scaffold all services in compose
        for sid in data.get("services", {}).keys():
            scaffold_service_skill(sid, data)
