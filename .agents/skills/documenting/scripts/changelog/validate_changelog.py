#!/usr/bin/env python3
"""
Validate CHANGELOG.md follows Keep a Changelog 1.0.0 format.

Checks:
- Required header with Keep a Changelog link
- [Unreleased] section exists
- Version sections use semantic versioning
- Valid categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Proper date format: YYYY-MM-DD
"""

import re
from pathlib import Path
from typing import Dict, List, Tuple


VALID_CATEGORIES = {"Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"}
SEMVER_PATTERN = r"^\d+\.\d+\.\d+$"
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


def validate_changelog(content: str) -> Dict[str, any]:
    """
    Validate CHANGELOG content.

    Returns:
        {
            "valid": bool,
            "errors": List[str],
            "warnings": List[str]
        }
    """
    errors = []
    warnings = []

    # Check header
    if "Keep a Changelog" not in content:
        errors.append("Missing 'Keep a Changelog' link in header")

    if "Semantic Versioning" not in content:
        warnings.append("Missing 'Semantic Versioning' link in header")

    # Check for [Unreleased] section
    if not re.search(r"^## \[Unreleased\]", content, re.MULTILINE):
        errors.append("Missing required [Unreleased] section")

    # Find all version sections
    version_pattern = r"^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?$"
    versions = re.findall(version_pattern, content, re.MULTILINE)

    for version, date in versions:
        if version == "Unreleased":
            if date:
                warnings.append("[Unreleased] section should not have a date")
            continue

        # Validate semver
        if not re.match(SEMVER_PATTERN, version):
            errors.append(f"Invalid semantic version: [{version}] (expected X.Y.Z)")

        # Validate date
        if not date:
            errors.append(f"Version [{version}] missing release date")
        elif not re.match(DATE_PATTERN, date):
            errors.append(f"Invalid date format for [{version}]: {date} (expected YYYY-MM-DD)")

    # Find all categories
    category_pattern = r"^### (.+?)$"
    categories = re.findall(category_pattern, content, re.MULTILINE)

    for category in categories:
        if category not in VALID_CATEGORIES:
            errors.append(f"Invalid category: '{category}' (must be one of {VALID_CATEGORIES})")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


def validate_file(filepath: Path) -> Dict[str, any]:
    """Validate a CHANGELOG.md file."""
    if not filepath.exists():
        return {
            "valid": False,
            "errors": [f"File not found: {filepath}"],
            "warnings": []
        }

    content = filepath.read_text(encoding='utf-8')
    return validate_changelog(content)


def main():
    """CLI entry point."""
    import sys

    if len(sys.argv) != 2:
        print("Usage: validate_changelog.py <CHANGELOG.md>")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    result = validate_file(filepath)

    print(f"Validating: {filepath.name}")
    print("=" * 60)

    if result["warnings"]:
        print("\n⚠️  WARNINGS:")
        for warning in result["warnings"]:
            print(f"  - {warning}")

    if result["errors"]:
        print("\n❌ ERRORS:")
        for error in result["errors"]:
            print(f"  - {error}")
        print("=" * 60)
        sys.exit(1)

    print("\n✅ VALID: All checks passed!")
    print("=" * 60)
    sys.exit(0)


if __name__ == "__main__":
    main()
