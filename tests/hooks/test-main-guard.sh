#!/usr/bin/env bash
# Test harness for .claude/hooks/main-guard.mjs
# PreToolUse hook (JS) that blocks edits/commits on main/master branch

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK_SCRIPT="$REPO_ROOT/.claude/hooks/main-guard.mjs"

PASS_COUNT=0
FAIL_COUNT=0
ORIGINAL_DIR="$PWD"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup_all() {
  cd "$ORIGINAL_DIR"
  [ -n "${TEMP_BASE:-}" ] && rm -rf "$TEMP_BASE"
}
TEMP_BASE=$(mktemp -d)
trap cleanup_all EXIT

# Creates a temp git repo at the given branch, returns path via stdout
# All git output redirected to /dev/null to keep stdout clean
setup_repo() {
  local branch="$1"
  local safe_branch="${branch//\//_}"
  local repo="$TEMP_BASE/$safe_branch"
  mkdir -p "$repo"
  git -C "$repo" init -q                              >/dev/null 2>&1
  git -C "$repo" config user.email "test@test.com"   >/dev/null 2>&1
  git -C "$repo" config user.name "Test"             >/dev/null 2>&1
  echo "init" > "$repo/README.md"
  git -C "$repo" add README.md                        >/dev/null 2>&1
  git -C "$repo" commit -q -m "init"                 >/dev/null 2>&1
  # Rename default branch to master/main or create feature branch
  local default
  default=$(git -C "$repo" branch --show-current 2>/dev/null)
  if [ "$branch" = "master" ] && [ "$default" != "master" ]; then
    git -C "$repo" branch -q -m "$default" master    >/dev/null 2>&1
  elif [ "$branch" = "main" ] && [ "$default" != "main" ]; then
    git -C "$repo" branch -q -m "$default" main      >/dev/null 2>&1
  elif [ "$branch" != "master" ] && [ "$branch" != "main" ]; then
    git -C "$repo" checkout -q -b "$branch"          >/dev/null 2>&1
  fi
  echo "$repo"  # only this goes to stdout
}

# Run the hook with given branch + JSON stdin, returns exit code
run_hook() {
  local branch="$1"
  local json="$2"
  local repo
  repo=$(setup_repo "$branch")
  local exit_code=0
  (cd "$repo" && echo "$json" | node "$HOOK_SCRIPT" 2>/dev/null) || exit_code=$?
  return $exit_code
}

assert_allows() {
  local name="$1" branch="$2" json="$3"
  local exit_code=0
  run_hook "$branch" "$json" || exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $name (expected exit 0, got $exit_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_blocks() {
  local name="$1" branch="$2" json="$3"
  local exit_code=0
  run_hook "$branch" "$json" || exit_code=$?
  if [ "$exit_code" -eq 2 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $name (expected exit 2, got $exit_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "=============================="
echo " main-guard.sh test suite"
echo "=============================="
echo ""

# --- Feature branch: everything allowed ---
assert_allows "feature branch → Edit allowed" \
  "feature/my-task" \
  '{"tool_name":"Edit","tool_input":{"file_path":"src/foo.ts"}}'

# --- main: write tools blocked ---
assert_blocks "main → Edit blocked" \
  "main" \
  '{"tool_name":"Edit","tool_input":{"file_path":"src/foo.ts"}}'

assert_blocks "main → Write blocked" \
  "main" \
  '{"tool_name":"Write","tool_input":{"file_path":"src/new.ts","content":""}}'

assert_blocks "main → MultiEdit blocked" \
  "main" \
  '{"tool_name":"MultiEdit","tool_input":[]}'

# --- master: write tools blocked ---
assert_blocks "master → Edit blocked" \
  "master" \
  '{"tool_name":"Edit","tool_input":{"file_path":"src/foo.ts"}}'

assert_blocks "master → Write blocked" \
  "master" \
  '{"tool_name":"Write","tool_input":{"file_path":"src/foo.ts","content":""}}'

# --- main: Bash read-only git → allowed ---
assert_allows "main → Bash: git status allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git status"}}'

assert_allows "main → Bash: git log allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git log --oneline -5"}}'

assert_allows "main → Bash: git diff allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git diff HEAD"}}'

assert_allows "main → Bash: git show allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git show HEAD"}}'

assert_allows "main → Bash: git branch allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git branch -a"}}'

# --- main: Bash write git → blocked ---
assert_blocks "main → Bash: git commit blocked" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"fix: typo\""}}'

assert_blocks "main → Bash: git push blocked" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git push"}}'

assert_blocks "main → Bash: git push --force blocked" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}'

# --- main: Bash non-git → allowed ---
assert_allows "main → Bash: bd ready allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"bd ready"}}'

assert_allows "main → Bash: npm test allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'

assert_allows "main → Bash: cat file allowed" \
  "main" \
  '{"tool_name":"Bash","tool_input":{"command":"cat src/foo.ts"}}'

# Summary
echo ""
echo "=============================="
echo " Results: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "=============================="

[ "$FAIL_COUNT" -eq 0 ] && exit 0 || exit 1
