#!/usr/bin/env python3
"""
Phase 2 deep dive analyzer for creating-service-skills.

Generates structured research questions and classifies service types.
The agent answers every question using Serena LSP tools against the real source.

Usage:
  python3 deep_dive.py classify <territory-path>
  python3 deep_dive.py questions <service-type> <territory-path>
  python3 deep_dive.py template
"""

import sys
from pathlib import Path

script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))


# ---------------------------------------------------------------------------
# Service type classification
# ---------------------------------------------------------------------------
SERVICE_TYPES: dict[str, dict] = {
    "continuous_db_writer": {
        "patterns": ["insert", "update", "upsert", "execute", "copy_records"],
        "indicators": ["timescaledb", "postgres", "asyncpg", "psycopg", "sqlalchemy"],
        "script": "data_explorer.py",
        "health": "table_freshness + row_count",
    },
    "http_api_server": {
        "patterns": ["route", "endpoint", "handler", "router", "@app.get", "@app.post"],
        "indicators": ["fastapi", "flask", "express", "aiohttp", "uvicorn"],
        "script": "endpoint_tester.py",
        "health": "http_probe (real routes, not just /health)",
    },
    "one_shot_migration": {
        "patterns": ["migrate", "alembic", "upgrade", "seed", "backfill", "--init"],
        "indicators": ["alembic", "prisma migrate", "flyway"],
        "script": "coverage_checker.py",
        "health": "exit_code + expected schema presence",
    },
    "file_watcher": {
        "patterns": ["inotify", "watchdog", "watch", "chokidar", "fsevents"],
        "indicators": ["inotify", "watchdog", "notify"],
        "script": "state_inspector.py",
        "health": "mount_path_accessible + state_file_present + db_recency",
    },
    "scheduled_poller": {
        "patterns": ["schedule", "interval", "cron", "sleep", "asyncio.sleep"],
        "indicators": ["apscheduler", "celery", "rq", "dramatiq"],
        "script": "service_specific.py",
        "health": "token_presence + last_run_recency",
    },
}


def classify_service(directory: Path) -> dict:
    """Classify a service by scanning source files for type indicators."""
    if not directory.exists():
        return {"error": f"Directory not found: {directory}"}

    source_files = (
        list(directory.rglob("*.py"))
        + list(directory.rglob("*.ts"))
        + list(directory.rglob("*.rs"))
        + list(directory.rglob("*.go"))
    )

    if not source_files:
        return {"error": "No source files found in territory"}

    scores: dict[str, int] = {}

    for file_path in source_files[:30]:
        try:
            content = file_path.read_text(encoding="utf-8").lower()
            for stype, cfg in SERVICE_TYPES.items():
                for p in cfg["patterns"]:
                    if p in content:
                        scores[stype] = scores.get(stype, 0) + 2
                for ind in cfg["indicators"]:
                    if ind in content:
                        scores[stype] = scores.get(stype, 0) + 1
        except (OSError, UnicodeDecodeError):
            continue

    if not scores:
        return {"type": "unknown", "confidence": "low", "scores": {}}

    primary = max(scores, key=lambda k: scores[k])
    score = scores[primary]
    confidence = "high" if score >= 6 else "medium" if score >= 3 else "low"
    cfg = SERVICE_TYPES[primary]

    return {
        "type": primary,
        "confidence": confidence,
        "score": score,
        "all_scores": scores,
        "recommended_script": cfg["script"],
        "health_strategy": cfg["health"],
    }


def print_deep_dive_questions(service_type: str) -> None:
    """
    Print the full Phase 2 research agenda for the given service type.

    The agent answers every question using Serena LSP tools — NOT raw file reads.
    """
    print(
        f"""
=== Phase 2 Deep Dive: {service_type} ===

IMPORTANT — Use Serena LSP tools for all code exploration:

  | Task                       | Tool                                               |
  |----------------------------|----------------------------------------------------|
  | Map module structure       | get_symbols_overview(depth=1)                      |
  | Read a specific function   | find_symbol(name_path, include_body=True)          |
  | Find log/error patterns    | search_for_pattern("logger.error|raise|except")    |
  | Find SQL queries           | search_for_pattern("SELECT|INSERT|UPDATE|COPY")    |
  | Trace data flow            | find_referencing_symbols(name_path, relative_path) |
  | Find env var usage         | search_for_pattern("os.getenv|os.environ")         |

Do NOT read entire files. Map first, then read only what you need.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: Container & Runtime
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. What is the exact entry point?
   → Read docker-compose.yml `command:` field and Dockerfile CMD.
   → Verify with: search_for_pattern("if __name__|def main|async def main")

2. Which env vars will crash the service if missing?
   → search_for_pattern("os.getenv|os.environ") and check which ones have no default.

3. What volumes does it mount (read/write)?
   → Check docker-compose.yml `volumes:` section.

4. Is this a daemon, one-shot job, or cron?
   → Check `restart:` policy in docker-compose.yml.
   → Look for `while True`, `asyncio.sleep`, `--bootstrap` flags.

5. Does it depend on another service being healthy first?
   → Check `depends_on:` with `condition: service_healthy`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: Data Layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. Which tables does it WRITE? Which does it only READ?
   → search_for_pattern("INSERT INTO|COPY.*FROM|UPDATE.*SET|execute.*INSERT")
   → Cross-check with search_for_pattern("SELECT.*FROM") for read-only tables.

7. What is the timestamp column for each output table?
   → search_for_pattern("created_at|snapshot_ts|asof_ts|received_at|timestamp")

8. What is a realistic stale threshold per output table?
   → How often does the service write? (Check sleep intervals, cron schedule.)
   → Stale threshold = 3x the write interval minimum.

9. Does it use Redis, S3, files, or other external state?
   → search_for_pattern("redis|s3|boto|aiofiles|open(")

10. Are all SQL queries parameterized?
    → search_for_pattern("f\\".*SELECT|f'.*INSERT|%s|\\$1|bindparams")
    → Flag any f-string SQL as a security issue.
"""
    )

    if service_type == "continuous_db_writer":
        print(
            """━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 (continuous_db_writer): Write Patterns
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. Is it bulk INSERT or row-by-row?
    → search_for_pattern("executemany|copy_records_to_table|insert_many")
12. How does it handle duplicate keys?
    → search_for_pattern("ON CONFLICT|upsert|INSERT OR REPLACE")
13. Expected row growth rate (rows/hour)?
    → Estimate from sleep intervals × data volume.
"""
        )

    elif service_type == "http_api_server":
        print(
            """━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 (http_api_server): API Endpoints
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. List ALL real routes (not just /health).
    → get_symbols_overview on router files, then find_symbol for each route handler.
12. Which routes require authentication?
    → search_for_pattern("Depends|require_auth|Authorization|Bearer")
13. Expected response times per endpoint?
    → Check for timeouts, DB queries, external calls in each handler.
"""
        )

    elif service_type == "file_watcher":
        print(
            """━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 (file_watcher): File Monitoring
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. What mount paths does it monitor?
    → Check docker-compose.yml `volumes:` and search_for_pattern("WATCH_PATH|MOUNT_DIR")
12. What is the state file format and location?
    → search_for_pattern("state_file|checkpoint|last_processed|cursor")
13. What happens when the mount becomes unavailable?
    → search_for_pattern("except.*OSError|mount.*error|inotify.*limit")
"""
        )

    print(
        """━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: Failure Modes (required ≥5 rows)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each failure mode, find the exact fix command.

→ search_for_pattern("except|raise|logger.error|logger.critical|panic!")
→ Read each exception handler with find_symbol(include_body=True)
→ Build the Troubleshooting table in SKILL.md from these real cases.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5: Log Patterns (for log_hunter.py)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Find real patterns — do NOT invent generic ones like "ERROR" or "ConnectionError".

→ search_for_pattern("logger.info|logging.info") → info patterns
→ search_for_pattern("logger.warning|logger.error") → error/warning patterns
→ search_for_pattern("logger.critical|raise.*Error|panic!") → critical patterns
→ For Rust: search_for_pattern("thread '.*' panicked")

Copy the actual error message strings verbatim into log_hunter.py PATTERNS list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6: Write Phase 2 Scripts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Now replace ALL [PENDING RESEARCH] stubs in scripts/:

  scripts/health_probe.py
    - Replace STALE_CHECKS with actual table names + timestamp cols + thresholds
    - Use external mapped port (e.g. 5433), NOT container-internal port (5432)
    - Print exact docker/SQL fix command on failure

  scripts/log_hunter.py
    - Replace PATTERNS with patterns found in Section 5 above
    - Use severity bucketing: critical → error → warning → info

  scripts/data_explorer.py
    - Replace TABLE, DB_PORT, DB_NAME with real values
    - All queries must use parameterized %s — no f-strings in SQL

  scripts/<specialist>.py  (based on service type: {service_type})
    - See references/script_quality_standards.md for the template
"""
    )


def generate_protected_regions() -> str:
    """Template for protected regions that preserve manual refinements during auto-updates."""
    return """
## Protected Regions

<!-- SEMANTIC_START -->
## Semantic Deep Dive (Human/Agent Refined)

Add deep operational knowledge here after Phase 2.
This section is preserved during auto-updates.

<!-- SEMANTIC_END -->
"""


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python deep_dive.py <command> [args...]")
        print("  classify <path>       — Classify service type from source")
        print("  questions <type>      — Print Phase 2 research agenda")
        print("  template              — Print protected regions template")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "classify" and len(sys.argv) > 2:
        result = classify_service(Path(sys.argv[2]))
        print("Service Classification:")
        for k, v in result.items():
            print(f"  {k}: {v}")

    elif cmd == "questions":
        stype = sys.argv[2] if len(sys.argv) > 2 else "continuous_db_writer"
        print_deep_dive_questions(stype)

    elif cmd == "template":
        print(generate_protected_regions())

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
