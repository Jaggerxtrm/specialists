#!/usr/bin/env python3
"""
Analyze README.md and docs/ for structural drift.

Checks:
  1. README.md bloat — line count threshold and sections that belong in docs/
  2. CHANGELOG.md coverage — last entry date vs recent git activity
  3. docs/ gaps — expected focused files that don't exist yet

Outputs a JSON report with per-file findings categorized as:
  BLOATED, MISSING, STALE, OK

Usage:
  doc_structure_analyzer.py [options]

  --root=<path>            Project root (default: auto-detect via .git)
  --readme-threshold=N     Line count that marks README as bloated (default: 200)
  --fix                    Auto-scaffold all MISSING docs/ files
  --bd-remember            After --fix, persist a summary via bd remember
"""

import sys
import re
import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone


# Sections in README that indicate content belonging in docs/ files
# Format: (pattern, suggested_docs_file, description)
SECTION_DOCS_MAP = [
    (re.compile(r"^#{1,3}\s+(hooks?|hook system|hook events)", re.I), "hooks.md", "Hooks reference"),
    (re.compile(r"^#{1,3}\s+(pi.?extensions?|copilot.?ext|pi.?ext)", re.I), "pi-extensions.md", "Pi extensions reference"),
    (re.compile(r"^#{1,3}\s+(architecture|system design|components)", re.I), "architecture.md", "Architecture overview"),
    (re.compile(r"^#{1,3}\s+(policy|policies|enforcement rules)", re.I), "policies.md", "Policy reference"),
    (re.compile(r"^#{1,3}\s+(mcp.?servers?|model context)", re.I), "mcp-servers.md", "MCP server configuration"),
    (re.compile(r"^#{1,3}\s+(skills?|skill catalog)", re.I), "skills.md", "Skills catalog"),
    (re.compile(r"^#{1,3}\s+(cli.?reference|commands?.?reference)", re.I), "cli-reference.md", "CLI reference"),
    (re.compile(r"^#{1,3}\s+(troubleshoot|debugging|common issues)", re.I), "troubleshooting.md", "Troubleshooting guide"),
]

# Signals that suggest a docs/ file should exist even without README sections
# Format: (signal_path, docs_file, reason, title, scope, category, source_globs)
SUBSYSTEM_SIGNALS: list[tuple[str, str, str, str, str, str, list[str]]] = [
    ("hooks/", "hooks.md", "hooks/ directory exists",
     "Hooks Reference", "hooks", "reference", ["hooks/**/*.mjs", "policies/*.json"]),
    ("config/pi/extensions/", "pi-extensions.md", "Pi extensions directory exists",
     "Pi Extensions Reference", "pi-extensions", "reference", ["config/pi/extensions/**/*.ts"]),
    (".mcp.json", "mcp-servers.md", ".mcp.json present",
     "MCP Servers Configuration", "mcp-servers", "reference", [".mcp.json"]),
    ("policies/", "policies.md", "policies/ directory exists",
     "Policy Reference", "policies", "reference", ["policies/*.json"]),
    ("skills/", "skills.md", "skills/ directory exists",
     "Skills Catalog", "skills", "overview", ["skills/**/*.md"]),
]


def find_project_root(start: Path | None = None) -> Path:
    p = start or Path.cwd()
    for parent in [p, *p.parents]:
        if (parent / ".git").exists():
            return parent
    return p


def find_main_repo_root(root: Path) -> Path:
    """For git worktrees, resolve the main repo root from the .git file."""
    git_path = root / ".git"
    if git_path.is_file():
        content = git_path.read_text(encoding="utf-8").strip()
        if content.startswith("gitdir:"):
            worktree_git = Path(content[len("gitdir:"):].strip())
            main_git = worktree_git.parent.parent
            return main_git.parent
    return root


def count_lines(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8").splitlines())
    except Exception:
        return 0


def extract_sections(content: str) -> list[str]:
    return [line for line in content.splitlines() if re.match(r"^#{1,3}\s+", line)]


def get_last_changelog_date(path: Path) -> str | None:
    """Extract the most recent dated version entry from a Keep-a-Changelog CHANGELOG.md."""
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    m = re.search(r"##\s+\[?(\d+\.\d+\.\d+)\]?\s*[-–]\s*(\d{4}-\d{2}-\d{2})", content)
    if m:
        return m.group(2)
    return None


def get_package_version(root: Path) -> str | None:
    """Read current version from package.json if present."""
    pkg = root / "package.json"
    if not pkg.exists():
        return None
    try:
        import json as _json
        data = _json.loads(pkg.read_text(encoding="utf-8"))
        return data.get("version")
    except Exception:
        return None


def get_latest_changelog_version(path: Path) -> str | None:
    """Return the most recent versioned section from CHANGELOG.md.

    CHANGELOG is in reverse-chronological order, so the first version
    heading encountered is the most recently released one.
    """
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    m = re.search(r"##\s+\[?(\d+\.\d+\.\d+)\]?", content)
    return m.group(1) if m else None


def get_last_commit_date(root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ci"],
            cwd=str(root), capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()[:10]
    except Exception:
        pass
    return None


def analyze_readme(root: Path, threshold: int = 200) -> dict:
    readme = root / "README.md"
    if not readme.exists():
        return {"status": "MISSING", "path": "README.md", "issues": ["README.md not found"]}

    content = readme.read_text(encoding="utf-8")
    lines = content.splitlines()
    line_count = len(lines)
    sections = extract_sections(content)

    issues = []
    extraction_candidates = []

    if line_count > threshold:
        issues.append(f"README has {line_count} lines (threshold: {threshold})")

    for line in lines:
        for pattern, target_file, description in SECTION_DOCS_MAP:
            if pattern.match(line):
                target = root / "docs" / target_file
                if not target.exists():
                    extraction_candidates.append({
                        "section": line.strip(),
                        "suggest": f"docs/{target_file}",
                        "reason": description,
                    })

    status = "OK"
    if line_count > threshold and extraction_candidates:
        status = "BLOATED"
    elif line_count > threshold:
        status = "BLOATED"
    elif extraction_candidates:
        status = "EXTRACTABLE"

    return {
        "status": status,
        "path": "README.md",
        "line_count": line_count,
        "section_count": len(sections),
        "threshold": threshold,
        "extraction_candidates": extraction_candidates,
        "issues": issues,
    }


def analyze_changelog(root: Path) -> dict:
    changelog = root / "CHANGELOG.md"
    if not changelog.exists():
        return {"status": "MISSING", "path": "CHANGELOG.md", "issues": ["CHANGELOG.md not found"]}

    last_entry = get_last_changelog_date(changelog)
    last_commit = get_last_commit_date(root)
    latest_changelog_version = get_latest_changelog_version(changelog)
    pkg_version = get_package_version(root)

    issues = []
    status = "OK"

    # Check 1: date gap between last dated entry and last commit
    if last_entry and last_commit and last_entry < last_commit[:10]:
        days_stale = (
            datetime.fromisoformat(last_commit[:10]) - datetime.fromisoformat(last_entry)
        ).days
        if days_stale > 7:
            issues.append(
                f"Last CHANGELOG entry ({last_entry}) is {days_stale} days older than "
                f"last commit ({last_commit[:10]})"
            )
            status = "STALE"

    # Check 2: package version ahead of latest changelog version (undocumented release)
    if pkg_version and latest_changelog_version and pkg_version != latest_changelog_version:
        def semver_key(v: str) -> tuple[int, ...]:
            return tuple(int(p) for p in v.split("."))
        try:
            if semver_key(pkg_version) > semver_key(latest_changelog_version):
                issues.append(
                    f"package.json is at v{pkg_version} but latest CHANGELOG entry is "
                    f"v{latest_changelog_version} — release is undocumented"
                )
                status = "STALE"
        except (ValueError, AttributeError):
            pass

    result: dict = {
        "status": status,
        "path": "CHANGELOG.md",
        "last_entry_date": last_entry,
        "last_commit_date": last_commit,
        "package_version": pkg_version,
        "latest_changelog_version": latest_changelog_version,
        "issues": issues,
    }

    # When package.json is ahead of CHANGELOG, emit a ready-to-run fix command
    if status == "STALE" and pkg_version and latest_changelog_version:
        try:
            def _semver(v: str) -> tuple[int, ...]:
                return tuple(int(p) for p in v.split("."))
            if _semver(pkg_version) > _semver(latest_changelog_version):
                add_entry = next(
                    (p for p in [
                        Path.home() / ".claude/skills/sync-docs/scripts/changelog/add_entry.py",
                        Path(__file__).parent / "changelog/add_entry.py",
                    ] if p.exists()),
                    None,
                )
                script = str(add_entry) if add_entry else "skills/sync-docs/scripts/changelog/add_entry.py"
                result["fix_hint"] = (
                    f"python3 {script} CHANGELOG.md Added "
                    f'"v{pkg_version} — describe changes since v{latest_changelog_version}"'
                )
        except (ValueError, AttributeError):
            pass

    return result


def analyze_docs_gaps(root: Path) -> list[dict]:
    """Find expected docs/ files that don't exist given repo signals."""
    docs_dir = root / "docs"
    gaps = []

    for signal_path, docs_file, reason, _title, _scope, _cat, _globs in SUBSYSTEM_SIGNALS:
        if (root / signal_path).exists():
            target = docs_dir / docs_file
            if not target.exists():
                gaps.append({
                    "status": "MISSING",
                    "path": f"docs/{docs_file}",
                    "reason": reason,
                    "signal": signal_path,
                })

    return gaps


def analyze_existing_docs(root: Path) -> list[dict]:
    """Check existing docs/ files for schema validity (frontmatter present)."""
    docs_dir = root / "docs"
    if not docs_dir.exists():
        return []

    results = []
    for md_file in sorted(docs_dir.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        has_frontmatter = content.startswith("---\n")
        status = "OK" if has_frontmatter else "INVALID_SCHEMA"
        issues = [] if has_frontmatter else ["Missing YAML frontmatter — run validate_doc.py to fix"]
        results.append({
            "status": status,
            "path": str(md_file.relative_to(root)),
            "line_count": len(content.splitlines()),
            "has_frontmatter": has_frontmatter,
            "issues": issues,
        })

    return results


def inject_minimal_frontmatter(path: Path) -> bool:
    """Add minimal valid frontmatter to an existing docs/ file that lacks it."""
    try:
        content = path.read_text(encoding="utf-8")
        if content.startswith("---\n"):
            return False  # already has frontmatter

        # Derive title from first # heading, or filename
        title = path.stem.replace("-", " ").replace("_", " ").title()
        for line in content.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break

        scope = path.stem.lower().replace(" ", "-")
        today = datetime.now(timezone.utc).date().isoformat()
        fm = (
            f"---\ntitle: {title}\nscope: {scope}\ncategory: reference\n"
            f"version: 1.0.0\nupdated: {today}\ndomain: []\n---\n\n"
        )
        path.write_text(fm + content, encoding="utf-8")
        return True
    except Exception:
        return False


def scaffold_missing_docs(root: Path, gaps: list[dict]) -> list[str]:
    """Generate scaffold files for all MISSING docs/ gaps. Returns list of created paths."""
    # Build a lookup from docs_file name → signal metadata
    signal_meta = {
        docs_file: (title, scope, cat, globs)
        for _, docs_file, _, title, scope, cat, globs in SUBSYSTEM_SIGNALS
    }

    validator = Path(__file__).parent / "validate_doc.py"
    created = []
    docs_dir = root / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    for gap in gaps:
        docs_file = Path(gap["path"]).name  # e.g. "hooks.md"
        output_path = root / gap["path"]

        meta = signal_meta.get(docs_file)
        if not meta:
            print(f"  SKIP {gap['path']} — no scaffold metadata", file=sys.stderr)
            continue

        title, scope, category, globs = meta
        cmd = [
            sys.executable, str(validator),
            "--generate", str(output_path),
            f"--title={title}",
            f"--scope={scope}",
            f"--category={category}",
        ]
        if globs:
            cmd.append(f"--source-for={','.join(globs)}")

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print(f"  CREATED {gap['path']}")
                created.append(gap["path"])
            else:
                print(f"  FAILED  {gap['path']}: {result.stderr.strip()}", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR   {gap['path']}: {e}", file=sys.stderr)

    return created


def bd_remember(insight: str, key: str, cwd: str) -> bool:
    """Persist an insight via bd remember. Returns True on success."""
    try:
        result = subprocess.run(
            ["bd", "remember", insight, "--key", key],
            cwd=cwd, capture_output=True, text=True, timeout=8
        )
        return result.returncode == 0
    except Exception:
        return False


def main() -> None:
    root = find_project_root()
    threshold = 200
    fix_mode = False
    remember_mode = False

    for arg in sys.argv[1:]:
        if arg.startswith("--root="):
            root = Path(arg.split("=", 1)[1]).resolve()
        elif arg.startswith("--readme-threshold="):
            try:
                threshold = int(arg.split("=", 1)[1])
            except ValueError:
                pass
        elif arg == "--fix":
            fix_mode = True
        elif arg == "--bd-remember":
            remember_mode = True

    readme_result = analyze_readme(root, threshold)
    changelog_result = analyze_changelog(root)
    docs_gaps = analyze_docs_gaps(root)
    existing_docs = analyze_existing_docs(root)

    summary_issues = (
        (1 if readme_result["status"] != "OK" else 0)
        + (1 if changelog_result["status"] != "OK" else 0)
        + len(docs_gaps)
        + sum(1 for d in existing_docs if d["status"] != "OK")
    )

    report: dict = {
        "project_root": str(root),
        "summary": {
            "total_issues": summary_issues,
            "needs_attention": summary_issues > 0,
        },
        "readme": readme_result,
        "changelog": changelog_result,
        "docs_gaps": docs_gaps,
        "existing_docs": existing_docs,
    }

    # --fix: scaffold MISSING files + inject frontmatter into INVALID_SCHEMA files
    if fix_mode:
        created: list[str] = []
        schema_fixed: list[str] = []

        if docs_gaps:
            print(f"\nFixing {len(docs_gaps)} missing docs/ files...")
            created = scaffold_missing_docs(root, docs_gaps)

        invalid_docs = [d for d in existing_docs if d["status"] == "INVALID_SCHEMA"]
        if invalid_docs:
            print(f"\nInjecting frontmatter into {len(invalid_docs)} schema-invalid docs/ files...")
            for doc in invalid_docs:
                doc_path = root / doc["path"]
                if inject_minimal_frontmatter(doc_path):
                    print(f"  FIXED   {doc['path']}")
                    schema_fixed.append(doc["path"])
                else:
                    print(f"  SKIP    {doc['path']} — already has frontmatter or unreadable")

        if not created and not schema_fixed:
            print("\nNothing to fix — no MISSING gaps or INVALID_SCHEMA files detected.")

        report["fix_created"] = created
        report["fix_schema_fixed"] = schema_fixed

        # Re-analyze after fixes so the JSON report reflects post-fix state
        if created or schema_fixed:
            report["docs_gaps"] = analyze_docs_gaps(root)
            report["existing_docs"] = analyze_existing_docs(root)
            post_fix_issues = (
                (1 if report["readme"]["status"] != "OK" else 0)
                + (1 if report["changelog"]["status"] != "OK" else 0)
                + len(report["docs_gaps"])
                + sum(1 for d in report["existing_docs"] if d["status"] != "OK")
            )
            report["summary"] = {
                "total_issues": post_fix_issues,
                "needs_attention": post_fix_issues > 0,
                "pre_fix_issues": summary_issues,
                "fixed": summary_issues - post_fix_issues,
            }

        # --bd-remember: persist a summary insight
        all_fixed = created + schema_fixed
        main_root = find_main_repo_root(root)
        if remember_mode and all_fixed and (main_root / ".beads").exists():
            parts = []
            if created:
                parts.append(f"created {len(created)} scaffold(s): {', '.join(Path(p).name for p in created)}")
            if schema_fixed:
                parts.append(f"added frontmatter to {len(schema_fixed)} existing file(s): {', '.join(Path(p).name for p in schema_fixed)}")
            insight = (
                f"sync-docs --fix: {'; '.join(parts)}. "
                f"Fill in content and run validate_doc.py docs/ to confirm schema."
            )
            key = f"sync-docs-fix-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
            ok = bd_remember(insight, key, str(main_root))
            report["bd_remember"] = {"stored": ok, "key": key, "insight": insight}
            if ok:
                print(f"\n  Persisted to bd memory: {key}")

    print(json.dumps(report, indent=2))
    sys.exit(1 if summary_issues > 0 and not fix_mode else 0)


if __name__ == "__main__":
    main()
