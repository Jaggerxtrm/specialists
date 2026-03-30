#!/usr/bin/env python3
"""
Bump CHANGELOG.md release version.

Moves [Unreleased] content to new [X.Y.Z] - YYYY-MM-DD section.
Creates new empty [Unreleased] section.
"""

import re
import sys
from datetime import date
from pathlib import Path


SEMVER_PATTERN = r"^\d+\.\d+\.\d+$"


def bump_release(changelog_content: str, version: str, release_date: str = None) -> str:
    """
    Move [Unreleased] to [version] - date.

    Args:
        changelog_content: Full CHANGELOG.md content
        version: Semantic version (X.Y.Z)
        release_date: Optional YYYY-MM-DD (defaults to today)

    Returns:
        Updated changelog content
    """
    # Validate semver
    if not re.match(SEMVER_PATTERN, version):
        raise ValueError(f"Invalid semantic version: {version} (expected X.Y.Z)")

    if release_date is None:
        release_date = date.today().strftime('%Y-%m-%d')

    lines = changelog_content.splitlines()

    # Find [Unreleased] section
    unreleased_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^## \[Unreleased\]", line):
            unreleased_idx = i
            break

    if unreleased_idx is None:
        raise ValueError("CHANGELOG missing [Unreleased] section")

    # Replace [Unreleased] with [version] - date
    lines[unreleased_idx] = f"## [{version}] - {release_date}"

    # Insert new empty [Unreleased] section at top
    # Find where to insert (after header, before first version)
    header_end_idx = 0
    # Assuming standard format: Header, then empty line, then Unreleased.
    # We want to keep header, insert Unreleased, then the renamed old unreleased.
    
    # Actually, we renamed the old [Unreleased] to [version].
    # So now we just need to insert [Unreleased] before it.
    
    # lines[unreleased_idx] is now the new version header.
    # We insert before unreleased_idx.
    # But usually there is an empty line before sections.
    
    # Keep a Changelog format:
    # Header
    #
    # ## [Unreleased]
    # ...
    #
    # ## [1.0.0] - ...
    
    # If unreleased_idx points to "## [Unreleased]", we changed it to "## [1.0.0] - ..."
    # We want:
    # ## [Unreleased]
    #
    # ## [1.0.0] - ...
    
    lines.insert(unreleased_idx, "")
    lines.insert(unreleased_idx, "## [Unreleased]")

    return '\n'.join(lines)


def bump_release_file(filepath: Path, version: str, release_date: str = None) -> None:
    """Bump release version in CHANGELOG file."""
    if not filepath.exists():
        raise FileNotFoundError(f"CHANGELOG not found: {filepath}")

    content = filepath.read_text(encoding='utf-8')
    updated = bump_release(content, version, release_date)
    filepath.write_text(updated, encoding='utf-8')

    actual_date = release_date or date.today().strftime('%Y-%m-%d')
    print(f"✅ Released version {version} ({actual_date})")
    print(f"📝 Updated {filepath.name}")


def main():
    """CLI entry point."""
    if len(sys.argv) < 3:
        print("Usage: bump_release.py <changelog_file> <version> [date]")
        print("")
        print("Example:")
        print("  bump_release.py CHANGELOG.md 1.2.0")
        print("  bump_release.py CHANGELOG.md 2.0.0 2026-03-15")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    version = sys.argv[2]
    release_date = sys.argv[3] if len(sys.argv) > 3 else None

    bump_release_file(filepath, version, release_date)


if __name__ == "__main__":
    main()
