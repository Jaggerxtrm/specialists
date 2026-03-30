"""Tests for skill_activator.py — load_registry integration."""
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

scripts_dir = Path(__file__).parent
sys.path.insert(0, str(scripts_dir))
sys.path.insert(0, str(scripts_dir.parent.parent / "creating-service-skills" / "scripts"))

import skill_activator


REGISTRY_WITH_VERSION = {
    "version": "1.0",
    "services": {
        "my-service": {
            "territory": ["src/my-service/**"],
            "name": "My Service",
            "skill_path": ".claude/skills/my-service/SKILL.md",
        }
    },
}

HOOK_INPUT = json.dumps({
    "tool_name": "Write",
    "tool_input": {"file_path": "src/my-service/foo.py"},
    "hook_event_name": "PreToolUse",
    "session_id": "test",
    "cwd": "/fake/project",
})


class TestMainWithVersionedRegistry(unittest.TestCase):
    def test_main_does_not_crash_when_registry_has_version_key(self):
        """main() must not crash with AttributeError when load_registry returns
        {"version": ..., "services": {...}} — the full registry dict.
        It should output valid JSON context for the matched service.
        """
        with patch("skill_activator.load_registry", return_value=REGISTRY_WITH_VERSION), \
             patch("skill_activator.get_project_root", return_value="/fake/project"), \
             patch("sys.stdin", io.StringIO(HOOK_INPUT)), \
             patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
            try:
                skill_activator.main()
            except SystemExit:
                pass
            output = mock_stdout.getvalue()

        self.assertTrue(output, "Expected JSON output but got nothing")
        result = json.loads(output)
        self.assertIn("hookSpecificOutput", result)


if __name__ == "__main__":
    unittest.main()
