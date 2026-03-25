#!/bin/bash
# Auto-reindex GitNexus after git commit/merge operations
# Triggered as a PostToolUse hook on Bash tool calls

# Only process Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# Check if the command was a git commit or git merge
if echo "$TOOL_INPUT" | grep -qE '(git commit|git merge)'; then
  # Check if .gitnexus directory exists (project uses GitNexus)
  if [ -d ".gitnexus" ]; then
    npx gitnexus analyze --silent 2>/dev/null &
  fi
fi
