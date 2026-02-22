#!/bin/bash
# Hook: runs TypeScript check before any git commit command.
# Receives tool input as JSON on stdin from Claude Code.
# Exits non-zero to BLOCK the commit if tsc finds errors.

input=$(cat)

if echo "$input" | grep -q "git commit"; then
  npx tsc --noEmit
  exit $?
fi

exit 0
