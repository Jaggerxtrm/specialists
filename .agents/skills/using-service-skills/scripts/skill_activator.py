#!/usr/bin/env python3
"""
PreToolUse hook: skill activator.

Fires before Read, Write, Edit, Glob, Grep, or Bash operations.
Checks whether the operation touches a registered service territory.
If it does, injects additionalContext telling Claude to load the skill
before proceeding — ensuring expert knowledge is always applied.

Configured in .claude/settings.json PreToolUse hook.
Must be fast: pure file I/O + string matching, no subprocess.
"""

import fnmatch
import json
import sys
from pathlib import Path

BOOTSTRAP_DIR = Path(__file__).parent.parent.parent / "creating-service-skills" / "scripts"
sys.path.insert(0, str(BOOTSTRAP_DIR))

from bootstrap import RootResolutionError, get_project_root, load_registry  # noqa: E402  # type: ignore[import-not-found]


def match_territory(file_path: str, territory: list[str], project_root: Path) -> bool:
    """Check if a file path matches any territory glob pattern."""
    # Normalize to relative path
    fp = Path(file_path)
    if fp.is_absolute():
        try:
            fp = fp.relative_to(project_root)
        except ValueError:
            return False
    rel = str(fp)

    for pattern in territory:
        # fnmatch handles * and ?, but not ** — handle ** manually
        if "**" in pattern:
            # Split on **/ and check prefix + suffix
            parts = pattern.split("**/")
            if len(parts) == 2:
                prefix, suffix = parts
                rel_check = rel[len(prefix) :] if rel.startswith(prefix) else rel
                if fnmatch.fnmatch(rel_check, suffix) or fnmatch.fnmatch(
                    rel, f"{prefix}*/{suffix}"
                ):
                    return True
                # Also check if file is anywhere under the prefix dir
                if prefix and rel.startswith(prefix.rstrip("/")):
                    return True
        else:
            if fnmatch.fnmatch(rel, pattern):
                return True
        # Direct prefix match for broad patterns
        base = pattern.split("/*")[0].split("/**")[0]
        if base and (rel.startswith(base + "/") or rel == base):
            return True

    return False


def find_service_for_file(
    file_path: str, services: dict, project_root: Path
) -> tuple[str, dict] | None:
    """Return (service_id, service_data) if file is in any territory, else None."""
    for service_id, data in services.items():
        if match_territory(file_path, data.get("territory", []), project_root):
            return service_id, data
    return None


def find_service_for_command(command: str, services: dict) -> tuple[str, dict] | None:
    """Return (service_id, service_data) if command mentions a service name."""
    cmd_lower = command.lower()
    for service_id, data in services.items():
        # Match service_id directly or as a container name in docker commands
        if service_id in cmd_lower:
            return service_id, data
        # Match the container name pattern (service name with dashes/underscores)
        if data.get("name") and data.get("name", "").lower().replace(" ", "-") in cmd_lower:
            return service_id, data
    return None


def build_context(service_id: str, data: dict) -> str:
    skill_path = data.get("skill_path", f".claude/skills/{service_id}/SKILL.md")
    desc = data.get("description", "")
    desc_line = f"\n  What it covers: {desc}" if desc else ""

    return (
        f"[Service Skill] You are about to work with the '{service_id}' service territory."
        f"{desc_line}\n"
        f"  Load the expert skill before proceeding: Read {skill_path}\n"
        f"  The skill contains: operational knowledge, failure modes, diagnostic scripts, "
        f"and the correct methods for managing this service.\n"
        f"  Do not use ad-hoc approaches (raw SQL, improvised docker commands) "
        f"when the skill defines the correct method."
    )


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    try:
        project_root = Path(get_project_root())
        services = load_registry().get("services", {})
    except (RootResolutionError, Exception):
        sys.exit(0)

    if not services:
        sys.exit(0)

    match = None

    # File-based tools: check file_path against territory
    if tool_name in ("Read", "Write", "Edit", "Glob", "Grep", "NotebookRead", "NotebookEdit"):
        file_path = (
            tool_input.get("file_path")
            or tool_input.get("path")
            or tool_input.get("notebook_path")
            or ""
        )
        if file_path:
            match = find_service_for_file(file_path, services, project_root)

    # Bash: check command string for service names
    elif tool_name == "Bash":
        command = tool_input.get("command", "")
        if command:
            match = find_service_for_command(command, services)

    if match:
        service_id, service_data = match
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": build_context(service_id, service_data),
            }
        }
        print(json.dumps(output))

    sys.exit(0)


if __name__ == "__main__":
    main()
