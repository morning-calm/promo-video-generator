#!/bin/bash
# build.sh - turn rendered sub-frames (+ optional score.wav) into an H.264 / AAC mp4.
#   bash tools/build.sh <project> [output.mp4]
# Reads fps / duration / subframes / width / height from <project>/cues.json.  Looks for out/<name>/frames/*.jpg and out/<name>/score.wav.
#   CRF=18 (default; lower = bigger, better)   PRESET=slow (default)
# The S sub-frames of each frame are averaged with ffmpeg's tmix (that average IS the motion blur).  tmix averages the TRAILING window, so the
# frame we keep from each group is the last one: n%S == S-1.  JPEG frames are full-range, so they are converted to TV range (yuv420p, bt709) -
# without this players show a yuvj420p file with washed-out or crushed colours.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash tools/build.sh <project-dir> [output.mp4]"; exit 2; }
REPO="$(cd "$(dirname "$0")/.." && pwd)"; PROJ="$(cd "$1" && pwd)"; NAME="$(basename "$PROJ")"
OUTDIR="$REPO/out/$NAME"; OUT="${2:-$OUTDIR/$NAME.mp4}"
read -r FPS DUR S < <(node -e 'const c=require(process.argv[1]);console.log(c.fps||60,c.duration,c.subframes||4)' "$PROJ/cues.json")
N=$(node -e "console.log(Math.round($FPS*$DUR)*$S)")
COUNT=$(find "$OUTDIR/frames" -maxdepth 1 -name '*.jpg' 2>/dev/null | wc -l | tr -d ' ')  # find, not ls *.jpg: >~12k frames overflows macOS ARG_MAX
[ "$COUNT" -ge "$N" ] || { echo "Expected $N frames in $OUTDIR/frames but found $COUNT. Run: node tools/render.js $1 --frames"; exit 1; }
VF="scale=in_range=full:out_range=tv:flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709,format=yuv420p"
if [ "$S" -gt 1 ]; then VF="tmix=frames=$S,select='eq(mod(n,$S),$((S-1)))',setpts=N/($FPS*TB),$VF"; fi
AUDIO=(); if [ -f "$OUTDIR/score.wav" ]; then AUDIO=(-i "$OUTDIR/score.wav" -c:a aac -b:a 256k); else echo "(no $OUTDIR/score.wav - building a silent video)"; fi
mkdir -p "$(dirname "$OUT")"
ffmpeg -y -loglevel error -framerate $((FPS*S)) -i "$OUTDIR/frames/%06d.jpg" ${AUDIO[@]+"${AUDIO[@]}"} \
  -vf "$VF" -r "$FPS" -c:v libx264 -preset "${PRESET:-slow}" -crf "${CRF:-18}" -profile:v high -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -t "$DUR" -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,duration -of default=nw=1 "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
