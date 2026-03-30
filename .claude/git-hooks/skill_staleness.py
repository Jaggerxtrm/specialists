#!/usr/bin/env python3
"""
Pre-push hook: Skill staleness check.

Reads the git push range from stdin, identifies which source files changed,
and warns if any service skill's SKILL.md is older than the changed source files.

Non-blocking by default. Set SKILL_HOOK_STRICT=1 to block the push on staleness.

Usage: called automatically by .githooks/pre-push (reads from stdin)
Manual: python3 skill_staleness.py --check-all
"""
import subprocess
import sys
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Per-service source path prefixes — derived from docker-compose + entrypoint.
# A skill is flagged as potentially stale if any changed file in the push
# starts with one of these paths for that service.
#
# Customise this dict to match your project's layout.
# ---------------------------------------------------------------------------
SERVICE_SOURCE_PATHS: dict[str, list[str]] = {
    "mmd-data-feed":          ["scripts/data/import_unified.py",
                                "scripts/database/unified_import.py"],
    "mmd-snapshot-feed":      ["scripts/data/feeds/snapshot_feed.py",
                                "scripts/core/"],
    "mmd-curve-feed":         ["scripts/data/feeds/spread_feed.py"],
    "mmd-curve-backfill":     ["scripts/data/feeds/spread_feed.py"],
    "mmd-stir-feed":          ["scripts/data/feeds/stir_feed.py"],
    "mmd-api":                ["mcp_server/"],
    "mmd-mcp-server":         ["mcp_server/mcp_server.py",
                                "mcp_server/docstrings/"],
    "mmd-cme-ingestion":      ["scripts/ingestion/cme/"],
    "mmd-migrations":         ["alembic/", "scripts/data/migrations.py",
                                "scripts/database/run_migrations.py"],
    "mmd-tick-ingestor-rust": ["rust_ingestor/"],
    "mmd-backup-service":     ["scripts/backup/"],
    "mmd-timescaledb":        ["docker-compose.yml"],
}

# These files, if changed, flag ALL skills for review
GLOBAL_TRIGGERS = [
    "docker-compose.yml",
    "scripts/docker-entrypoint.sh",
    ".env.TEMPLATE",
]

NULL_SHA    = "0" * 40
SKILLS_DIR  = Path(".claude/skills")
STRICT      = os.getenv("SKILL_HOOK_STRICT", "0") == "1"

# Colors
YELLOW = "\033[1;33m"
RED    = "\033[0;31m"
GREEN  = "\033[0;32m"
BLUE   = "\033[0;34m"
NC     = "\033[0m"


def get_push_ranges() -> list[tuple[str, str]]:
    """Read push ranges from stdin (pre-push hook protocol)."""
    ranges = []
    for line in sys.stdin:
        parts = line.strip().split()
        if len(parts) == 4:
            _, local_sha, _, remote_sha = parts
            if local_sha != NULL_SHA:
                ranges.append((remote_sha, local_sha))
    return ranges


def get_changed_files(old_sha: str, new_sha: str) -> set[str]:
    """Get set of file paths changed between two commits."""
    if old_sha == NULL_SHA:
        # First push — compare against empty tree
        result = subprocess.run(
            ["git", "diff-tree", "--name-only", "-r", new_sha],
            capture_output=True, text=True
        )
    else:
        result = subprocess.run(
            ["git", "diff", "--name-only", old_sha, new_sha],
            capture_output=True, text=True
        )
    return {f for f in result.stdout.splitlines() if f}


def file_touches_service(filepath: str, service: str) -> bool:
    """Return True if filepath is tracked by this service's source paths."""
    for prefix in SERVICE_SOURCE_PATHS.get(service, []):
        if filepath.startswith(prefix) or filepath == prefix:
            return True
    return False


def is_globally_triggered(changed_files: set[str]) -> bool:
    return any(f in GLOBAL_TRIGGERS for f in changed_files)


def check_skill_staleness(
    service: str,
    changed_files: set[str],
    global_trigger: bool,
) -> str | None:
    """
    Return a warning message if the skill for `service` is stale,
    or None if healthy.
    """
    skill_md = SKILLS_DIR / service / "SKILL.md"
    if not skill_md.exists():
        return None  # Missing skills are a separate concern

    if not global_trigger and not any(
        file_touches_service(f, service) for f in changed_files
    ):
        return None  # No relevant changes for this service

    # Compare SKILL.md mtime against the most recently modified source file
    skill_mtime = skill_md.stat().st_mtime
    relevant_files = (
        [f for f in changed_files if f in GLOBAL_TRIGGERS]
        if global_trigger
        else [f for f in changed_files if file_touches_service(f, service)]
    )

    stale_triggers = []
    for rel_path in relevant_files:
        abs_path = Path(rel_path)
        if abs_path.exists() and abs_path.stat().st_mtime > skill_mtime:
            stale_triggers.append(rel_path)

    if stale_triggers:
        return (
            f"  {service}: SKILL.md older than changed source\n"
            f"    Trigger: {stale_triggers[0]}\n"
            f"    Action:  python3 /path/to/jaggers-agent-tools/project-skills/install.py {service} --force\n"
            f"             Then perform Phase 2 deep dive (see SKILL.md)"
        )
    return None


def main() -> None:
    # Allow manual invocation: python3 skill_staleness.py --check-all
    if "--check-all" in sys.argv:
        changed_files = set()
        global_trigger = True
    else:
        ranges = get_push_ranges()
        if not ranges:
            sys.exit(0)

        changed_files: set[str] = set()
        for old_sha, new_sha in ranges:
            changed_files |= get_changed_files(old_sha, new_sha)

        if not changed_files:
            sys.exit(0)

        global_trigger = is_globally_triggered(changed_files)

    # Check each service that has a skill
    warnings = []
    services_to_check = sorted(SERVICE_SOURCE_PATHS.keys())

    for service in services_to_check:
        msg = check_skill_staleness(service, changed_files, global_trigger)
        if msg:
            warnings.append(msg)

    if not warnings:
        sys.exit(0)

    print()
    print(f"{YELLOW}[skill-hook] ⚠  The following service skills may be stale:{NC}")
    for w in warnings:
        print(f"{YELLOW}{w}{NC}")
    print()

    if STRICT:
        print(f"{RED}[skill-hook] SKILL_HOOK_STRICT=1: blocking push until skills are updated.{NC}")
        print(f"[skill-hook] Bypass: git push --no-verify")
        print()
        sys.exit(1)
    else:
        print(f"{BLUE}[skill-hook] Set SKILL_HOOK_STRICT=1 to block pushes on staleness.{NC}")
        print()
        sys.exit(0)


if __name__ == "__main__":
    main()
