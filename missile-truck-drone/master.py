#!/usr/bin/env python3
"""Loop-safe mastering: one fixed gain, then a memoryless soft clip with an exact ceiling.
    python3 master.py in.wav out.wav GAIN_DB [CEILING_DBFS]
y = c·tanh(g·x / c) treats every sample identically, so the end of a looping track still meets its start."""
import sys
import wave

import numpy as np

src, dst, gain_db = sys.argv[1], sys.argv[2], float(sys.argv[3])
c = 10 ** (float(sys.argv[4] if len(sys.argv) > 4 else -2.0) / 20)
with wave.open(src) as w:
    sr, ch = w.getframerate(), w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float64) / 32768.0
y = c * np.tanh(x * 10 ** (gain_db / 20) / c)
with wave.open(dst, 'wb') as w:
    w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(np.round(y * 32767).astype('<i2').tobytes())
