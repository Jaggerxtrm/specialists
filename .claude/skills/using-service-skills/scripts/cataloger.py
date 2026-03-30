#!/usr/bin/env python3
"""
Cataloger — SessionStart hook for using-service-skills.

Reads .claude/skills/service-registry.json and prints a lightweight XML
service catalog block (~150 tokens) to stdout. The SessionStart hook
injects this as additional context so Claude knows which expert personas
are available without loading full skill bodies (Progressive Disclosure).

Configured in .claude/settings.json:
  "SessionStart": [{"hooks": [{"type": "command",
    "command": "python3 \\"$CLAUDE_PROJECT_DIR/.claude/skills/using-service-skills/scripts/cataloger.py\\""}]}]

Output format:
  <project_service_catalog>
  Available expert personas:
  - db-expert: SQL & schema expert (Path: .claude/skills/db-expert/SKILL.md)
  </project_service_catalog>
  <instruction>To activate an expert, read its SKILL.md from the provided path.</instruction>
"""

import sys
from pathlib import Path

# Bootstrap lives in creating-service-skills — shared utility
BOOTSTRAP_DIR = Path(__file__).parent.parent.parent / "creating-service-skills" / "scripts"
sys.path.insert(0, str(BOOTSTRAP_DIR))

from bootstrap import RootResolutionError, list_services  # noqa: E402


def generate_catalog() -> str:
    """
    Generate the service catalog XML block.

    Returns empty string if no services are registered or project root
    cannot be determined (fails gracefully — never breaks session start).
    """
    try:
        services = list_services()
    except (RootResolutionError, Exception):
        return ""

    if not services:
        return ""

    lines = [
        "<project_service_catalog>",
        "Available expert personas:",
    ]

    for service_id, data in sorted(services.items()):
        description = data.get("description", data.get("name", service_id))
        skill_path = data.get("skill_path", f".claude/skills/{service_id}/SKILL.md")
        lines.append(f"- {service_id}: {description} (Path: {skill_path})")

    lines.append("</project_service_catalog>")
    lines.append(
        "<instruction>To activate an expert, read its SKILL.md from the provided path.</instruction>"
    )

    return "\n".join(lines)


def main() -> None:
    """Print catalog to stdout — injected as SessionStart additional context."""
    catalog = generate_catalog()
    if catalog:
        print(catalog)
    # Silent if no services registered — don't break session start


if __name__ == "__main__":
    main()
