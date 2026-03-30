#!/usr/bin/env python3
"""
Pre-commit hook: Documentation reminder.

Warns when behavior-changing source files are staged for commit without
corresponding SSOT documentation updates. Always exits 0 (non-blocking).

Usage: called automatically by .githooks/pre-commit
"""
import subprocess
import sys

# Source paths that indicate behavior-changing code.
# If any staged file starts with one of these, the reminder fires.
SOURCE_PATHS = [
    "scripts/core/",
    "scripts/data/",
    "scripts/ingestion/",
    "mcp_server/",
    "alembic/",
]

# Proxy for "agent already ran /documenting".
# If any of these are also staged, the reminder is suppressed.
SSOT_PATHS = [
    ".serena/memories/",
]

# Colors
YELLOW = "\033[1;33m"
BLUE   = "\033[0;34m"
NC     = "\033[0m"


def get_staged_files() -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True, text=True
    )
    return [f for f in result.stdout.splitlines() if f]


def main() -> None:
    staged = get_staged_files()
    if not staged:
        sys.exit(0)

    source_changed = [f for f in staged if any(f.startswith(p) for p in SOURCE_PATHS)]
    ssot_changed   = [f for f in staged if any(f.startswith(p) for p in SSOT_PATHS)]

    if source_changed and not ssot_changed:
        print()
        print(f"{YELLOW}[doc-hook] ⚠  Source changes staged without SSOT updates.{NC}")
        print(f"{BLUE}[doc-hook]    If this commit changes behavior or architecture, run /documenting first.{NC}")
        print(f"[doc-hook]    Changed source paths:")
        for f in source_changed[:6]:
            print(f"[doc-hook]      - {f}")
        if len(source_changed) > 6:
            print(f"[doc-hook]      ... and {len(source_changed) - 6} more")
        print(f"[doc-hook]    Commit proceeds — this is a reminder, not a block.")
        print()

    sys.exit(0)


if __name__ == "__main__":
    main()
