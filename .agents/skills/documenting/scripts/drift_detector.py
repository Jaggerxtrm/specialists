#!/usr/bin/env python3
"""
Detect documentation drift between Serena memories and git-modified files.

Subcommands:
  scan [--since N]   — scan all memories, report stale ones (default N=30 commits)
  check <memory>     — check a single memory by name
  hook               — Stop hook mode: check session writes, output JSON if stale
"""

import sys
import re
import json
import fnmatch
import subprocess
from pathlib import Path

import yaml


# ── Path resolution ───────────────────────────────────────────────────────────

def find_project_root() -> Path:
    """Walk up from cwd looking for .serena/memories/."""
    p = Path.cwd()
    for parent in [p, *p.parents]:
        if (parent / ".serena" / "memories").exists():
            return parent
    print(f"Warning: no .serena/memories/ found in ancestors of {p}; using cwd", file=sys.stderr)
    return p


def get_memories_dir(project_root: Path) -> Path:
    return project_root / ".serena" / "memories"


# ── Frontmatter parsing ───────────────────────────────────────────────────────

def extract_frontmatter(content: str) -> dict:
    match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not match:
        return {}
    try:
        return yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return {}


def extract_tracks(content: str) -> list:
    """Return tracks: glob list from memory frontmatter."""
    fm = extract_frontmatter(content)
    tracks = fm.get("tracks", [])
    return tracks if isinstance(tracks, list) else []


def extract_updated(content: str) -> str:
    fm = extract_frontmatter(content)
    return str(fm.get("updated", ""))


# ── File matching ─────────────────────────────────────────────────────────────

def _match_glob(path: str, pattern: str) -> bool:
    """Match a file path against a glob pattern with proper ** support."""
    path_parts = Path(path).as_posix().split("/")
    pattern_parts = Path(pattern).as_posix().split("/")

    def _match(pp, pat):
        if not pat:
            return not pp
        if pat[0] == "**":
            # ** matches zero or more segments
            for i in range(len(pp) + 1):
                if _match(pp[i:], pat[1:]):
                    return True
            return False
        if not pp:
            return False
        return fnmatch.fnmatch(pp[0], pat[0]) and _match(pp[1:], pat[1:])

    return _match(path_parts, pattern_parts)


def match_files_to_tracks(files: list, tracks: list) -> list:
    """Return files that match any of the tracks globs (supports **)."""
    matched = []
    for f in files:
        for pattern in tracks:
            if _match_glob(f, pattern):
                matched.append(f)
                break
    return matched


# ── Git helpers ───────────────────────────────────────────────────────────────

def get_recent_modified_files(project_root: Path, since_n_commits: int = 30) -> list:
    """Get files modified in the last N commits."""
    try:
        result = subprocess.run(
            ["git", "log", f"-{since_n_commits}", "--name-only", "--format="],
            cwd=project_root, capture_output=True, text=True
        )
        return [l.strip() for l in result.stdout.splitlines() if l.strip()]
    except Exception:
        return []


def get_session_written_files(project_root: Path) -> list:
    """Get files with uncommitted or staged changes."""
    try:
        r1 = subprocess.run(
            ["git", "diff", "HEAD", "--name-only"],
            cwd=project_root, capture_output=True, text=True
        )
        r2 = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=project_root, capture_output=True, text=True
        )
        files = r1.stdout.splitlines() + r2.stdout.splitlines()
        return list({f.strip() for f in files if f.strip()})
    except Exception:
        return []


# ── Core logic ────────────────────────────────────────────────────────────────

def scan_memories(project_root: Path, since_n_commits: int = 30) -> dict:
    """Return {memory_stem: {files, updated}} for stale memories."""
    memories_dir = get_memories_dir(project_root)
    if not memories_dir.exists():
        return {}

    modified_files = get_recent_modified_files(project_root, since_n_commits)
    stale = {}

    for md_file in sorted(memories_dir.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        tracks = extract_tracks(content)
        if not tracks:
            continue
        matched = match_files_to_tracks(modified_files, tracks)
        if matched:
            stale[md_file.stem] = {
                "files": matched[:5],
                "updated": extract_updated(content),
            }

    return stale


def format_scan_report(stale: dict) -> str:
    if not stale:
        return "[Docs Drift] All memories up to date. No action needed."

    n = len(stale)
    lines = [f"[Drift Report] {n} memor{'y' if n == 1 else 'ies'} stale:\n"]
    for name, info in stale.items():
        lines.append(f"  {name}")
        lines.append(f"    Last updated: {info['updated']}")
        for f in info["files"][:3]:
            lines.append(f"    Modified: {f}")
        lines.append("")
    lines.append("Run /documenting to update.")
    return "\n".join(lines)


# ── Subcommands ───────────────────────────────────────────────────────────────

def cmd_scan(args: list):
    since = 30
    if "--since" in args:
        idx = args.index("--since")
        if idx + 1 < len(args):
            since = int(args[idx + 1])

    project_root = find_project_root()
    stale = scan_memories(project_root, since)
    print(format_scan_report(stale))
    sys.exit(1 if stale else 0)


def cmd_check(args: list):
    if not args:
        print("Usage: drift_detector.py check <memory-name>")
        sys.exit(1)

    memory_name = args[0]
    project_root = find_project_root()
    md_file = get_memories_dir(project_root) / f"{memory_name}.md"

    if not md_file.exists():
        print(f"Memory not found: {memory_name}")
        sys.exit(1)

    content = md_file.read_text(encoding="utf-8")
    tracks = extract_tracks(content)
    if not tracks:
        print(f"{memory_name}: no tracks: field — skipping drift check.")
        sys.exit(0)

    modified = get_recent_modified_files(project_root, 30)
    matched = match_files_to_tracks(modified, tracks)
    if matched:
        print(f"{memory_name}: STALE — matched: {', '.join(matched[:3])}")
        sys.exit(1)
    else:
        print(f"{memory_name}: up to date.")
        sys.exit(0)


def cmd_hook(_args: list):
    """Stop hook mode — outputs JSON reminder only if session files touch any tracks."""
    project_root = find_project_root()
    session_files = get_session_written_files(project_root)
    if not session_files:
        sys.exit(0)

    memories_dir = get_memories_dir(project_root)
    if not memories_dir.exists():
        sys.exit(0)

    stale_names = []
    for md_file in sorted(memories_dir.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        tracks = extract_tracks(content)
        if not tracks:
            continue
        if match_files_to_tracks(session_files, tracks):
            stale_names.append(md_file.stem)

    if stale_names:
        names = ", ".join(stale_names[:3])
        suffix = f" (+{len(stale_names) - 3} more)" if len(stale_names) > 3 else ""
        msg = (
            f"[Docs Drift] {len(stale_names)} memor{'y' if len(stale_names) == 1 else 'ies'} "
            f"may need updating: {names}{suffix}. Run /documenting to review."
        )
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "Stop",
                "additionalContext": msg,
            }
        }))

    sys.exit(0)


# ── Entry point ───────────────────────────────────────────────────────────────

SUBCOMMANDS = {"scan": cmd_scan, "check": cmd_check, "hook": cmd_hook}


def main():
    args = sys.argv[1:]
    if not args or args[0] not in SUBCOMMANDS:
        print("Usage: drift_detector.py <scan|check|hook> [options]")
        print("  scan [--since N]   scan all memories (default N=30 commits)")
        print("  check <memory>     check a single memory")
        print("  hook               Stop hook mode (outputs JSON if stale)")
        sys.exit(1)
    SUBCOMMANDS[args[0]](args[1:])


if __name__ == "__main__":
    main()
