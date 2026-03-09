#!/usr/bin/env bash
# Claude Code PreToolUse hook — block writes/commits on main/master
# Exit 0: allow  |  Exit 2: block (message shown to user)
#
# Receives JSON on stdin: {"tool_name": "...", "tool_input": {...}}

BRANCH=$(git branch --show-current 2>/dev/null)

# Not in a git repo or not on a protected branch — allow
if [ -z "$BRANCH" ] || { [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; }; then
  exit 0
fi

# On main/master — read tool_name from stdin
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name' 2>/dev/null)

BLOCK_MSG="⛔ Direct edits on '$BRANCH' are not allowed.
Create a feature branch first: git checkout -b feature/<name>"

case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit)
    echo "$BLOCK_MSG" >&2
    exit 2
    ;;
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command' 2>/dev/null)
    # Block: git commit or git push (in any form)
    if echo "$CMD" | grep -qE '^git (commit|push)'; then
      echo "$BLOCK_MSG" >&2
      exit 2
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
