import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from drift_detector import extract_tracks, match_files_to_tracks, format_scan_report


MEMORY_WITH_TRACKS = """---
title: Test SSOT
version: 1.0.0
updated: 2026-02-01
tracks:
  - "cli/src/**/*.ts"
  - "hooks/**/*.py"
---

## Purpose
Test memory.
"""

MEMORY_NO_TRACKS = """---
title: No Tracks
version: 1.0.0
updated: 2026-02-01
---

## Purpose
No tracking.
"""


def test_extract_tracks_finds_globs():
    tracks = extract_tracks(MEMORY_WITH_TRACKS)
    assert tracks == ["cli/src/**/*.ts", "hooks/**/*.py"]


def test_extract_tracks_empty_when_missing():
    tracks = extract_tracks(MEMORY_NO_TRACKS)
    assert tracks == []


def test_match_files_to_tracks_hit():
    files = ["cli/src/core/diff.ts", "hooks/skill-suggestion.py"]
    tracks = ["cli/src/**/*.ts", "hooks/**/*.py"]
    matched = match_files_to_tracks(files, tracks)
    assert "cli/src/core/diff.ts" in matched
    assert "hooks/skill-suggestion.py" in matched


def test_match_files_to_tracks_miss():
    files = ["docs/README.md"]
    tracks = ["cli/src/**/*.ts"]
    assert match_files_to_tracks(files, tracks) == []


def test_format_scan_report_stale():
    stale = {"my_memory": {"files": ["cli/src/core/diff.ts"], "updated": "2026-02-01"}}
    report = format_scan_report(stale)
    assert "my_memory" in report
    assert "cli/src/core/diff.ts" in report


def test_format_scan_report_clean():
    report = format_scan_report({})
    assert any(word in report.lower() for word in ["clean", "no stale", "up to date"])


def test_match_files_to_tracks_no_false_positive():
    """A .py file in an unrelated dir must NOT match hooks/**/*.py"""
    files = ["cli/src/transform.py", "docs/something.py"]
    tracks = ["hooks/**/*.py"]
    assert match_files_to_tracks(files, tracks) == []


def test_match_files_to_tracks_direct_child():
    """hooks/**/*.py must match files directly under hooks/ (no subdir)"""
    files = ["hooks/skill-suggestion.py"]
    tracks = ["hooks/**/*.py"]
    matched = match_files_to_tracks(files, tracks)
    assert "hooks/skill-suggestion.py" in matched
