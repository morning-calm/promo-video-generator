#!/bin/bash
# new-project.sh - runs tools/new-project.js, which does the work (Node, so it also runs on Windows without bash).
exec node "$(dirname "$0")/new-project.js" "$@"
