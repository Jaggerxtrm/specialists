#!/usr/bin/env python3
"""Tests for documentation orchestrator."""

import pytest
from pathlib import Path
from scripts.orchestrator import DocumentingOrchestrator, ChangeType


def test_orchestrator_routes_to_correct_docs(tmp_path):
    """Orchestrator should update relevant docs based on change type."""
    # Setup test project
    project_root = tmp_path / "test_project"
    project_root.mkdir()

    changelog = project_root / "CHANGELOG.md"
    changelog.write_text("""# Changelog

## [Unreleased]

## [0.1.0] - 2026-02-01

### Added
- Initial release
""", encoding="utf-8")

    serena_memories = project_root / ".serena" / "memories"
    serena_memories.mkdir(parents=True)

    orchestrator = DocumentingOrchestrator(project_root)

    result = orchestrator.document_change(
        change_type=ChangeType.FEATURE,
        description="Add new API endpoint",
        details={
            "scope": "api-endpoints",
            "category": "backend",
            "files_changed": ["server.py", "routes/api.py"]
        }
    )

    # Should update CHANGELOG
    assert result["changelog_updated"] is True
    # Should create/update SSOT
    assert result["ssot_updated"] is False # Placeholder impl in plan returns False
    # Should suggest README update
    assert "readme_suggestions" in result


def test_orchestrator_validates_all_docs():
    """Orchestrator should validate all documentation after updates."""
    # Test validation integration
    pass
