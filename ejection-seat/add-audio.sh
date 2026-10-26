#!/usr/bin/env bash
# Synthesizes the sound design (audio.py), brings it to about -14 LUFS (YouTube's playback target) and muxes it onto
# the silent render. Usage: bash add-audio.sh [silent.mp4] [out.mp4]
set -euo pipefail
cd "$(dirname "$0")"
IN=${1:-/output/ejection-seat-silent.mp4}
OUT=${2:-/output/ejection-seat.mp4}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 audio.py "$TMP/raw.wav"
# Loudness to -14.5 LUFS with one fixed gain plus a memoryless soft clip (master.py, -3.5 dBFS ceiling, headroom for AAC) instead of a
# time-varying limiter or dynamic normalization, so the end of the track still runs seamlessly into its start when
# the Short loops. Two passes, because the soft clip shaves a little loudness off the first guess.
lufs() { ffmpeg -hide_banner -i "$1" -af loudnorm=print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p' | python3 -c "import json, sys; print(json.load(sys.stdin)['input_i'])"; }
G=$(python3 -c "print(-14.5 - $(lufs "$TMP/raw.wav"))")
python3 master.py "$TMP/raw.wav" "$TMP/norm.wav" "$G" -3.5
G=$(python3 -c "print($G - 14.5 - $(lufs "$TMP/norm.wav"))")
python3 master.py "$TMP/raw.wav" "$TMP/norm.wav" "$G" -3.5
ffmpeg -y -v error -i "$IN" -i "$TMP/norm.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
