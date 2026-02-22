#!/bin/bash
# Hook: kills any process on port 3000 before starting npm run dev.
# Receives tool input as JSON on stdin from Claude Code.
# Uses Windows netstat + taskkill (Git Bash compatible).

input=$(cat)

if echo "$input" | grep -q "npm run dev"; then
  pid=$(netstat -ano 2>/dev/null | grep ":3000 " | grep "LISTENING" | awk '{print $5}' | head -1)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    taskkill //F //PID "$pid" 2>/dev/null
  fi
fi

exit 0
