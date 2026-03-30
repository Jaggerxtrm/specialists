#!/usr/bin/env python3
"""
Detect documentation drift between docs/ files and git-modified files.

A docs file is considered stale when:
1. It declares source globs in frontmatter (`source_of_truth_for` or `tracks`)
2. AND there are commits affecting those source files AFTER the doc's `synced_at` hash

If `synced_at` is not set, the doc is considered stale (never synced).

Subcommands:
  scan [--since N] [--json]  — scan all docs files (default N=30 commits)
  check <docs-file> [--since N] [--json]  — check one docs file
  hook [--json]              — check current uncommitted changes
  update-sync <docs-file>    -- update synced_at to current HEAD hash
"""

import sys
import re
import json
import fnmatch
import subprocess
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


def find_project_root() -> Path:
    """Walk up from cwd looking for docs/ and .git."""
    p = Path.cwd()
    for parent in [p, *p.parents]:
        if (parent / ".git").exists():
            return parent
    return p


def get_docs_files(project_root: Path) -> list[Path]:
    docs_dir = project_root / "docs"
    if not docs_dir.exists():
        return []
    return sorted(docs_dir.glob("*.md"))


def extract_frontmatter(content: str) -> dict[str, Any]:
    match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not match:
        return {}

    raw = match.group(1)
    if yaml is not None:
        try:
            return yaml.safe_load(raw) or {}
        except Exception:
            return {}

    # Minimal fallback parser for environments without pyyaml
    fm: dict[str, Any] = {}
    current_key: str | None = None
    for line in raw.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if re.match(r"^[A-Za-z0-9_\-]+:\s*", line):
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            if not value:
                fm[key] = []
                current_key = key
            else:
                fm[key] = value.strip('"')
                current_key = None
        elif current_key and line.strip().startswith("-"):
            item = line.strip()[1:].strip().strip('"')
            if isinstance(fm.get(current_key), list):
                fm[current_key].append(item)
    return fm


def extract_globs(content: str) -> list[str]:
    fm = extract_frontmatter(content)
    source = fm.get("source_of_truth_for", [])
    tracks = fm.get("tracks", [])

    globs: list[str] = []
    if isinstance(source, list):
        globs.extend(str(x) for x in source)
    if isinstance(tracks, list):
        for item in tracks:
            s = str(item)
            if s not in globs:
                globs.append(s)

    return [g for g in globs if g.strip()]


def extract_updated(content: str) -> str:
    fm = extract_frontmatter(content)
    return str(fm.get("updated", ""))


def extract_synced_at(content: str) -> str | None:
    """Extract the synced_at git hash from frontmatter."""
    fm = extract_frontmatter(content)
    synced = fm.get("synced_at")
    if synced and isinstance(synced, str) and synced.strip():
        return synced.strip()
    return None


def get_current_head_hash(project_root: Path) -> str | None:
    """Get the current HEAD commit hash (short form)."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def get_commits_after_hash(project_root: Path, synced_hash: str, source_files: list[str]) -> list[str]:
    """
    Check if there are commits affecting source_files after synced_hash.
    Returns list of affected files (empty if no changes after sync point).
    """
    affected: list[str] = []
    try:
        # Check each source file for commits after the sync point
        for source in source_files:
            result = subprocess.run(
                ["git", "log", f"{synced_hash}..HEAD", "--oneline", "--", source],
                cwd=project_root,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0 and result.stdout.strip():
                affected.append(source)
    except Exception:
        pass
    return affected


def is_valid_git_hash(project_root: Path, hash_ref: str) -> bool:
    """Check if a hash/ref is valid in the git repository."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--verify", hash_ref],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def _match_glob(path: str, pattern: str) -> bool:
    path_parts = Path(path).as_posix().split("/")
    pattern_parts = Path(pattern).as_posix().split("/")

    def _match(pp: list[str], pat: list[str]) -> bool:
        if not pat:
            return not pp
        if pat[0] == "**":
            for i in range(len(pp) + 1):
                if _match(pp[i:], pat[1:]):
                    return True
            return False
        if not pp:
            return False
        return fnmatch.fnmatch(pp[0], pat[0]) and _match(pp[1:], pat[1:])

    return _match(path_parts, pattern_parts)


def match_files_to_globs(files: list[str], globs: list[str]) -> list[str]:
    matched: list[str] = []
    for file_path in files:
        for pattern in globs:
            if _match_glob(file_path, pattern):
                matched.append(file_path)
                break
    return matched


def get_recent_modified_files(project_root: Path, since_n_commits: int = 30) -> list[str]:
    try:
        result = subprocess.run(
            ["git", "log", f"-{since_n_commits}", "--name-only", "--format="],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return []
        return [l.strip() for l in result.stdout.splitlines() if l.strip()]
    except Exception:
        return []


def get_files_matching_globs(project_root: Path, globs: list[str]) -> list[str]:
    """Get all tracked files matching the given glob patterns."""
    matched: list[str] = []
    try:
        # Get all tracked files
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return []
        
        all_files = [l.strip() for l in result.stdout.splitlines() if l.strip()]
        matched = match_files_to_globs(all_files, globs)
    except Exception:
        pass
    return matched


def get_session_written_files(project_root: Path) -> list[str]:
    try:
        unstaged = subprocess.run(
            ["git", "diff", "HEAD", "--name-only"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        files = unstaged.stdout.splitlines() + staged.stdout.splitlines()
        return sorted({f.strip() for f in files if f.strip()})
    except Exception:
        return []


def scan_docs(project_root: Path, changed_files: list[str], use_hash_check: bool = True) -> list[dict[str, Any]]:
    """
    Scan docs for drift.
    
    If use_hash_check=True (default): use synced_at hash comparison
    If use_hash_check=False: use legacy recent-commits matching (for --since flag)
    """
    stale: list[dict[str, Any]] = []
    for doc_path in get_docs_files(project_root):
        content = doc_path.read_text(encoding="utf-8", errors="replace")
        globs = extract_globs(content)
        if not globs:
            continue

        synced_at = extract_synced_at(content)
        updated = extract_updated(content)
        
        if use_hash_check and synced_at:
            # Hash-based check: are there commits affecting source files after synced_at?
            if not is_valid_git_hash(project_root, synced_at):
                # Invalid hash (maybe rebased/force-pushed) - treat as stale
                stale.append({
                    "doc": str(doc_path.relative_to(project_root)),
                    "updated": updated,
                    "synced_at": synced_at,
                    "synced_at_valid": False,
                    "matched_files": [],
                    "globs": globs,
                    "reason": "synced_at hash not found in git history",
                })
                continue
            
            # Get all tracked files matching the globs
            source_files = get_files_matching_globs(project_root, globs)
            
            # Check which files have commits after synced_at
            affected = get_commits_after_hash(project_root, synced_at, source_files)
            
            if affected:
                stale.append({
                    "doc": str(doc_path.relative_to(project_root)),
                    "updated": updated,
                    "synced_at": synced_at,
                    "synced_at_valid": True,
                    "matched_files": affected[:10],
                    "globs": globs,
                    "reason": "source files changed after sync point",
                })
        elif use_hash_check:
            # No synced_at hash - doc needs initial sync
            source_files = get_files_matching_globs(project_root, globs)
            if source_files:
                stale.append({
                    "doc": str(doc_path.relative_to(project_root)),
                    "updated": updated,
                    "synced_at": None,
                    "synced_at_valid": False,
                    "matched_files": source_files[:10],
                    "globs": globs,
                    "reason": "no synced_at hash - needs initial sync",
                })
        else:
            # Legacy check: match against recent commits
            matched = match_files_to_globs(changed_files, globs)
            if matched:
                stale.append({
                    "doc": str(doc_path.relative_to(project_root)),
                    "updated": updated,
                    "synced_at": synced_at,
                    "synced_at_valid": synced_at is not None,
                    "matched_files": matched[:10],
                    "globs": globs,
                    "reason": "recent commits match",
                })
    return stale


def print_human_report(stale: list[dict[str, Any]], source: str) -> None:
    if not stale:
        print(f"[Docs Drift] All docs up to date ({source}).")
        return

    print(f"[Drift Report] {len(stale)} stale doc(s) detected:\n")
    for item in stale:
        print(f"  {item['doc']}")
        synced = item.get("synced_at")
        if synced:
            valid = item.get("synced_at_valid", True)
            status = "valid" if valid else "INVALID (not in git history)"
            print(f"    Synced at: {synced} ({status})")
        else:
            print(f"    Synced at: (not set)")
        print(f"    Last updated: {item['updated'] or 'unknown'}")
        reason = item.get("reason", "source files changed")
        print(f"    Reason: {reason}")
        if item.get("matched_files"):
            for file_path in item["matched_files"][:3]:
                print(f"    Modified: {file_path}")
        print("")
    print("Run /sync-docs to review and update stale docs.")
    print("After updating, run: drift_detector.py update-sync <docs-file>")


def cmd_scan(args: list[str]) -> None:
    since = 30
    as_json = "--json" in args
    use_legacy = "--legacy" in args or "--since" in args
    
    if "--since" in args:
        idx = args.index("--since")
        if idx + 1 < len(args):
            since = int(args[idx + 1])

    project_root = find_project_root()
    
    if use_legacy:
        # Legacy mode: match against recent commits
        changed = get_recent_modified_files(project_root, since)
        stale = scan_docs(project_root, changed, use_hash_check=False)
        source = f"last {since} commits (legacy mode)"
    else:
        # Default: hash-based check
        stale = scan_docs(project_root, [], use_hash_check=True)
        source = "hash-based sync check"

    if as_json:
        print(
            json.dumps(
                {
                    "mode": "scan",
                    "legacy": use_legacy,
                    "since": since if use_legacy else None,
                    "count": len(stale),
                    "stale": stale,
                },
                indent=2,
            )
        )
    else:
        print_human_report(stale, source)

    sys.exit(1 if stale else 0)


def cmd_check(args: list[str]) -> None:
    if not args:
        print("Usage: drift_detector.py check <docs-file> [--since N] [--json]")
        sys.exit(1)

    target = args[0]
    as_json = "--json" in args
    since = 30
    if "--since" in args:
        idx = args.index("--since")
        if idx + 1 < len(args):
            since = int(args[idx + 1])

    project_root = find_project_root()
    doc_path = (project_root / target).resolve()
    if not doc_path.exists():
        print(f"Doc not found: {target}")
        sys.exit(1)

    changed = get_recent_modified_files(project_root, since)
    content = doc_path.read_text(encoding="utf-8")
    globs = extract_globs(content)
    matched = match_files_to_globs(changed, globs) if globs else []

    payload = {
        "mode": "check",
        "doc": str(doc_path.relative_to(project_root)),
        "since": since,
        "stale": bool(matched),
        "matched_files": matched[:10],
        "globs": globs,
    }

    if as_json:
        print(json.dumps(payload, indent=2))
    else:
        if matched:
            print(f"{payload['doc']}: STALE")
            for f in matched[:5]:
                print(f"  Modified: {f}")
        else:
            print(f"{payload['doc']}: up to date")

    sys.exit(1 if matched else 0)


def cmd_hook(args: list[str]) -> None:
    as_json = "--json" in args
    project_root = find_project_root()
    changed = get_session_written_files(project_root)
    if not changed:
        sys.exit(0)

    # Hook mode always uses legacy check (uncommitted changes, not committed history)
    stale = scan_docs(project_root, changed, use_hash_check=False)
    if not stale:
        sys.exit(0)

    if as_json:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "Stop",
                        "additionalContext": (
                            f"[Docs Drift] {len(stale)} docs may need updates. "
                            "Run /sync-docs to review."
                        ),
                    }
                }
            )
        )
    else:
        print_human_report(stale, "current session changes")

    sys.exit(1)


def cmd_update_sync(args: list[str]) -> None:
    """Update synced_at field in a doc's frontmatter to current HEAD hash."""
    if not args or args[0].startswith("--"):
        print("Usage: drift_detector.py update-sync <docs-file>")
        print("  Updates the synced_at field to current HEAD hash")
        sys.exit(1)

    target = args[0]
    project_root = find_project_root()
    doc_path = (project_root / target).resolve()
    
    if not doc_path.exists():
        print(f"Doc not found: {target}")
        sys.exit(1)

    # Get current HEAD hash
    head_hash = get_current_head_hash(project_root)
    if not head_hash:
        print("Failed to get current HEAD hash")
        sys.exit(1)

    # Read doc content
    content = doc_path.read_text(encoding="utf-8")
    
    # Check for frontmatter
    fm_match = re.match(r"^(---\n)(.*?)(\n---\n)", content, re.DOTALL)
    if not fm_match:
        print(f"No frontmatter found in {target}")
        sys.exit(1)

    frontmatter_block = fm_match.group(2)
    rest_of_content = content[fm_match.end():]

    # Parse frontmatter
    fm = extract_frontmatter(content)
    
    # Update or add synced_at
    if "synced_at" in fm:
        # Replace existing synced_at
        new_frontmatter = re.sub(
            r"^synced_at:\s*.*$",
            f"synced_at: {head_hash}",
            frontmatter_block,
            flags=re.MULTILINE,
        )
    else:
        # Add synced_at after updated field, or at end
        if "updated" in fm:
            new_frontmatter = re.sub(
                r"^(updated:\s*.*)$",
                rf"\1\nsynced_at: {head_hash}",
                frontmatter_block,
                flags=re.MULTILINE,
            )
        else:
            new_frontmatter = frontmatter_block.rstrip() + f"\nsynced_at: {head_hash}"

    # Reconstruct file
    new_content = f"---\n{new_frontmatter}\n---\n{rest_of_content}"
    
    # Write back
    doc_path.write_text(new_content, encoding="utf-8")
    print(f"Updated {target}: synced_at = {head_hash}")


SUBCOMMANDS = {"scan": cmd_scan, "check": cmd_check, "hook": cmd_hook, "update-sync": cmd_update_sync}


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] not in SUBCOMMANDS:
        print("Usage: drift_detector.py <scan|check|hook|update-sync> [options]")
        print("  scan [--legacy] [--since N] [--json]  scan all docs (hash-based by default)")
        print("  scan --legacy --since N               legacy mode: match recent commits")
        print("  check <docs-file> [--since N]         check one docs file")
        print("  hook [--json]                         stop-hook mode (uncommitted changes)")
        print("  update-sync <docs-file>               set synced_at to current HEAD")
        sys.exit(1)

    SUBCOMMANDS[args[0]](args[1:])


if __name__ == "__main__":
    main()
