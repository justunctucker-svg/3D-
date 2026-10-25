#!/usr/bin/env bash
# Synthesizes the sound design (audio.py), normalizes it to -14 LUFS / -1.5 dBTP (YouTube's playback target)
# and muxes it onto the silent render. Usage: bash add-audio.sh [silent.mp4] [out.mp4]
set -euo pipefail
cd "$(dirname "$0")"
IN=${1:-/output/jet-engine-silent.mp4}
OUT=${2:-/output/jet-engine.mp4}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 audio.py "$TMP/raw.wav"
# two-pass EBU R128 loudness normalization, then a brick-wall limiter so the AAC encode can't clip
M=$(ffmpeg -hide_banner -i "$TMP/raw.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | python3 -c "import json, sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -v error -i "$TMP/raw.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,alimiter=limit=0.75:attack=2:release=60:level=false" -ar 48000 "$TMP/norm.wav"
ffmpeg -y -v error -i "$IN" -i "$TMP/norm.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
