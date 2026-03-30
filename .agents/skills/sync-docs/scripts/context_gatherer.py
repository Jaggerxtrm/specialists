#!/usr/bin/env python3
"""
Gather project context for documentation sync.

Collects:
  - Recently closed bd issues (if .beads/ exists)
  - Recently merged PRs (via git log)
  - bd memories persisted this cycle (bd kv list)
  - Stale docs/ files (via sync-docs drift_detector.py)

Outputs JSON to stdout. Safe to run in any project — degrades gracefully
when bd or drift detection tools are unavailable.

Usage:
  context_gatherer.py [--since=30]

  --since=N   Look back N commits for git context (default: 30)
"""

import sys
import json
import subprocess
import time
from pathlib import Path
from datetime import datetime, timezone


def run(cmd: list, cwd: str | None = None, timeout: int = 8) -> str | None:
    """Run a command, return stdout or None on failure."""
    try:
        result = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except Exception:
        return None


def find_project_root() -> Path:
    """Walk up from cwd looking for .git."""
    p = Path.cwd()
    for parent in [p, *p.parents]:
        if (parent / ".git").exists():
            return parent
    return p


def find_main_repo_root(root: Path) -> Path:
    """For git worktrees, resolve the main repo root from the .git file.

    In a worktree, .git is a file: "gitdir: /path/to/main/.git/worktrees/<name>"
    Navigate up two levels to reach the main .git, then one more for the repo root.
    """
    git_path = root / ".git"
    if git_path.is_file():
        content = git_path.read_text(encoding="utf-8").strip()
        if content.startswith("gitdir:"):
            worktree_git = Path(content[len("gitdir:"):].strip())
            main_git = worktree_git.parent.parent
            return main_git.parent
    return root


def ensure_dolt_server(cwd: str) -> bool:
    """Ensure the Dolt server is running. Start it if not. Returns True if ready."""
    test = run(["bd", "dolt", "test"], cwd=cwd, timeout=5)
    if test is not None:
        return True

    try:
        subprocess.run(
            ["bd", "dolt", "start"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception:
        return False

    for _ in range(6):
        time.sleep(1)
        if run(["bd", "dolt", "test"], cwd=cwd, timeout=3) is not None:
            return True

    return False


def has_beads(root: Path) -> bool:
    return (root / ".beads").exists()


def gather_bd_closed(cwd: str) -> list[dict]:
    """Get recently closed bd issues."""
    out = run(["bd", "list", "--status=closed"], cwd=cwd)
    if not out:
        return []

    issues = []
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("✓") or "closed" in line.lower():
            parts = line.lstrip("✓ ").split()
            if len(parts) >= 2:
                issue_id = parts[0]
                title_start = 2 if len(parts) > 2 and parts[1].startswith("P") else 1
                title = " ".join(parts[title_start:])
                issues.append({"id": issue_id, "title": title})

    return issues[:20]


def gather_bd_memories(cwd: str) -> list[dict]:
    """Read bd memories via bd kv list, filtering memory.* keys."""
    out = run(["bd", "kv", "list"], cwd=cwd)
    if not out:
        return []

    memories = []
    for line in out.splitlines():
        stripped = line.strip()
        if not stripped.startswith("memory."):
            continue
        if " = " in stripped:
            key, _, value = stripped.partition(" = ")
            memories.append({"key": key.strip(), "value": value.strip()})
        else:
            memories.append({"key": stripped, "value": ""})

    return memories[:20]


def gather_merged_prs(root: Path, since_n: int) -> list[dict]:
    """Get merged PRs from git log."""
    out = run(
        ["git", "log", f"-{since_n}", "--merges", "--oneline", "--format=%H|%s|%ci"],
        cwd=str(root),
    )
    if not out:
        return []

    prs = []
    for line in out.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            sha, subject, date = parts
            prs.append({"sha": sha[:8], "subject": subject.strip(), "date": date.strip()})
    return prs[:10]


def gather_recent_commits(root: Path, since_n: int) -> list[dict]:
    """Get recent non-merge commits for context."""
    out = run(
        ["git", "log", f"-{since_n}", "--no-merges", "--oneline", "--format=%H|%s|%ci"],
        cwd=str(root),
    )
    if not out:
        return []

    commits = []
    for line in out.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            sha, subject, date = parts
            commits.append({"sha": sha[:8], "subject": subject.strip(), "date": date.strip()})
    return commits[:15]


def gather_docs_drift(root: Path, since_n: int) -> dict:
    """Run sync-docs drift_detector.py and capture stale docs report."""
    candidates = [
        Path.home() / ".claude/skills/sync-docs/scripts/drift_detector.py",
        root / "skills/sync-docs/scripts/drift_detector.py",
        Path(__file__).parent / "drift_detector.py",
    ]
    detector = next((p for p in candidates if p.exists()), None)
    if not detector:
        return {"available": False, "stale": []}

    out = run([sys.executable, str(detector), "scan", "--since", str(since_n), "--json"], cwd=str(root))
    if out is None:
        return {"available": False, "stale": []}

    try:
        data = json.loads(out)
        return {
            "available": True,
            "stale": data.get("stale", []),
            "count": data.get("count", 0),
            "raw": data,
        }
    except json.JSONDecodeError:
        return {"available": True, "stale": [], "raw": out}


def main() -> None:
    since_n = 30
    for arg in sys.argv[1:]:
        if arg.startswith("--since="):
            try:
                since_n = int(arg.split("=", 1)[1])
            except ValueError:
                pass

    root = find_project_root()
    main_root = find_main_repo_root(root)
    bd_cwd = str(main_root)
    bd_available = has_beads(main_root)

    dolt_ready = False
    dolt_warning: str | None = None
    if bd_available:
        dolt_ready = ensure_dolt_server(bd_cwd)
        if not dolt_ready:
            dolt_warning = (
                "Dolt server could not be started — bd data unavailable. "
                "Run 'bd dolt start' manually from the project root and retry."
            )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_root": str(root),
        "bd_available": bd_available,
        "bd_closed_issues": gather_bd_closed(bd_cwd) if dolt_ready else [],
        "bd_memories": gather_bd_memories(bd_cwd) if dolt_ready else [],
        "merged_prs": gather_merged_prs(root, since_n),
        "recent_commits": gather_recent_commits(root, since_n),
        "docs_drift": gather_docs_drift(root, since_n),
    }

    if dolt_warning:
        report["warnings"] = [dolt_warning]

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
