#!/usr/bin/env python3
"""
Bootstrap module for Service Skill Trinity.

Provides root-discovery and registry CRUD operations shared across all
service-skill workflow scripts. All scripts in the trinity import from here.

Registry location: .claude/skills/service-registry.json
Skills location:   .claude/skills/<service-id>/
"""

import json
import os
import subprocess  # nosec B404
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class BootstrapError(Exception):
    """Base exception for bootstrap operations."""

    pass


class RootResolutionError(BootstrapError):
    """Raised when project root cannot be determined."""

    pass


class RegistryError(BootstrapError):
    """Raised when registry operations fail."""

    pass


def get_project_root() -> str:
    """
    Resolve project root via git.

    Returns:
        Absolute path to project root

    Raises:
        RootResolutionError: If git command fails or returns invalid path
    """
    try:
        result = subprocess.run(  # nosec B603 B607
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        root = result.stdout.strip()

        if not root:
            raise RootResolutionError("Git returned empty path")

        if not os.path.isdir(root):
            raise RootResolutionError(f"Resolved path is not a directory: {root}")

        return root

    except subprocess.CalledProcessError as e:
        raise RootResolutionError(
            f"Git root resolution failed: {e.stderr.strip() if e.stderr else str(e)}"
        ) from e
    except subprocess.TimeoutExpired as e:
        raise RootResolutionError("Git command timed out") from e
    except FileNotFoundError as e:
        raise RootResolutionError("Git not found in PATH") from e


def get_skills_root(project_root: str | None = None) -> Path:
    """
    Get the .claude/skills/ directory path.

    Args:
        project_root: Optional project root (uses get_project_root() if not provided)

    Returns:
        Path to .claude/skills/ directory
    """
    if project_root is None:
        project_root = get_project_root()
    return Path(project_root) / ".claude" / "skills"


def get_registry_path(project_root: str | None = None) -> Path:
    """
    Get the service-registry.json path.

    Args:
        project_root: Optional project root

    Returns:
        Path to .claude/skills/service-registry.json
    """
    return get_skills_root(project_root) / "service-registry.json"


def load_registry(project_root: str | None = None) -> dict[str, Any]:
    """
    Load the service registry.

    Args:
        project_root: Optional project root

    Returns:
        Registry contents as dict

    Raises:
        RegistryError: If registry cannot be loaded
    """
    registry_path = get_registry_path(project_root)

    if not registry_path.exists():
        return {"version": "1.0", "services": {}}

    try:
        with open(registry_path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise RegistryError(f"Invalid JSON in registry: {e}") from e
    except OSError as e:
        raise RegistryError(f"Cannot read registry: {e}") from e


def save_registry(data: dict[str, Any], project_root: str | None = None) -> None:
    """
    Save the service registry.

    Args:
        data: Registry contents
        project_root: Optional project root

    Raises:
        RegistryError: If registry cannot be saved
    """
    registry_path = get_registry_path(project_root)
    skills_root = get_skills_root(project_root)

    skills_root.mkdir(parents=True, exist_ok=True)

    try:
        with open(registry_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except OSError as e:
        raise RegistryError(f"Cannot write registry: {e}") from e


def register_service(
    service_id: str,
    name: str,
    territory: list[str],
    skill_path: str,
    description: str = "",
    project_root: str | None = None,
) -> None:
    """
    Register a new service in the registry.

    Args:
        service_id: Unique identifier (e.g., "db-expert")
        name: Display name (e.g., "Database Expert")
        territory: List of glob patterns for files this service owns
        skill_path: Path to SKILL.md relative to project root
        description: Optional description
        project_root: Optional project root

    Raises:
        RegistryError: If registration fails
    """
    registry = load_registry(project_root)

    if "services" not in registry:
        registry["services"] = {}

    registry["services"][service_id] = {
        "name": name,
        "territory": territory,
        "skill_path": skill_path,
        "description": description,
        "last_sync": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    save_registry(registry, project_root)


def unregister_service(service_id: str, project_root: str | None = None) -> bool:
    """
    Remove a service from the registry.

    Args:
        service_id: Service identifier to remove
        project_root: Optional project root

    Returns:
        True if service was removed, False if it didn't exist
    """
    registry = load_registry(project_root)

    if "services" not in registry or service_id not in registry["services"]:
        return False

    del registry["services"][service_id]
    save_registry(registry, project_root)
    return True


def get_service(service_id: str, project_root: str | None = None) -> dict[str, Any] | None:
    """
    Get a service by ID.

    Args:
        service_id: Service identifier
        project_root: Optional project root

    Returns:
        Service dict or None if not found
    """
    registry = load_registry(project_root)
    return registry.get("services", {}).get(service_id)


def list_services(project_root: str | None = None) -> dict[str, dict[str, Any]]:
    """
    List all registered services.

    Args:
        project_root: Optional project root

    Returns:
        Dict of service_id -> service_data
    """
    registry = load_registry(project_root)
    return registry.get("services", {})


def find_service_for_path(file_path: str, project_root: str | None = None) -> str | None:
    """
    Find which service (if any) owns a given file path.

    Uses glob matching against territory patterns.

    Args:
        file_path: Relative path to check
        project_root: Optional project root

    Returns:
        Service ID or None if no match
    """
    registry = load_registry(project_root)

    if project_root is None:
        try:
            project_root = get_project_root()
        except RootResolutionError:
            return None

    project_root = Path(project_root)
    file_path_obj = Path(file_path)

    if not file_path_obj.is_absolute():
        test_path = project_root / file_path_obj
    else:
        test_path = file_path_obj

    for service_id, service_data in registry.get("services", {}).items():
        territory = service_data.get("territory", [])
        for pattern in territory:
            # Direct glob match
            for glob_match in Path(project_root).glob(pattern):
                if glob_match == test_path:
                    return service_id
            # Prefix match for directory patterns
            base = pattern.replace("/**/*", "").replace("/**", "").rstrip("/")
            if str(file_path).startswith(base + "/") or str(file_path) == base:
                return service_id

    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python bootstrap.py <command> [args...]")
        print("Commands: root, registry, list, find <path>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "root":
        print(get_project_root())
    elif command == "registry":
        print(json.dumps(load_registry(), indent=2))
    elif command == "list":
        services = list_services()
        for sid, data in services.items():
            print(f"- {sid}: {data.get('name', 'N/A')} ({data.get('description', 'N/A')})")
    elif command == "find" and len(sys.argv) > 2:
        result = find_service_for_path(sys.argv[2])
        print(result if result else "No service found")
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
