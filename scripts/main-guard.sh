#!/usr/bin/env bash
# main-guard.sh — PreToolUse hook
#
# Blocks direct file edits (Edit, Write, MultiEdit) on protected branches
# (master, main). Agents must work on a feature branch instead.
#
# Claude Code hook protocol:
#   stdin  — JSON payload { "tool_name": "...", "tool_input": {...}, ... }
#   exit 0 — allow the tool call
#   exit 2 — block the tool call; stdout is shown to the agent as the error

set -euo pipefail

EDIT_TOOLS=("Edit" "Write" "MultiEdit" "NotebookEdit")
PROTECTED_BRANCHES=("master" "main")

# Read and parse tool_name from stdin JSON (requires python3 or jq)
if command -v python3 &>/dev/null; then
  TOOL_NAME=$(python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
elif command -v jq &>/dev/null; then
  TOOL_NAME=$(jq -r '.tool_name // ""' 2>/dev/null || echo "")
else
  # Can't parse — allow
  exit 0
fi

# Only guard file-editing tools
IS_EDIT_TOOL=false
for t in "${EDIT_TOOLS[@]}"; do
  if [[ "$TOOL_NAME" == "$t" ]]; then
    IS_EDIT_TOOL=true
    break
  fi
done

if [[ "$IS_EDIT_TOOL" == "false" ]]; then
  exit 0
fi

# Check current git branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [[ -z "$CURRENT_BRANCH" ]]; then
  # Not a git repo — allow
  exit 0
fi

for protected in "${PROTECTED_BRANCHES[@]}"; do
  if [[ "$CURRENT_BRANCH" == "$protected" ]]; then
    echo "Direct edits on '${protected}' are not allowed. Create a feature branch first: git checkout -b feature/my-change"
    exit 2
  fi
done

exit 0
