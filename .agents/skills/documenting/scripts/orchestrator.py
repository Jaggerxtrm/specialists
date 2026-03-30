#!/usr/bin/env python3
"""
Documentation orchestrator for coordinating SSOT, CHANGELOG, README, CLAUDE.md updates.

Workflow:
1. Classify change type (feature, bugfix, refactor, breaking, docs, chore)
2. Update SSOT memories (.serena/memories/)
3. Update CHANGELOG.md
4. Suggest README.md updates
5. Suggest CLAUDE.md/AGENT.md updates
6. Validate all changes
"""

import sys
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, timezone

from scripts.changelog.add_entry import add_entry_to_file, ChangeCategory
from scripts.changelog.validate_changelog import validate_file as validate_changelog_file


class ChangeType(Enum):
    """Types of changes to document."""
    FEATURE = "feature"
    BUGFIX = "bugfix"
    REFACTOR = "refactor"
    BREAKING = "breaking"
    DOCS = "docs"
    CHORE = "chore"


# Mapping of ChangeType to CHANGELOG category
CHANGE_TYPE_TO_CATEGORY = {
    ChangeType.FEATURE: ChangeCategory.ADDED,
    ChangeType.BUGFIX: ChangeCategory.FIXED,
    ChangeType.REFACTOR: ChangeCategory.CHANGED,
    ChangeType.BREAKING: ChangeCategory.CHANGED,
    ChangeType.DOCS: ChangeCategory.CHANGED,
    ChangeType.CHORE: ChangeCategory.CHANGED,
}


class DocumentingOrchestrator:
    """Coordinates documentation updates across multiple doc types."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.changelog_path = self.project_root / "CHANGELOG.md"
        self.readme_path = self.project_root / "README.md"
        self.claude_path = self._find_agent_doc()
        self.ssot_dir = self.project_root / ".serena" / "memories"

    def _find_agent_doc(self) -> Optional[Path]:
        """Find CLAUDE.md or AGENT.md."""
        for name in ["CLAUDE.md", "AGENT.md"]:
            path = self.project_root / name
            if path.exists():
                return path
        return None

    def document_change(
        self,
        change_type: ChangeType,
        description: str,
        details: Optional[Dict] = None
    ) -> Dict:
        """
        Document a change across all relevant documentation.

        Args:
            change_type: Type of change
            description: Brief description
            details: Additional context:
                - scope: SSOT scope identifier
                - category: SSOT category
                - subcategory: SSOT subcategory
                - files_changed: List of affected files
                - breaking: Whether change is breaking

        Returns:
            {
                "changelog_updated": bool,
                "ssot_updated": bool,
                "ssot_file": Optional[Path],
                "readme_suggestions": List[str],
                "claude_suggestions": List[str],
                "validation_errors": List[str]
            }
        """
        details = details or {}
        result = {
            "changelog_updated": False,
            "ssot_updated": False,
            "ssot_file": None,
            "readme_suggestions": [],
            "claude_suggestions": [],
            "validation_errors": []
        }

        # 1. Update CHANGELOG
        if self.changelog_path.exists():
            try:
                category = CHANGE_TYPE_TO_CATEGORY[change_type]
                if details.get("breaking"):
                    description = f"**BREAKING**: {description}"

                add_entry_to_file(self.changelog_path, category, description)
                result["changelog_updated"] = True
            except Exception as e:
                result["validation_errors"].append(f"CHANGELOG update failed: {e}")

        # 2. Update/Create SSOT (if relevant)
        if change_type in [ChangeType.FEATURE, ChangeType.REFACTOR, ChangeType.BREAKING]:
            ssot_result = self._update_ssot(change_type, description, details)
            result.update(ssot_result)

        # 3. Generate README suggestions
        if change_type == ChangeType.FEATURE:
            result["readme_suggestions"] = self._generate_readme_suggestions(description, details)

        # 4. Generate CLAUDE.md suggestions
        if change_type in [ChangeType.FEATURE, ChangeType.REFACTOR]:
            result["claude_suggestions"] = self._generate_claude_suggestions(description, details)

        # 5. Validate all documentation
        validation = self.validate_all()
        result["validation_errors"].extend(validation["errors"])

        return result

    def _update_ssot(self, change_type: ChangeType, description: str, details: Dict) -> Dict:
        """Update or create SSOT memory."""
        # This will be implemented with Serena tools in later tasks
        # For now, just return placeholder
        return {
            "ssot_updated": False,
            "ssot_file": None
        }

    def _generate_readme_suggestions(self, description: str, details: Dict) -> List[str]:
        """Generate suggestions for README.md updates."""
        suggestions = []

        # Suggest updating features section
        suggestions.append(f"Consider adding to ## Features section: {description}")

        # If files_changed includes examples, suggest updating usage
        if details.get("files_changed"):
            if any("example" in f.lower() for f in details["files_changed"]):
                suggestions.append("Update ## Usage section with new example")

        return suggestions

    def _generate_claude_suggestions(self, description: str, details: Dict) -> List[str]:
        """Generate suggestions for CLAUDE.md/AGENT.md updates."""
        suggestions = []

        if not self.claude_path:
            return suggestions

        # Suggest architecture updates for major features
        suggestions.append(f"Review ## Architecture section for: {description}")

        # If files_changed affects setup, suggest updating
        if details.get("files_changed"):
            setup_files = ["requirements.txt", "package.json", ".env", "docker-compose.yml"]
            if any(f in details["files_changed"] for f in setup_files):
                suggestions.append("Update ## Development Environment section")

        return suggestions

    def validate_all(self) -> Dict:
        """Validate all documentation."""
        errors = []
        warnings = []

        # Validate CHANGELOG
        if self.changelog_path.exists():
            result = validate_changelog_file(self.changelog_path)
            errors.extend(result.get("errors", []))
            warnings.extend(result.get("warnings", []))

        # TODO: Add SSOT validation
        # TODO: Add README validation (check for broken links, etc.)

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }


def main():
    """CLI entry point."""
    if len(sys.argv) < 4:
        print("Usage: orchestrator.py <project_root> <change_type> <description> [--scope=X] [--category=Y]")
        print("")
        print("Change Types: feature, bugfix, refactor, breaking, docs, chore")
        print("")
        print("Example:")
        print('  orchestrator.py . feature "Add semantic search" --scope=search --category=backend')
        sys.exit(1)

    project_root = Path(sys.argv[1])
    change_type = ChangeType(sys.argv[2])
    description = sys.argv[3]

    # Parse optional details
    details = {}
    for arg in sys.argv[4:]:
        if arg.startswith("--"):
            key, value = arg[2:].split("=", 1)
            details[key] = value

    orchestrator = DocumentingOrchestrator(project_root)
    result = orchestrator.document_change(change_type, description, details)

    # Print results
    print("")
    print("📝 Documentation Update Results")
    print("=" * 60)

    if result["changelog_updated"]:
        print("✅ CHANGELOG.md updated")

    if result["ssot_updated"]:
        print(f"✅ SSOT updated: {result['ssot_file']}")

    if result["readme_suggestions"]:
        print("")
        print("💡 README.md suggestions:")
        for suggestion in result["readme_suggestions"]:
            print(f"  - {suggestion}")

    if result["claude_suggestions"]:
        print("")
        print("💡 CLAUDE.md suggestions:")
        for suggestion in result["claude_suggestions"]:
            print(f"  - {suggestion}")

    if result["validation_errors"]:
        print("")
        print("❌ Validation errors:")
        for error in result["validation_errors"]:
            print(f"  - {error}")
        sys.exit(1)

    print("")
    print("✅ All documentation validated")


if __name__ == "__main__":
    main()
