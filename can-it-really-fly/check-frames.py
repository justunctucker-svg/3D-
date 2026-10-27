#!/usr/bin/env python3
"""Flags frames where the HTML overlay did not paint before the screenshot.
Every frame must show the off-white title and the stats-bar text.
Prints the bad frame numbers as a comma-separated list (empty when all frames are fine)."""
import glob, os, sys
from PIL import Image

bad = []
for path in sorted(glob.glob(os.path.join(sys.argv[1] if len(sys.argv) > 1 else 'frames', 'frame_*.png'))):
    f = int(os.path.basename(path)[6:11])
    im = Image.open(path).convert('RGB')
    def has_text(box):
        r, g, b = (ch.crop(box).getextrema()[1] for ch in im.split())
        return min(r, g, b) > 215          # near-white text, not cyan glass or orange flame
    ok = has_text((60, 75, 510, 165))
    ok = ok and has_text((90, 1395, 300, 1445))
    if not ok:
        bad.append(f)
print(','.join(map(str, bad)))
