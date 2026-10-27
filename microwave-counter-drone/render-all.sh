#!/usr/bin/env bash
# Renders all 780 frames (26 s × 30 fps) with JOBS parallel Chromium processes (frames interleaved so the heavy
# sections are shared), re-renders any frame whose overlay failed to paint, then encodes the silent H.264 video.
# Usage: bash render-all.sh   (JOBS=4, OUT=/output/microwave-counter-drone.mp4)
set -euo pipefail
cd "$(dirname "$0")"
JOBS=${JOBS:-4}
TOTAL=780
OUT=${OUT:-/output/microwave-counter-drone.mp4}

rm -rf frames && mkdir -p frames "$(dirname "$OUT")"
for ((j = 0; j < JOBS; j++)); do
  LIST=$(seq -s, "$j" "$JOBS" $((TOTAL - 1)))
  node render.js --list "$LIST" --out frames > "frames/render_$j.log" 2>&1 &
done
wait

# anything a crashed or timed-out process left behind gets rendered here
MISSING=$(for ((f = 0; f < TOTAL; f++)); do [[ -f $(printf 'frames/frame_%05d.png' "$f") ]] || printf '%d,' "$f"; done)
if [[ -n "$MISSING" ]]; then echo "rendering missing frames: ${MISSING%,}"; node render.js --list "${MISSING%,}" --out frames; fi

for pass in 1 2 3; do
  BAD=$(python3 check-frames.py frames)
  [[ -z "$BAD" ]] && break
  echo "re-rendering frames with a missing overlay (pass $pass): $BAD"
  node render.js --list "$BAD" --out frames
done

ffmpeg -y -loglevel error -framerate 30 -i frames/frame_%05d.png \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -an "$OUT"
echo "wrote $OUT"
