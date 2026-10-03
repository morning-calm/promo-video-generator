#!/bin/bash
# build.sh - runs tools/build.js, which does the work (Node, so the build also runs on Windows without bash).
exec node "$(dirname "$0")/build.js" "$@"
