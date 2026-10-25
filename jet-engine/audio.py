#!/usr/bin/env python3
"""Synthesized sound design for the turbofan explainer, driven by the same timeline as engine.js
(HP RPM, ignition, X-ray, scene changes). Writes a 48 kHz stereo 16-bit WAV.
    python3 audio.py audio.wav
Only numpy is needed; filters are zero-phase FFT filters."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 40.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261025)
FREQS = np.fft.rfftfreq(N, 1 / SR)


def clamp(x, a=0.0, b=1.0): return np.minimum(b, np.maximum(a, x))
def span(x, a, b): return clamp((x - a) / (b - a))
def smooth(k): k = clamp(k); return k * k * (3 - 2 * k)
def lerp(a, b, k): return a + (b - a) * k
def pulse(x, a, b, c, d): return smooth(span(x, a, b)) * (1 - smooth(span(x, c, d)))


def band(x, lo=None, hi=None, order=2):
    """Zero-phase band-pass with Butterworth-like magnitude edges."""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    h = np.ones_like(f)
    if lo: h /= np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    if hi: h /= np.sqrt(1 + (f / hi) ** (2 * order))
    y = np.fft.irfft(np.fft.rfft(x) * h, len(x))
    return y / (np.sqrt(np.mean(y ** 2)) + 1e-12)          # unit RMS, so layer gains read as levels


def noise(n=N): return rng.standard_normal(n)
def stereo_noise(lo, hi, width=0.6):
    c, l, r = band(noise(), lo, hi), band(noise(), lo, hi), band(noise(), lo, hi)
    return np.stack([c * (1 - width) + l * width, c * (1 - width) + r * width])
def lfo(rate, depth):
    """Slow random modulation around 1.0."""
    m = band(noise(), None, rate, 2)
    return 1 + depth * m / (np.abs(m).max() + 1e-9)
def tone(freq, amps):
    """Additive tone whose fundamental follows the per-sample frequency array."""
    ph = 2 * np.pi * np.cumsum(freq) / SR
    return sum(a * np.sin((k + 1) * ph + k * 0.7) for k, a in enumerate(amps))


# ---------------------------------------------------------------- timeline (mirrors engine.js)
rpm = np.zeros(N)
m = (t >= 4.4) & (t < 9.6); rpm[m] = 5600 * smooth(span(t[m], 4.4, 9.6))
m = (t >= 9.6) & (t < 16.5); rpm[m] = lerp(5600, 9800, smooth(span(t[m], 9.6, 16.5)))
m = t >= 16.5; rpm[m] = lerp(9800, 10000, smooth(span(t[m], 16.5, 18.5))) + 25 * np.sin(t[m] * 1.9) * smooth(span(t[m], 18, 19))
s = rpm / 10000                                     # spool level 0…1
xray = smooth(span(t, 10, 10.8)) * (1 - smooth(span(t, 31, 31.8)))
ign = smooth(span(t, 18.2, 19.0))
ext_thrust = smooth(span(t, 31.0, 32.0))            # exterior rear: jet roar dominates
final = smooth(span(t, 37.0, 37.08))                # cut to the final card
bed = (1 - 0.62 * final) * (1 - smooth(span(t, 38.6, 40.0)))   # engine bed ducks for the card, then fades

L = np.zeros(N); R = np.zeros(N)
def add(sig, gain=1.0, pan=0.0):
    """Add a mono (pan -1…1) or stereo (2×N) signal."""
    global L, R
    if sig.ndim == 2:
        L += sig[0] * gain; R += sig[1] * gain
    else:
        L += sig * gain * np.sqrt(0.5 * (1 - pan)) * np.sqrt(2); R += sig * gain * np.sqrt(0.5 * (1 + pan)) * np.sqrt(2)
def at(t0, sig):
    """Place a short signal at time t0 into a full-length buffer."""
    out = np.zeros(N); i = int(t0 * SR); n = min(len(sig), N - i); out[i:i + n] = sig[:n]; return out
def env(attack, tau, length):
    """Linear attack (s) then exponential decay with time constant tau (s), over length samples."""
    k = np.arange(length) / SR
    return clamp(k / max(attack, 1e-4)) * np.exp(-np.maximum(k - attack, 0) / tau)
def fftconv(a, b):
    n = len(a) + len(b) - 1
    return np.fft.irfft(np.fft.rfft(a, n) * np.fft.rfft(b, n), n)


# ---------------------------------------------------------------- desert wind (exterior only)
wind = stereo_noise(40, 520, 0.8) * lfo(0.35, 0.45)
add(wind, 0.03 * (1 - xray) * (1 - 0.5 * ext_thrust))

# ---------------------------------------------------------------- starter + spool-up
starter = band(noise(), 900, 5000) * pulse(t, 4.25, 4.9, 6.5, 9.0)
add(starter, 0.03, -0.1)
add(at(4.28, band(noise(int(0.05 * SR)), 1500, 6000) * env(0.002, 0.012, int(0.05 * SR))), 0.12)   # starter valve click

# intake air: four noise bands that open up with spool speed; X-ray views muffle the top end
air = [stereo_noise(70, 380), stereo_noise(250, 1300), stereo_noise(1000, 4200), stereo_noise(3200, 11000)]
muffle = 1 - 0.55 * xray
w = [0.09 * s ** 0.7 * (1 + 0.3 * xray), 0.07 * s, 0.045 * s ** 1.5 * muffle, 0.022 * s ** 2 * muffle]
for a, g in zip(air, w): add(a * lfo(2.5, 0.12), g * bed * (1 - 0.45 * ext_thrust))

# turbine whine (HP spool) and fan blade-pass buzz, with a slightly detuned copy for beating
f_hp = 260 + 0.205 * rpm
whine = tone(f_hp, [1, 0.32, 0.1]) + 0.6 * tone(f_hp * 1.004, [1, 0.25])
whine_g = 0.02 * smooth(span(rpm, 200, 2500)) * (0.55 + 0.45 * s) * (1 - 0.55 * ext_thrust) * (1 - 0.25 * xray)
add(whine * lfo(4, 0.08), 1.0 * whine_g * bed, 0.05)
f_fan = 22 * (0.42 * rpm) / 60
buzz = tone(f_fan, [1, 0.5, 0.3, 0.18, 0.1])
add(buzz, 0.008 * smooth(span(rpm, 500, 4000)) * (1 - 0.5 * xray) * (1 - 0.6 * ext_thrust) * bed, -0.05)
hum = tone(0.42 * rpm / 60 + 1e-3, [1, 0.5, 0.25])
add(hum, 0.05 * s * bed)

# ---------------------------------------------------------------- X-ray scan whooshes (on at 10 s, off at 31 s)
def scan(t0, up):
    n = int(1.6 * SR); k = np.arange(n) / SR; out = np.zeros(n)
    centers = [300, 800, 2000, 5000] if up else [5000, 2000, 800, 300]
    for j, c in enumerate(centers):
        e = np.exp(-((k - 0.18 - j * 0.14) / 0.16) ** 2)
        out += band(noise(n), c * 0.6, c * 1.6) * e * (0.5 + 0.15 * j * up)
    glide = 1 + (0.03 if up else -0.03) * k
    shimmer = sum(np.sin(2 * np.pi * f * glide * k) for f in (1320, 1980, 2640, 3960)) * env(0.04, 0.45, n) * 0.18
    return at(t0, out * 0.5 + shimmer)
add(scan(9.85, True), 0.07, 0.15)
add(scan(30.85, False), 0.085, -0.15)

# ---------------------------------------------------------------- UI ticks on step changes, soft pops on callouts
def blip(t0, f1, f2, g):
    n1, n2 = int(0.03 * SR), int(0.05 * SR)
    a = np.sin(2 * np.pi * f1 * np.arange(n1) / SR) * env(0.001, 0.01, n1)
    b = np.sin(2 * np.pi * f2 * np.arange(n2) / SR) * env(0.001, 0.015, n2)
    return at(t0, np.concatenate([a, np.zeros(int(0.02 * SR)), b])) * g
for t0 in (4.0, 10.0, 17.0, 24.0, 31.0):
    add(blip(t0 + 0.05, 1568, 2093, 0.05))
for t0 in (5.2, 8.2, 11.6, 18.7, 25.0, 26.2, 27.9):
    add(blip(t0 + 0.1, 2637, 3136, 0.018), 1.0, 0.2)

# ---------------------------------------------------------------- combustor: fuel hiss, ignition, rumble
hiss = stereo_noise(2500, 9500, 0.5)
add(hiss, 0.035 * pulse(t, 17.45, 17.8, 18.6, 19.6) + 0.006 * pulse(t, 19.6, 20.0, 23.6, 24.2))
n = int(2.4 * SR); k = np.arange(n) / SR
thump = np.sin(2 * np.pi * np.cumsum(38 + 72 * np.exp(-k / 0.18)) / SR) * env(0.008, 0.38, n)
fwoomp = band(noise(n), 90, 1600) * env(0.07, 0.55, n)
add(at(18.22, thump), 0.2)
add(at(18.2, fwoomp), 0.17)
rumble_g = ign * (1 - 0.45 * ext_thrust) * bed * (0.8 + 0.2 * xray)
rumble = 0.8 * stereo_noise(35, 170, 0.5) * lfo(9, 0.35) + 0.6 * stereo_noise(150, 650, 0.5) * lfo(12, 0.4)
add(rumble, 0.085 * rumble_g)

# ---------------------------------------------------------------- jet roar + crackle (hot exhaust)
thrust = np.interp(t, [0, 18.3, 23.5, 30.5, 35.5, 40], [0, 0.32, 0.73, 0.85, 1.0, 1.0])
roar = stereo_noise(40, 260, 0.7) * 0.4 + stereo_noise(200, 1500, 0.7) * 0.55 + stereo_noise(1200, 5200, 0.7) * 0.25
roar_g = smooth(span(t, 18.6, 20.5)) * thrust * lerp(0.28, 1.0, ext_thrust) * (1 - 0.35 * xray) * bed
add(roar * lfo(1.5, 0.15), 0.1 * roar_g * (1 + 1.1 * ext_thrust))
imp = np.zeros(N)
hits = rng.random(N) < 70 / SR
imp[hits] = np.minimum(rng.pareto(2.2, hits.sum()), 8) * rng.choice([-1, 1], hits.sum())
kernel = rng.standard_normal(int(0.004 * SR)) * np.exp(-np.arange(int(0.004 * SR)) / (0.0012 * SR))
crackle = band(np.convolve(imp, kernel, 'same'), 500, 4500)
add(crackle, 0.045 * roar_g * (0.3 + 0.7 * ext_thrust), 0.1)

# ---------------------------------------------------------------- final card: low hit with a reverb tail and a soft glint
n = int(3.0 * SR); k = np.arange(n) / SR
hit = np.sin(2 * np.pi * np.cumsum(32 + 30 * np.exp(-k / 0.25)) / SR) * env(0.006, 0.9, n)
hit += 0.9 * band(noise(n), 120, 1800) * env(0.003, 0.1, n)
ir = noise(int(2.2 * SR)) * np.exp(-np.arange(int(2.2 * SR)) / (0.55 * SR))
tail = fftconv(hit, band(ir, 80, 3000) * 0.004)[:n]
glint = sum(np.sin(2 * np.pi * f * k) * 0.25 for f in (587.3, 880.0, 1174.7)) * env(0.02, 1.0, n)
add(at(37.0, hit), 0.2)
add(at(37.0, tail), 0.14)
add(at(37.05, glint) * (1 - smooth(span(t, 39.2, 40.0))), 0.022)

# ---------------------------------------------------------------- master
L, R = band(L, 28, None, 3) * np.sqrt(np.mean(L ** 2)), band(R, 28, None, 3) * np.sqrt(np.mean(R ** 2))   # drop sub-sonic rumble
mix = np.stack([L, R], 1)
mix = np.tanh(mix / 0.9) * 0.9                       # gentle saturation to tame peaks
mix /= np.abs(mix).max() / 0.89
fi, fo = int(0.03 * SR), int(0.4 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'audio.wav', 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[1] if len(sys.argv) > 1 else 'audio.wav')
