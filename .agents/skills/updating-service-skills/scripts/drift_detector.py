#!/usr/bin/env python3
"""
Drift detector — PostToolUse hook for updating-service-skills.

Checks whether a modified file belongs to a registered service territory.
If so, notifies Claude to sync the skill documentation.

Configured via updating-service-skills/SKILL.md frontmatter hooks:
  PostToolUse → matcher: "Write|Edit" → command: drift_detector.py check-hook

Subcommands:
  check-hook          Read file_path from stdin JSON (PostToolUse hook mode)
  check <file>        Check a specific file path from CLI
  sync <service-id>   Mark service as synced (update registry timestamp)
  scan                Scan all territories for drifted services
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Bootstrap lives in creating-service-skills — shared utility
BOOTSTRAP_DIR = Path(__file__).parent.parent.parent / "creating-service-skills" / "scripts"
sys.path.insert(0, str(BOOTSTRAP_DIR))

from bootstrap import (  # noqa: E402
    RootResolutionError,
    find_service_for_path,
    get_project_root,
    get_service,
    load_registry,
    save_registry,
)


def check_drift(file_path: str, project_root: str | None = None) -> dict:
    """Check if a file change causes drift in any registered service territory."""
    if project_root is None:
        try:
            project_root = get_project_root()
        except RootResolutionError:
            return {"drift": False, "reason": "Cannot resolve project root"}

    # Normalize to relative path
    fp = Path(file_path)
    if fp.is_absolute():
        try:
            fp = fp.relative_to(project_root)
            file_path = str(fp)
        except ValueError:
            pass

    service_id = find_service_for_path(file_path, project_root)
    if not service_id:
        return {"drift": False, "reason": "No service owns this file"}

    service = get_service(service_id, project_root)
    if not service:
        return {"drift": False, "reason": "Service not found in registry"}

    return {
        "drift": True,
        "service_id": service_id,
        "service_name": service.get("name", service_id),
        "skill_path": service.get("skill_path"),
        "last_sync": service.get("last_sync", ""),
        "file_path": file_path,
        "message": (
            f"[Skill Sync]: Implementation drift detected in '{service_id}'. "
            f"File '{file_path}' was modified. "
            f"Use '/updating-service-skills' to sync the {service.get('name', service_id)} documentation."
        ),
    }


def check_drift_from_hook_stdin() -> None:
    """
    PostToolUse hook mode: reads file_path from stdin JSON.

    The PostToolUse hook delivers stdin JSON with shape:
      {"tool_name": "Write", "tool_input": {"file_path": "/abs/path"}, ...}

    Outputs drift message to stdout (shown to Claude via PostToolUse additionalContext).
    Exits 0 always — drift detection is advisory, never blocking.
    """
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path:
        sys.exit(0)

    result = check_drift(file_path)

    if result.get("drift"):
        # Output additionalContext for Claude via PostToolUse JSON format
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": result["message"],
            }
        }
        print(json.dumps(output))

    sys.exit(0)


def update_sync_time(service_id: str, project_root: str | None = None) -> bool:
    """Update last_sync timestamp for a service in the registry."""
    try:
        registry = load_registry(project_root)
    except Exception:
        return False

    if "services" not in registry or service_id not in registry["services"]:
        return False

    registry["services"][service_id]["last_sync"] = (
        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )

    try:
        save_registry(registry, project_root)
        return True
    except Exception:
        return False


def scan_drift(project_root: str | None = None) -> list[dict]:
    """Scan all territories and identify services with files modified since last sync."""
    if project_root is None:
        try:
            project_root = get_project_root()
        except RootResolutionError:
            return []

    root = Path(project_root)
    registry = load_registry(project_root)
    drifted: list[dict] = []

    for service_id, service in registry.get("services", {}).items():
        last_sync_str = service.get("last_sync", "")
        if not last_sync_str:
            continue
        try:
            sync_time = datetime.fromisoformat(last_sync_str.replace("Z", "+00:00"))
        except ValueError:
            continue

        for pattern in service.get("territory", []):
            for fp in root.glob(pattern):
                if fp.is_file():
                    try:
                        mtime = datetime.fromtimestamp(fp.stat().st_mtime, tz=timezone.utc)
                        if mtime > sync_time:
                            drifted.append(
                                {
                                    "service_id": service_id,
                                    "service_name": service.get("name", service_id),
                                    "file_path": str(fp.relative_to(root)),
                                    "last_sync": last_sync_str,
                                }
                            )
                    except (OSError, ValueError):
                        continue

    return drifted


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python drift_detector.py <command> [args...]")
        print("  check-hook          — Read file from stdin JSON (PostToolUse hook mode)")
        print("  check <file>        — Check a specific file path")
        print("  sync <service-id>   — Mark service as synced")
        print("  scan                — Scan all territories for drift")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "check-hook":
        check_drift_from_hook_stdin()

    elif cmd == "check" and len(sys.argv) > 2:
        result = check_drift(sys.argv[2])
        if result.get("drift"):
            print(result["message"])
        else:
            print(f"No drift: {result.get('reason', 'OK')}")

    elif cmd == "sync" and len(sys.argv) > 2:
        service_id = sys.argv[2]
        if update_sync_time(service_id):
            print(f"✓ Synced: {service_id}")
        else:
            print(f"✗ Failed to sync: {service_id}")
            sys.exit(1)

    elif cmd == "scan":
        drifted = scan_drift()
        if drifted:
            print(f"Found {len(drifted)} drifted service(s):")
            for item in drifted:
                print(
                    f"  {item['service_id']}: {item['file_path']} "
                    f"(last sync: {item['last_sync']})"
                )
        else:
            print("No drift detected.")

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
