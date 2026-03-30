#!/usr/bin/env python3
"""Tests for CHANGELOG management scripts."""

import pytest
from pathlib import Path
from scripts.changelog.validate_changelog import validate_changelog
from scripts.changelog.add_entry import add_entry, ChangeCategory
from scripts.changelog.bump_release import bump_release
from datetime import date
import tempfile


def test_valid_changelog_passes():
    """Valid Keep a Changelog format should pass validation."""
    valid_content = """# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(valid_content)
    assert result["valid"] is True
    assert len(result["errors"]) == 0


def test_missing_unreleased_section_fails():
    """CHANGELOG without [Unreleased] section should fail."""
    invalid_content = """# Changelog

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(invalid_content)
    assert result["valid"] is False
    assert any("Unreleased" in err for err in result["errors"])


def test_invalid_semver_fails():
    """CHANGELOG with invalid semver should fail."""
    invalid_content = """# Changelog

## [Unreleased]

## [1.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(invalid_content)
    assert result["valid"] is False
    assert any("semantic version" in err.lower() for err in result["errors"])


def test_invalid_category_fails():
    """CHANGELOG with invalid category should fail."""
    invalid_content = """# Changelog

## [Unreleased]

### InvalidCategory
- Some change

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(invalid_content)
    assert result["valid"] is False
    assert any("category" in err.lower() for err in result["errors"])


def test_add_entry_to_unreleased():
    """Adding entry should place it under [Unreleased] in correct category."""
    changelog_content = """# Changelog

## [Unreleased]

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""

    result = add_entry(
        changelog_content,
        category=ChangeCategory.ADDED,
        description="New feature X"
    )

    assert "### Added" in result
    assert "- New feature X" in result
    # Should be under [Unreleased], not under [1.0.0]
    unreleased_section = result.split("## [1.0.0]")[0]
    assert "- New feature X" in unreleased_section


def test_add_entry_creates_category_if_missing():
    """Adding entry should create category section if it doesn't exist."""
    changelog_content = """# Changelog

## [Unreleased]

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""

    result = add_entry(
        changelog_content,
        category=ChangeCategory.FIXED,
        description="Bug fix Y"
    )

    assert "### Fixed" in result
    assert "- Bug fix Y" in result


def test_add_entry_maintains_category_order():
    """Categories should be ordered: Added, Changed, Deprecated, Removed, Fixed, Security."""
    changelog_content = """# Changelog

## [Unreleased]

### Added
- Feature A

### Fixed
- Bug B

## [1.0.0] - 2026-02-01
"""

    result = add_entry(
        changelog_content,
        category=ChangeCategory.CHANGED,
        description="Change C"
    )

    # Changed should appear between Added and Fixed
    lines = result.split('\n')
    added_idx = next(i for i, line in enumerate(lines) if "### Added" in line)
    changed_idx = next(i for i, line in enumerate(lines) if "### Changed" in line)
    fixed_idx = next(i for i, line in enumerate(lines) if "### Fixed" in line)

    assert added_idx < changed_idx < fixed_idx


def test_bump_release_moves_unreleased():
    """Bumping release should move [Unreleased] to [X.Y.Z] - DATE."""
    changelog_content = """# Changelog

## [Unreleased]

### Added
- New feature

## [1.0.0] - 2026-01-01

### Added
- Initial release
"""

    result = bump_release(changelog_content, "1.1.0")

    # Should have new version section
    assert "## [1.1.0]" in result
    assert f"## [1.1.0] - {date.today().strftime('%Y-%m-%d')}" in result

    # New feature should be under 1.1.0 now
    version_section = result.split("## [1.0.0]")[0]
    assert "- New feature" in version_section

    # [Unreleased] should be empty
    unreleased_section = result.split("## [1.1.0]")[0]
    assert "## [Unreleased]" in unreleased_section
    # No ### categories under [Unreleased]
    unreleased_lines = unreleased_section.split("## [Unreleased]")[1].split('\\n')
    assert not any(line.startswith("###") for line in unreleased_lines)


def test_bump_release_validates_semver():
    """Bumping with invalid semver should raise error."""
    changelog_content = "## [Unreleased]"

    with pytest.raises(ValueError, match="semantic version"):
        bump_release(changelog_content, "1.0")
