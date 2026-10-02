#!/bin/bash
# new-project.sh - copy the starter into projects/<name> (a working 6 s video).   bash tools/new-project.sh my-launch
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: bash tools/new-project.sh <name>"; exit 2; }
REPO="$(cd "$(dirname "$0")/.." && pwd)"; DEST="$REPO/projects/$1"
[ ! -e "$DEST" ] || { echo "$DEST already exists"; exit 1; }
cp -R "$REPO/templates/starter" "$DEST"
echo "Created projects/$1  -  preview: node tools/render.js projects/$1 --stills 1,3"
