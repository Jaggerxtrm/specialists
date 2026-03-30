#!/usr/bin/env bash
# Integration test for documenting skill workflows

set -e  # Exit on error

TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# Ensure we are in the skill root (skills/documenting)
cd "$(dirname "$0")/.."
SKILL_ROOT=$(pwd)
echo "Skill root: $SKILL_ROOT"

# Test 1: Initialize CHANGELOG
echo "Test 1: Initialize CHANGELOG"
python3 -m scripts.changelog.init_changelog "$TEST_DIR/CHANGELOG.md"
python3 -m scripts.changelog.validate_changelog "$TEST_DIR/CHANGELOG.md"
echo "✅ CHANGELOG initialization passed"

# Test 2: Add entries
echo ""
echo "Test 2: Add entries to CHANGELOG"
python3 -m scripts.changelog.add_entry "$TEST_DIR/CHANGELOG.md" Added "Feature A"
python3 -m scripts.changelog.add_entry "$TEST_DIR/CHANGELOG.md" Fixed "Bug B"
python3 -m scripts.changelog.add_entry "$TEST_DIR/CHANGELOG.md" Changed "Refactor C"
python3 -m scripts.changelog.validate_changelog "$TEST_DIR/CHANGELOG.md"
echo "✅ Entry addition passed"

# Test 3: Bump release
echo ""
echo "Test 3: Bump release version"
python3 -m scripts.changelog.bump_release "$TEST_DIR/CHANGELOG.md" "1.0.0"
python3 -m scripts.changelog.validate_changelog "$TEST_DIR/CHANGELOG.md"

# Verify [Unreleased] is empty and [1.0.0] has entries
# Check 3 lines after Unreleased (header, empty line, next header)
if grep -A 2 "\[Unreleased\]" "$TEST_DIR/CHANGELOG.md" | grep -q "^- "; then
    echo "❌ [Unreleased] should be empty after bump"
    cat "$TEST_DIR/CHANGELOG.md"
    exit 1
fi

if ! grep -A 10 "\[1.0.0\]" "$TEST_DIR/CHANGELOG.md" | grep -q "Feature A"; then
    echo "❌ [1.0.0] should contain Feature A"
    exit 1
fi
echo "✅ Release bump passed"

# Test 4: Orchestrator
echo ""
echo "Test 4: Orchestrator workflow"
mkdir -p "$TEST_DIR/.serena/memories"
cp "$TEST_DIR/CHANGELOG.md" "$TEST_DIR/CHANGELOG.md.backup"

python3 -m scripts.orchestrator "$TEST_DIR" feature "Orchestrator test feature" --scope=test --category=testing

# Verify CHANGELOG updated
if ! grep -q "Orchestrator test feature" "$TEST_DIR/CHANGELOG.md"; then
    echo "❌ Orchestrator should have updated CHANGELOG"
    exit 1
fi
echo "✅ Orchestrator passed"

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "========================================="
echo "✅ All integration tests passed!"
echo "========================================="
