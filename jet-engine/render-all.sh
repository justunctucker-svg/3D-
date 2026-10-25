#!/usr/bin/env bash
# Renders all 1200 frames (40 s × 30 fps) in parallel chunks, re-renders any frame whose overlay failed to paint,
# then encodes the H.264 MP4. Usage: bash render-all.sh   (JOBS=4 and OUT=/output/jet-engine.mp4 by default)
set -euo pipefail
cd "$(dirname "$0")"
JOBS=${JOBS:-4}
TOTAL=1200
OUT=${OUT:-/output/jet-engine.mp4}

rm -rf frames && mkdir -p frames "$(dirname "$OUT")"
PER=$(( (TOTAL + JOBS - 1) / JOBS ))
for ((j = 0; j < JOBS; j++)); do
  A=$(( j * PER )); B=$(( A + PER - 1 )); (( B >= TOTAL )) && B=$(( TOTAL - 1 ))
  node render.js --frames "$A" "$B" --out frames > "frames/render_$j.log" 2>&1 &
done
wait

for pass in 1 2 3; do
  BAD=$(python3 check-frames.py frames)
  [[ -z "$BAD" ]] && break
  echo "re-rendering frames with a missing overlay (pass $pass): $BAD"
  node render.js --list "$BAD" --out frames
done

ffmpeg -y -loglevel error -framerate 30 -i frames/frame_%05d.png \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -an "$OUT"
echo "wrote $OUT"
