#!/usr/bin/env python3
"""Synthesized sound design for the rocket engine explainer, driven by the same timeline as rocket.js.
Writes a 48 kHz stereo 16-bit WAV:   python3 audio.py audio.wav
The video loops, so the sound does too: the final shot (40–45 s) and the hook + hero (0–9 s) are cut from one
continuous "ignition" buffer on the shared shot clock s (s = t − 45 for the final, s = t for the start), there is
no fade in or out, and every filter is a circular FFT filter, so the last sample runs straight into the first.
Only numpy is needed."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 45.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261026)


def clamp(x, a=0.0, b=1.0): return np.minimum(b, np.maximum(a, x))
def span(x, a, b): return clamp((x - a) / (b - a))
def smooth(k): k = clamp(k); return k * k * (3 - 2 * k)
def lerp(a, b, k): return a + (b - a) * k
def pulse(x, a, b, c, d): return smooth(span(x, a, b)) * (1 - smooth(span(x, c, d)))


def band(x, lo=None, hi=None, order=2):
    """Zero-phase (circular) band-pass with Butterworth-like edges, normalized to unit RMS."""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    h = np.ones_like(f)
    if lo: h /= np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    if hi: h /= np.sqrt(1 + (f / hi) ** (2 * order))
    y = np.fft.irfft(np.fft.rfft(x) * h, len(x))
    return y / (np.sqrt(np.mean(y ** 2)) + 1e-12)


def noise(n=N): return rng.standard_normal(n)
def stereo_noise(lo, hi, width=0.6, n=N):
    c, l, r = band(noise(n), lo, hi), band(noise(n), lo, hi), band(noise(n), lo, hi)
    return np.stack([c * (1 - width) + l * width, c * (1 - width) + r * width])
def lfo(rate, depth, n=N):
    m = band(noise(n), None, rate, 2)
    return 1 + depth * m / (np.abs(m).max() + 1e-9)
def tone(freq, amps):
    ph = 2 * np.pi * np.cumsum(freq) / SR
    return sum(a * np.sin((k + 1) * ph + k * 0.7) for k, a in enumerate(amps))
def env(attack, tau, length):
    k = np.arange(length) / SR
    return clamp(k / max(attack, 1e-4)) * np.exp(-np.maximum(k - attack, 0) / tau)
def fftconv(a, b):
    n = len(a) + len(b) - 1
    return np.fft.irfft(np.fft.rfft(a, n) * np.fft.rfft(b, n), n)
def crackle(n, rate, lo=400, hi=5000, cap=8.0):
    """Rocket crackle: sparse heavy-tailed impulses through a short noise kernel."""
    imp = np.zeros(n); hits = rng.random(n) < rate / SR
    imp[hits] = np.minimum(rng.pareto(2.0, hits.sum()), cap) * rng.choice([-1, 1], hits.sum())
    k = rng.standard_normal(int(0.003 * SR)) * np.exp(-np.arange(int(0.003 * SR)) / (0.001 * SR))
    return band(np.convolve(imp, k, 'same'), lo, hi)
def boom(n, f0, f1, tau, noise_lo, noise_hi, noise_tau, noise_g):
    k = np.arange(n) / SR
    out = np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-k / 0.2)) / SR) * env(0.005, tau, n)
    return out + noise_g * band(noise(n), noise_lo, noise_hi) * env(0.002, noise_tau, n)
def reverb(x, secs=2.2, decay=0.5, mix=0.25):
    ir = band(noise(int(secs * SR)), 120, 4000) * np.exp(-np.arange(int(secs * SR)) / (decay * SR)) * 0.003
    return x + mix * fftconv(x, ir)[:len(x)]


L = np.zeros(N); R = np.zeros(N)
def add(sig, gain=1.0, pan=0.0, start=0.0):
    """Add a mono (pan −1…1) or stereo (2×n) signal at time `start`."""
    i0 = int(round(start * SR))
    if sig.ndim == 2:
        n = min(sig.shape[1], N - i0); L[i0:i0 + n] += sig[0, :n] * (gain[:n] if np.ndim(gain) else gain); R[i0:i0 + n] += sig[1, :n] * (gain[:n] if np.ndim(gain) else gain)
    else:
        n = min(len(sig), N - i0); g = gain[:n] if np.ndim(gain) else gain
        L[i0:i0 + n] += sig[:n] * g * np.sqrt(1 - pan); R[i0:i0 + n] += sig[:n] * g * np.sqrt(1 + pan)


# ================================================================ 1. the looped ignition buffer (shot clock s ∈ [−5, 9))
S0, S1 = -5.0, 9.0
NS = int((S1 - S0) * SR)
s = np.arange(NS) / SR + S0
IGN = -0.6                                                   # same ignition moment as rocket.js
fire = smooth(span(s, IGN, IGN + 1.0)) * (1 - smooth(span(s, 8.0, 8.7)))   # roar dies in the 8 s "rewind"
pump = smooth(span(s, IGN - 0.9, IGN + 0.4))
cold = 1 - smooth(span(s, IGN, IGN + 1.0))
SL = np.zeros(NS); SR_ = np.zeros(NS)
def sadd(sig, gain=1.0, pan=0.0, at=None):
    """Add into the ignition buffer (at = shot-clock time for short one-shots)."""
    global SL, SR_
    if at is not None:
        i0 = int(round((at - S0) * SR)); n = min(len(sig), NS - i0); sig = np.pad(sig[:n], (i0, NS - i0 - n))
    if sig.ndim == 2: SL += sig[0] * gain; SR_ += sig[1] * gain
    else: SL += sig * gain * np.sqrt(1 - pan); SR_ += sig * gain * np.sqrt(1 + pan)

# pre-start: floodlight hum, LOX boil-off venting, cryogenic creaks and pings
hum = tone(np.full(NS, 50.0), [0.5, 1.0, 0.4, 0.25])
sadd(hum * lfo(0.3, 0.1, NS), 0.006 * cold)
vent = stereo_noise(1800, 8000, 0.7, NS) * clamp(lfo(0.8, 0.9, NS) - 0.4)
sadd(vent, 0.035 * cold)
sadd(stereo_noise(60, 400, 0.8, NS) * lfo(0.2, 0.4, NS), 0.012 * (0.4 + 0.6 * cold))     # night air
for at, f, g in [(-4.6, 1850, 0.05), (-3.4, 1320, 0.04), (-2.5, 2260, 0.035), (-1.85, 1560, 0.045)]:
    n = int(0.6 * SR); k = np.arange(n) / SR
    ping = (np.sin(2 * np.pi * f * k) + 0.4 * np.sin(2 * np.pi * f * 2.76 * k)) * env(0.001, 0.12, n) + 0.6 * band(noise(n), 300, 2500) * env(0.001, 0.008, n)
    sadd(ping, g, 0.3 if f > 1600 else -0.3, at=at)
# turbopump spin-up (rising whine) that carries on under the roar
fp = 120 + 1500 * pump ** 1.3
sadd(tone(fp, [1, 0.35, 0.12]) + 0.5 * tone(fp * 1.006, [1, 0.3]), 0.03 * pump * (1 - 0.55 * fire), 0.15)
sadd(band(noise(NS), 500, 4000) * pump * (1 - 0.7 * fire), 0.02)
# ignition: igniter crack, then the big whump right as the screen flashes
n = int(0.12 * SR); sadd(band(noise(n), 1500, 9000) * env(0.0005, 0.02, n), 0.35, at=IGN - 0.02)
sadd(boom(int(3.0 * SR), 95, 34, 0.7, 80, 2200, 0.35, 1.1), 0.3, at=IGN + 0.1)
sadd(band(noise(int(1.5 * SR)), 300, 6000) * env(0.06, 0.45, int(1.5 * SR)), 0.22, at=IGN + 0.12)
# the roar: heavy low-mid rumble, mid roar, crackle; shakier and louder right after ignition
shake = np.exp(-np.maximum(s - IGN, 0) / 1.1) * (s > IGN)
roar = stereo_noise(30, 220, 0.6, NS) * 0.55 + stereo_noise(180, 1000, 0.7, NS) * 0.6 + stereo_noise(800, 3200, 0.7, NS) * 0.32 + stereo_noise(2600, 9000, 0.7, NS) * 0.12
sadd(roar * lfo(6, 0.12, NS), 0.11 * fire * (1 + 0.5 * shake))
sadd(crackle(NS, 140), 0.06 * fire, -0.1)
sadd(crackle(NS, 60, 150, 1200, 12), 0.05 * fire * (0.6 + 0.8 * shake), 0.1)
# 8 s rewind: the roar sweeps down like a tape stop as the X-ray view takes over
n = int(1.0 * SR); k = np.arange(n) / SR
stop = (band(noise(n), 60, 900) * 0.8 + 0.6 * np.sin(2 * np.pi * np.cumsum(420 * np.exp(-k / 0.22) + 30) / SR)) * pulse(k, 0, 0.05, 0.45, 0.95)
sadd(stop, 0.12, at=7.95)
buf_env = smooth(span(s, S0, S0 + 0.03)) * (1 - smooth(span(s, 8.85, 8.99)))   # click-free edges at the cuts (40 s and 9 s)
ign_buf = np.stack([SL * buf_env, SR_ * buf_env])
# place: s ∈ [−5, 0) → t ∈ [40, 45);   s ∈ [0, 9) → t ∈ [0, 9)
cut = int(-S0 * SR)
add(ign_buf[:, cut:], 1.0, start=0.0)
add(ign_buf[:, :cut], 1.0, start=40.0)

# ================================================================ 2. X-ray walk-through (8–34 s)
xray = smooth(span(t, 8, 8.8)) * (1 - smooth(span(t, 34, 34.8)))
def scan(t0, up, g, pan):
    n = int(1.6 * SR); k = np.arange(n) / SR; out = np.zeros(n)
    for j, c in enumerate([300, 800, 2000, 5000] if up else [5000, 2000, 800, 300]):
        out += band(noise(n), c * 0.6, c * 1.6) * np.exp(-((k - 0.18 - j * 0.14) / 0.16) ** 2) * (0.5 + 0.15 * j * up)
    shimmer = sum(np.sin(2 * np.pi * f * (1 + (0.03 if up else -0.03) * k) * k) for f in (1320, 1980, 2640, 3960)) * env(0.04, 0.45, n) * 0.18
    add(out * 0.5 + shimmer, g, pan, start=t0)
scan(7.85, True, 0.075, 0.15)
scan(33.85, False, 0.09, -0.15)
# quiet "inside the machine" drone under the whole X-ray section
drone = tone(np.full(N, 55.0), [1, 0.5, 0.3, 0.2]) * lfo(0.15, 0.2) + 0.6 * tone(np.full(N, 82.4), [1, 0.3])
add(drone, 0.028 * xray)
# tanks (8–14): propellant moving through the lines, a soft gurgle
gurgle = stereo_noise(180, 900, 0.8) * clamp(lfo(3.5, 1.2) - 0.6)
feed = np.where(t < 14, 0.16, lerp(0.16, 1.0, smooth(span(t, 14.3, 17.2)))) * smooth(span(t, 8.5, 9.5))
add(gurgle, 0.065 * xray * pulse(t, 8.5, 9.5, 20, 21.5))
add(stereo_noise(400, 3500, 0.7), 0.045 * xray * feed * (1 - smooth(span(t, 21.4, 21.6))))   # flow rush, rises with the pumps
# pumps (14–20): turbopump spins up from silence
pspin = smooth(span(t, 14.3, 17.0)) * (1 - smooth(span(t, 34.0, 34.8)))
fpump = 90 + 2000 * pspin ** 1.2
whine = tone(fpump, [1, 0.4, 0.15]) + 0.6 * tone(fpump * 1.5 * 1.004, [1, 0.3]) + 0.4 * tone(fpump * 0.25, [1, 0.6])
add(whine * lfo(5, 0.06), 0.04 * pspin * xray * (1 - 0.45 * smooth(span(t, 21.5, 22.5))), 0.2)
add(tone(fpump * 2.7, [1, 0.5, 0.3]), 0.006 * pspin * xray, -0.2)                               # impeller blade-pass buzz
# teaser riser into the combustion beat ("Next: the part that makes it 'work'")
n = int(2.0 * SR); k = np.arange(n) / SR
riser = band(noise(n), 800, 8000) * (k / 2.0) ** 2.2 + 0.4 * np.sin(2 * np.pi * np.cumsum(300 + 900 * (k / 2.0) ** 2) / SR) * (k / 2.0) ** 2
add(riser * (1 - smooth(span(k, 1.85, 2.0))), 0.05, start=19.5)
# injector spray hiss as the propellants reach the chamber
add(stereo_noise(3000, 10000, 0.5), 0.03 * pulse(t, 19.4, 20.2, 21.4, 21.6) + 0.008 * pulse(t, 21.6, 22, 26.5, 27.5))
# combustion (21.5 s): flash-cut boom, then slow motion (muffled, deep), then the roar opens back up
add(boom(int(4.0 * SR), 110, 30, 1.2, 60, 3000, 0.25, 1.2), 0.3, start=21.48)
add(band(noise(int(0.08 * SR)), 2000, 10000) * env(0.0005, 0.015, int(0.08 * SR)), 0.2, start=21.47)
slow = pulse(t, 21.55, 21.75, 24.0, 25.2)
cfire = smooth(span(t, 21.45, 21.9)) * (1 - smooth(span(t, 34.0, 34.8)))
croar = stereo_noise(30, 250, 0.6) * 0.6 + stereo_noise(200, 1100, 0.7) * 0.5 + stereo_noise(900, 4000, 0.7) * 0.22
deep = stereo_noise(25, 180, 0.5) * lfo(1.2, 0.4) + 0.5 * tone(np.full(N, 41.0), [1, 0.4]) * lfo(0.5, 0.3)
add(croar * lfo(7, 0.12), 0.09 * cfire * (1 - 0.85 * slow))
add(deep, 0.07 * cfire * slow)
add(reverb(np.sin(2 * np.pi * np.cumsum(np.full(int(3.2 * SR), 58.0) - np.arange(int(3.2 * SR)) / SR * 6) / SR) * env(0.3, 1.2, int(3.2 * SR)), 2.5, 0.8, 0.4), 0.06, start=21.8)
temp_rise = tone(220 * 2 ** (smooth(span(t, 21.5, 25.5)) * 1.0), [1, 0.3])                      # chamber temp climbing
add(temp_rise, 0.008 * pulse(t, 21.8, 22.6, 25.3, 26.2), 0.1)
add(crackle(N, 90), 0.03 * cfire * (1 - slow) * xray, 0.05)
# throat + nozzle (27–34): the gas accelerating — a rising jet whoosh synced to the speed readout
sp = smooth(span(t, 27.8, 33.2))
jet = np.zeros((2, N))
for c0, c1, w in [(350, 1400, 1.0), (700, 3000, 0.7), (1400, 6000, 0.45)]:
    lo = stereo_noise(c0 * 0.7, c0 * 1.4); hi = stereo_noise(c1 * 0.7, c1 * 1.4)
    jet += (lo * (1 - sp) + hi * sp) * w
add(jet, 0.05 * pulse(t, 27.4, 28.0, 33.6, 34.2))
add(tone(260 * 2 ** (sp * 1.6), [1, 0.4, 0.2]), 0.007 * pulse(t, 27.6, 28.2, 33.5, 34.0), -0.1)
n = int(0.5 * SR); k = np.arange(n) / SR
nwave = np.where(k < 0.006, 1.0, np.where(k < 0.012, -1.0, 0.0)) * 0.8 + band(noise(n), 200, 3000) * env(0.001, 0.04, n) * 0.5
add(reverb(nwave, 1.2, 0.3, 0.3), 0.12, start=27.65)                                               # Mach 1: a soft sonic crack
# UI: step changes and callout pops
def blip(t0, f1, f2, g, pan=0.0):
    n1, n2 = int(0.03 * SR), int(0.05 * SR)
    a = np.sin(2 * np.pi * f1 * np.arange(n1) / SR) * env(0.001, 0.01, n1)
    b = np.sin(2 * np.pi * f2 * np.arange(n2) / SR) * env(0.001, 0.015, n2)
    add(np.concatenate([a, np.zeros(int(0.02 * SR)), b]), g, pan, start=t0)
for t0 in (8.05, 14.05, 20.05, 27.05, 34.05):
    blip(t0, 1568, 2093, 0.05)
for t0 in (9.8, 10.1, 15.3, 15.6, 21.0, 27.7, 29.9):
    blip(t0, 2637, 3136, 0.018, 0.2)

# ================================================================ 3. the push (34–40 s): exterior roar, arrows, Earth vs vacuum
dead_stop = 1 - smooth(span(t, 39.99, 40.0))                                                        # hard cut to the final card, minus the click
push = smooth(span(t, 34.0, 34.9)) * dead_stop
proar = stereo_noise(30, 220, 0.6) * 0.55 + stereo_noise(180, 1000, 0.7) * 0.6 + stereo_noise(800, 3200, 0.7) * 0.32 + stereo_noise(2600, 9000, 0.7) * 0.12
split = smooth(span(t, 36.1, 36.6)) * dead_stop
# in the split screen the roar moves to the Earth side (left); the vacuum side keeps only a muffled, felt rumble
add(np.stack([proar[0] * (1 + 0.25 * split), proar[1] * (1 - 0.8 * split)]) * lfo(6, 0.12), 0.15 * push)
add(crackle(N, 140) * (1 - 0.6 * split), 0.07 * push, -0.1)
add(np.stack([np.zeros(N), band(noise(), 25, 140)]), 0.08 * split)
add(boom(int(2.0 * SR), 80, 40, 0.5, 100, 2500, 0.15, 0.8), 0.32, start=34.92)                      # arrows punch in
n = int(1.0 * SR); k = np.arange(n) / SR
slide = band(noise(n), 500, 6000) * np.exp(-((k - 0.35) / 0.18) ** 2)
add(np.stack([slide * (1 - k), slide * (0.3 + k)]), 0.09, start=35.9)                              # split-screen whoosh, right to left
# cut to the final card (40 s): the roar stops dead; a low boom with a long tail covers the cut
add(reverb(boom(int(3.5 * SR), 70, 30, 1.0, 80, 1500, 0.3, 0.6), 2.8, 0.9, 0.5), 0.3, start=40.0)

# ================================================================ master (no fades: the track loops)
for ch in (L, R):
    ch[:] = band(ch, 28, None, 3) * np.sqrt(np.mean(ch ** 2))                                       # drop sub-sonic rumble (circular)
mix = np.stack([L, R], 1)
mix = np.tanh(mix / 0.9) * 0.9
mix /= np.abs(mix).max() / 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'audio.wav'
with wave.open(out, 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
