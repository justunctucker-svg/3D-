#!/usr/bin/env python3
"""Synthesized sound design for the Refueling in Orbit explainer, driven by the same clocks as refuel.js (the hook
clock h in the hook and the last 0.4 s, video time t elsewhere) and by the same fuel, thruster and engine curves.
Writes a 48 kHz stereo WAV:
    python3 audio.py audio.wav
Space itself is silent, so the orbit scenes are scored as if heard through the hull: thruster thumps, valve clacks,
the slosh of the propellant and its flow through the line, with launches heard as they really sound. The video loops,
so the sound does too: the hook and the last 0.4 s are cut from one continuous buffer on the hook clock, there are no
fades across the seam, and every filter is circular. Only numpy is needed."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 30.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261028)


def clamp(x, a=0.0, b=1.0): return np.minimum(b, np.maximum(a, x))
def span(x, a, b): return clamp((np.asarray(x, float) - a) / (b - a))
def smooth(k): k = clamp(k); return k * k * (3 - 2 * k)
def lerp(a, b, k): return a + (b - a) * k
def pulse(x, a, b, c, d): return smooth(span(x, a, b)) * (1 - smooth(span(x, c, d)))


def filt(x, lo=None, hi=None, order=2):
    """Circular FFT band filter (no normalization)."""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    h = np.ones_like(f)
    if lo: h /= np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    if hi: h /= np.sqrt(1 + (f / hi) ** (2 * order))
    return np.fft.irfft(np.fft.rfft(x) * h, len(x))
def band(x, lo=None, hi=None, order=2):
    y = filt(x, lo, hi, order)
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
def reverb(x, secs=2.2, decay=0.5, mix=0.25):
    ir = band(noise(int(secs * SR)), 120, 4000) * np.exp(-np.arange(int(secs * SR)) / (decay * SR)) * 0.003
    return x + mix * fftconv(x, ir)[:len(x)]
def boom(secs, f0, f1, tau, noise_lo, noise_hi, noise_tau, noise_g, sweep=0.2):
    n = int(secs * SR); k = np.arange(n) / SR
    out = np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-k / sweep)) / SR) * env(0.004, tau, n)
    return out + noise_g * band(noise(n), noise_lo, noise_hi) * env(0.002, noise_tau, n)
def crackle(n, rate, lo=400, hi=5000, cap=8.0):
    imp = np.zeros(n); hits = rng.random(n) < rate / SR
    imp[hits] = np.minimum(rng.pareto(2.0, hits.sum()), cap) * rng.choice([-1, 1], hits.sum())
    k = rng.standard_normal(int(0.003 * SR)) * np.exp(-np.arange(int(0.003 * SR)) / (0.001 * SR))
    return band(np.convolve(imp, k, 'same'), lo, hi)


L = np.zeros(N); R = np.zeros(N)
def add(sig, gain=1.0, pan=0.0, start=0.0, buf=None):
    """Mix a mono (panned) or stereo signal into the track (or into buf = (L, R) of another length)."""
    if start is None: return
    BL, BR = (L, R) if buf is None else buf
    n_all = len(BL); i0 = int(round(start * SR))
    if i0 < 0: sig = sig[..., -i0:]; i0 = 0
    if sig.ndim == 2:
        n = min(sig.shape[1], n_all - i0); g = gain[i0:i0 + n] if np.ndim(gain) and len(gain) == n_all else (gain[:n] if np.ndim(gain) else gain)
        BL[i0:i0 + n] += sig[0, :n] * g; BR[i0:i0 + n] += sig[1, :n] * g
    else:
        n = min(len(sig), n_all - i0); g = gain[i0:i0 + n] if np.ndim(gain) and len(gain) == n_all else (gain[:n] if np.ndim(gain) else gain)
        BL[i0:i0 + n] += sig[:n] * g * np.sqrt(1 - pan); BR[i0:i0 + n] += sig[:n] * g * np.sqrt(1 + pan)


def monotone(xs, ys):
    """Fritsch–Carlson monotone cubic with flat, clamped ends (microwave.js monotone(xs, ys))."""
    xs, ys = np.asarray(xs, float), np.asarray(ys, float); n = len(xs)
    d = np.diff(ys) / np.diff(xs); m = np.zeros(n)
    for i in range(1, n - 1): m[i] = 0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2
    for i in range(n - 1):
        if d[i] == 0: m[i] = m[i + 1] = 0; continue
        a, b = m[i] / d[i], m[i + 1] / d[i]; s_ = a * a + b * b
        if s_ > 9: k = 3 / np.sqrt(s_); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]
    def f(x):
        x = np.asarray(x, float); i = np.clip(np.searchsorted(xs, x) - 1, 0, n - 2)
        h = xs[i + 1] - xs[i]; u = (x - xs[i]) / h; u2, u3 = u * u, u ** 3
        y = (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1]
        return np.where(x <= xs[0], ys[0], np.where(x >= xs[-1], ys[-1], y))
    return f




# ---------------------------------------------------------------- shared recipes
def tick(f=2900, g=1.0):
    n = int(0.008 * SR); k = np.arange(n) / SR
    return np.sin(2 * np.pi * f * k) * env(0.0003, 0.0025, n) * g
def scan(t0, up, g, pan):
    n = int(1.6 * SR); k = np.arange(n) / SR; out = np.zeros(n)
    for j, c in enumerate([300, 800, 2000, 5000] if up else [5000, 2000, 800, 300]):
        out += band(noise(n), c * 0.6, c * 1.6) * np.exp(-((k - 0.18 - j * 0.14) / 0.16) ** 2) * (0.5 + 0.15 * j * up)
    shimmer = sum(np.sin(2 * np.pi * f * (1 + (0.03 if up else -0.03) * k) * k) for f in (1320, 1980, 2640, 3960)) * env(0.04, 0.45, n) * 0.18
    add(out * 0.5 + shimmer, g, pan, start=t0)
def blip(t0, f1, f2, g, pan=0.0):
    n1, n2 = int(0.03 * SR), int(0.05 * SR)
    a = np.sin(2 * np.pi * f1 * np.arange(n1) / SR) * env(0.001, 0.01, n1)
    b = np.sin(2 * np.pi * f2 * np.arange(n2) / SR) * env(0.001, 0.015, n2)
    add(np.concatenate([a, np.zeros(int(0.02 * SR)), b]), g, pan, start=t0)





# ---------------------------------------------------------------- clocks and curves (mirror refuel.js)
REW0, REW_MID, REW1, FINAL0, END_CUT = 2.0, 2.25, 2.6, 26.6, 29.6
IGN, STAGE_T, MECO, ARRIVE, CONTACT, SETTLE, VALVE, FILL0, FULL = 2.72, 5.4, 7.4, 8.4, 12.0, 16.9, 20.9, 21.3, 26.0
X_IN, X_OUT, UNDOCK, TURN0, TURN1, BURN = 12.7, 24.5, 26.65, 27.2, 28.2, 28.2
TAU = 2 * np.pi
def rnd(i, j):
    x = np.sin(np.asarray(i, float) * 127.1 + j * 311.7) * 43758.5453
    return x - np.floor(x)
def win(a, b, ramp=0.008):
    """1 inside [a, b), with short ramps so hard cuts do not click."""
    return smooth(span(t, a, a + ramp)) * (1 - smooth(span(t, b - ramp, b)))
X = smooth(span(t, X_IN, X_IN + 0.6)) * (1 - smooth(span(t, X_OUT - 0.6, X_OUT)))
HOOK_FUEL = lambda hh: 56 + 9 * hh
fill = 12 + 88 * smooth(span(t, FILL0, FULL))                                  # LANDER FUEL during the transfer
settle_on = smooth(span(t, SETTLE, SETTLE + 0.3)) * (t < FINAL0)
alt = np.where(t < REW1, 0.0, monotone([0, 0.4, 1.2, 1.9, 2.7, 3.7, 4.7, 5.8], [0, 0, 55, 800, 15000, 80000, 230000, 400000])(t - REW1))
thin_air = smooth(span(alt, 800, 15000))


# ---------------------------------------------------------------- recipes
def roar(n, lo=18, hi=160):
    """Rocket engine at sea level: a heavy low rumble, ragged crackle and a mid roar."""
    low = stereo_noise(lo, hi, 0.4, n) * lfo(3, 0.35, n)
    crk = np.stack([crackle(n, 900, 150, 3000, 2.5), crackle(n, 900, 150, 3000, 2.5)]) * 0.55
    mid = stereo_noise(150, 2500, 0.6, n) * lfo(9, 0.3, n) * 0.55
    x = low + crk + mid; sd = x.std()
    return np.tanh(x / (2.4 * sd)) * 2.4 * sd                                    # rounded peaks: hard crackle edges overshoot in AAC
def hiss(n, lo=1500, hi=9000, width=0.6):
    return stereo_noise(lo, hi, width, n) * lfo(18, 0.25, n)
def clack(g=1.0):
    n = int(0.12 * SR); k = np.arange(n) / SR
    return (band(noise(n), 1500, 9000) * env(0.0004, 0.006, n) + 0.6 * np.sin(2 * np.pi * 1850 * k) * env(0.0005, 0.02, n) + 0.4 * np.sin(2 * np.pi * 420 * k) * env(0.001, 0.03, n)) * g
def thump(f0=70, f1=38, tau=0.18, g=1.0):
    return boom(0.6, f0, f1, tau, 60, 600, 0.04, 0.35) * g
def clunk():
    """Two ships meeting: a heavy low hit with ringing metal on top."""
    n = int(1.8 * SR); k = np.arange(n) / SR
    ring = sum(a * np.sin(2 * np.pi * f * k + j) * np.exp(-k / d) for j, (f, a, d) in enumerate([(312, 1.0, 0.6), (731, 0.7, 0.45), (1187, 0.5, 0.35), (1853, 0.35, 0.25), (2690, 0.2, 0.18)]))
    return reverb(boom(1.8, 64, 34, 0.3, 80, 1500, 0.06, 0.8) + 0.25 * ring * env(0.001, 1.0, n), 1.4, 0.4, 0.3)
def bloop(f0, f1, dur, g=1.0):
    n = int(dur * SR); k = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-k / (dur * 0.35))) / SR) * env(0.003, dur * 0.3, n) * g
def ticks_at(times, f, g, pan=0.0):
    for t0 in times: add(tick(f, 1.0), g, pan, start=float(t0))
def vent_env(clock, vi, wi):
    """The vent puffing on/off pattern of refuel.js (bursts of one period, on 60% of the time)."""
    per = 1.1 + 0.5 * rnd(vi, wi + 3); x = clock / per + rnd(vi, wi); b = np.floor(x); u = x - b
    on = (rnd(b, vi + wi * 7) < 0.6).astype(float)
    return on * smooth(u / 0.06) * (1 - 0.6 * smooth((u - 0.2) / 0.8))


# ================================================================ 1. the hook buffer (hook clock h ∈ [−1, 2)): docked, fuel flowing
H0, H1 = -1.0, 2.0
NH = int((H1 - H0) * SR)
h = np.arange(NH) / SR + H0
HL, HR = np.zeros(NH), np.zeros(NH)
hb = (HL, HR)
flow_h = stereo_noise(150, 1600, 0.5, NH) * lfo(1.3, 0.3, NH) + 0.8 * stereo_noise(55, 260, 0.4, NH) * lfo(7, 0.45, NH)
add(flow_h, 0.05, buf=hb)                                                      # propellant rushing through the line, felt through the hull
add(hiss(NH, 2500, 9000, 0.5) + 0.6 * stereo_noise(30, 90, 0.3, NH), 0.012, -0.3, buf=hb)   # the settling thrusters, steady and soft
for wi, pan in ((0, -0.45), (1, 0.45)):                                         # boil-off puffs from the vents
    for vi in range(3):
        add(band(noise(NH), 1800, 8000) * vent_env(h, vi, wi), 0.022, pan, buf=hb)
add(tone(np.full(NH, 1108.7), [1, 0.3]) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * h)), 0.0025, 0.1, buf=hb)   # the glowing seal singing faintly
add(np.stack([crackle(NH, 18, 2500, 9000, 2.0), crackle(NH, 18, 2500, 9000, 2.0)]), 0.012, buf=hb)    # frost ticking on cold metal
hf = HOOK_FUEL(h); idx = np.nonzero(np.diff(np.floor(hf)) > 0)[0] + 1        # the counter ticking up
for i in idx: add(tick(3150, 1.0), 0.011, 0.35, start=float(h[i] - H0), buf=hb)
hook_buf = np.stack([HL, HR])
cut = int(-H0 * SR)
add(hook_buf[:, cut:cut + int(2.0 * SR)], 1.0, start=0.0)                     # h ∈ [0, 2) → t ∈ [0, 2)
pre = hook_buf[:, cut - int(0.4 * SR):cut].copy(); pre[:, :240] *= np.linspace(0, 1, 240)
add(pre, 1.0, start=END_CUT)                                                  # h ∈ [−0.4, 0) → t ∈ [29.6, 30)

# ================================================================ 2. orbit hull drone (once high up, and in the hook; whole cycles in 30 s, so it loops)
orbit = np.where(t < REW_MID, 1.0, np.where(t >= END_CUT, 1.0, smooth(span(t, 5.8, 7.2))))
drone = tone(np.full(N, 55.0), [1, 0.5, 0.3]) * (0.8 + 0.2 * np.sin(2 * np.pi * t / 7.5)) + 0.6 * tone(np.full(N, 82.5), [1, 0.3]) + 0.5 * stereo_noise(40, 300, 0.5)[0] * lfo(0.3, 0.3)
add(drone, 0.03 * orbit * (1 - 0.4 * X))
add(stereo_noise(3000, 9000, 0.9) * lfo(0.2, 0.5), 0.006 * orbit * (1 - X))   # a thin high air, like cabin ventilation

# ================================================================ 3. rewind (2.0–2.6): the hook sucked backwards, then the launch rewinding down onto the pad
n = int(0.6 * SR); k = np.arange(n) / SR
warble = np.sin(2 * np.pi * np.cumsum(900 * (1 - k / 0.6) ** 1.5 + 140 + 60 * np.sin(2 * np.pi * 9 * k)) / SR)
rev = hook_buf[:, cut:cut + int(2.0 * SR)][:, ::-1][:, ::3][:, :int(0.25 * SR)]
add(rev * np.linspace(1, 0.3, rev.shape[1]), 0.9, start=REW0)
nr = int(0.35 * SR); kr = np.arange(nr) / SR
rroar = roar(nr)[:, ::-1] * (kr / 0.35) ** 1.5                                   # the launch roar played backwards, swelling as the rocket drops onto the pad
add(rroar, 0.08, start=REW_MID)
glitch = np.zeros(n)
for j in range(8):
    c0 = int((0.04 + j * 0.065 + 0.02 * rng.random()) * SR); m = int(0.025 * SR)
    glitch[c0:c0 + m] += band(noise(m), 800 + 400 * j, 9000) * 0.9
add(warble * pulse(k, 0, 0.03, 0.5, 0.6), 0.05, 0.1, start=REW0)
add(band(noise(n), 200, 3000) * (k / 0.6) ** 2.5 * (1 - smooth(span(k, 0.56, 0.6))), 0.07, -0.1, start=REW0)
add(glitch, 0.05, start=REW0)

# ================================================================ 4. 01: one take from the pad to orbit
add(stereo_noise(100, 2000, 0.8) * lfo(0.6, 0.4), 0.03 * win(REW1, 6.0) * (1 - smooth(span(alt, 50, 2000))))   # wind at the pad, left behind
n = int(0.3 * SR); add(band(noise(n), 2000, 9000) * env(0.01, 0.08, n), 0.02, 0.2, start=2.62)   # a last vent before ignition
add(reverb(boom(1.6, 58, 28, 0.5, 40, 1500, 0.2, 0.9), 1.8, 0.6, 0.3), 0.14, start=IGN)         # ignition
R1 = roar(N)
thin = np.stack([filt(R1[0], 90, 2200), filt(R1[1], 90, 2200)])                # higher up: thinner and further away
eng_b = smooth(span(t, IGN, IGN + 0.23)) * (1 - smooth(span(t, STAGE_T - 0.1, STAGE_T))) * win(REW1, 6.0)
add(R1, 0.12 * eng_b * (1 + 0.25 * smooth(span(t, 3.0, 3.4))) * (1 - thin_air))
add(thin, 0.085 * eng_b * thin_air)
n = int(1.2 * SR); k = np.arange(n) / SR                                        # staging: a sharp pyro bang and ringing metal
add(reverb(band(noise(n), 300, 8000) * env(0.0005, 0.02, n) * 1.5 + sum(np.sin(2 * np.pi * f * k) * np.exp(-k / d) for f, d in ((523, 0.4), (1290, 0.25), (2170, 0.15))) * 0.3 * env(0.001, 0.5, n), 1.0, 0.3, 0.25), 0.08, 0.1, start=STAGE_T)
add(thump(80, 40, 0.15), 0.07, start=STAGE_T + 0.1)                            # the ship's engines light
ship_eng = stereo_noise(25, 140, 0.4) * lfo(4, 0.3) + 0.35 * stereo_noise(140, 900, 0.5) * lfo(8, 0.3)
eng_l = smooth(span(t, STAGE_T + 0.1, STAGE_T + 0.25)) * (1 - smooth(span(t, MECO - 0.1, MECO + 0.05))) * (t < ARRIVE)
add(ship_eng, 0.09 * eng_l)                                                    # felt through the structure
add(reverb(boom(0.8, 48, 30, 0.25, 40, 400, 0.05, 0.3), 1.2, 0.5, 0.3), 0.06, start=MECO)        # engine cutoff
gl = span(t, STAGE_T + 0.1, MECO)                                              # the fuel draining away: a falling tone under the counter
f_drain = 900 * (1 - gl) + 220 * gl
add(np.tanh(2.2 * tone(f_drain, [1, 0.25])) * (0.75 + 0.25 * np.sin(2 * np.pi * 11 * t)), 0.009 * win(STAGE_T + 0.1, MECO + 0.05, 0.05), -0.25)

# ================================================================ 5. 02: the tanker arrives and docks
def rcs_burst(a, b, f, pan, g=0.07):
    e = pulse(t, a, a + 0.04, b - 0.05, b) * f
    add(hiss(N, 1500, 9000, 0.5), g * e, pan); add(thump(90, 50, 0.08), g * 0.8 * f, pan, start=a)
rcs_burst(7.55, 7.8, 0.5, 0.2, 0.035)                                           # the ship trimming its attitude after cutoff
rcs_burst(8.7, 9.2, 0.7, -0.5); rcs_burst(9.5, 9.7, 0.5, -0.3); rcs_burst(10.4, 11.0, 0.8, -0.15); rcs_burst(11.35, 11.8, 0.5, -0.1)
add(clunk(), 0.16, -0.05, start=CONTACT)
for j in range(6): add(clack(0.8), 0.04, float(np.sin(j * 1.9)) * 0.5, start=CONTACT + 0.06 + 0.045 * j)   # latches
n = int(0.6 * SR); add(band(noise(n), 1200, 7000) * env(0.02, 0.2, n), 0.03, start=CONTACT + 0.35)          # the seal pressurising

# ================================================================ 6. 03 + 04: inside the tank (X-ray)
n = int(1.0 * SR); k = np.arange(n) / SR
add(stereo_noise(200, 3000, 0.7, n) * np.sin(np.pi * k / 1.0) ** 2, 0.016, start=12.55)            # the push-in
scan(X_IN - 0.05, True, 0.06, 0.15); scan(X_OUT - 0.6, False, 0.05, -0.15)
add(tone(np.full(N, 60.0), [1, 0.4, 0.3, 0.1]) * lfo(0.5, 0.2) + 0.3 * band(noise(N), 60, 400), 0.024 * X)      # X-ray room tone
float_ = win(X_IN + 0.3, SETTLE + 0.6, 0.4)
add(tone(880 * (1 + 0.004 * np.sin(2 * np.pi * 0.3 * t)), [1, 0.2]) + 0.7 * tone(1318.5 * (1 + 0.005 * np.sin(2 * np.pi * 0.23 * t + 1)), [1]), 0.011 * float_)   # weightless shimmer
r2 = np.random.default_rng(11)
for t0 in np.arange(X_IN + 0.4, SETTLE, 0.33):                                 # wobbling blobs: soft low bloops
    tt = t0 + 0.2 * r2.random(); add(bloop(150 + 140 * r2.random(), 90, 0.18), 0.07, r2.uniform(-0.4, 0.4), start=tt)
for t0 in np.arange(X_IN + 0.6, SETTLE + 1.2, 0.45):                           # gas bubbles at the intake
    tt = t0 + 0.3 * r2.random(); add(bloop(700 + 500 * r2.random(), 1100 + 400 * r2.random(), 0.05), 0.026, r2.uniform(0.1, 0.5), start=tt)
add(stereo_noise(60, 400, 0.6) * lfo(0.4, 0.5), 0.02 * float_)               # a low, uneasy bed while nothing settles
for t0 in (13.45, 13.75):                                                      # WEIGHTLESS warning
    blip(t0, 880, 660, 0.02, 0.3)
n = int(1.2 * SR); k = np.arange(n) / SR
add(np.sin(2 * np.pi * np.cumsum(420 + 1100 * (k / 1.2) ** 2) / SR) * pulse(k, 0, 0.1, 0.95, 1.2), 0.014, 0.3, start=15.45)   # teaser riser
# the push: a firm thrum from the thrusters, held through the transfer
add(thump(70, 36, 0.3), 0.1, -0.1, start=SETTLE)
push = stereo_noise(28, 90, 0.3) * lfo(6, 0.25) + 0.5 * hiss(N, 2000, 8000, 0.5) * 0.4
add(push, 0.05 * settle_on * (1 - 0.5 * (t >= X_OUT)))
# blobs falling and splashing into the pool (the same blob sizes and delays as refuel.js)
TR, TY0, TY1, TBOT, Gs = 4.0, 8.0, 28.0, 6.2, 2.6
for i in range(26):
    big = i < 8; r = 0.9 + 0.75 * rnd(i, 1) if big else 0.18 + 0.3 * rnd(i, 1)
    y0 = TY0 + 0.6 + r + rnd(i, 4) * (TY1 - TY0 - 1.2 - 2 * r); delay = rnd(i, 8) * 0.9 * 0.8
    tfall = np.sqrt(2 * max(0.2, y0 - (TBOT + 4.5)) / (Gs * (1 if big else 1.25)))
    t0 = SETTLE + delay + tfall
    if big:
        n = int(0.5 * SR); k = np.arange(n) / SR
        add(bloop(170 + 60 * rnd(i, 2), 70, 0.5) + 0.5 * band(noise(n), 300, 2500) * env(0.002, 0.07, n), 0.05 * (0.6 + 0.4 * r / 1.65), float(rnd(i, 3) - 0.5) * 0.6, start=t0)
        add(band(noise(int(0.6 * SR)), 1500, 5000) * np.linspace(0, 1, int(0.6 * SR)) ** 2, 0.006, start=t0 - 0.6)   # the whoosh of the fall
    else:
        add(bloop(420 + 300 * rnd(i, 2), 250, 0.08), 0.02, float(rnd(i, 3) - 0.5) * 0.8, start=t0)
slosh = smooth(span(t, SETTLE + 1.1, SETTLE + 1.9)) * np.exp(-np.maximum(0, t - SETTLE - 2.9) / 1.6) * (t < X_OUT)
add(stereo_noise(70, 380, 0.5) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.15 * t)) ** 2, 0.05 * slosh)    # the pool sloshing
for t0 in np.arange(SETTLE + 1.3, SETTLE + 4.3, 0.16):                         # bubbles rising out of the liquid
    tt = t0 + 0.1 * r2.random(); dens = 1 - span(tt, SETTLE + 1.3, SETTLE + 4.3)
    if r2.random() < 0.3 + 0.7 * dens: add(bloop(500 + 300 * r2.random(), 1200 + 500 * r2.random(), 0.04), 0.012 * (0.4 + 0.6 * dens), r2.uniform(-0.3, 0.3), start=tt)

# ================================================================ 7. 04 → 05: the valve opens and the fuel flows across
add(clack(1.0), 0.07, 0.3, start=VALVE); add(thump(110, 60, 0.07), 0.05, 0.3, start=VALVE + 0.01)
n = int(0.4 * SR); add(band(noise(n), 800, 6000) * env(0.005, 0.1, n), 0.035, 0.3, start=VALVE + 0.02)
flowing = smooth(span(t, FILL0 - 0.1, FILL0 + 0.5)) * (1 - smooth(span(t, FULL, FULL + 0.25)))
pipe = stereo_noise(140, 1800, 0.5) * lfo(1.3, 0.3) + 0.85 * stereo_noise(50, 240, 0.4) * lfo(7, 0.45)
inside = 1 - smooth(span(t, X_OUT - 0.6, X_OUT))
add(pipe, 0.055 * flowing * inside)
muff = np.stack([filt(pipe[0], None, 500), filt(pipe[1], None, 500)]) * 1.6
add(muff, 0.045 * flowing * (1 - inside))                                     # outside: the flow heard through the hull
n = int(3.0 * SR); k = np.arange(n) / SR
add(stereo_noise(200, 3000, 0.7, n) * np.sin(np.pi * k / 3.0) ** 2, 0.02, start=22.3)   # the pull-back and the swing out
fi = np.floor(fill / 2); idx = np.nonzero(np.diff(fi) > 0)[0] + 1
ticks_at(t[idx][(t[idx] > FILL0) & (t[idx] < FULL + 0.1)], 3150, 0.009, 0.35)   # the counter climbing
for wi, pan in ((0, -0.4), (1, 0.4)):                                          # vents puffing on the approach, in the wide shot and at the end
    for vi in range(3):
        g = win(X_OUT - 0.3, FINAL0) if vi == 2 else (win(ARRIVE, 12.6) + win(X_OUT - 0.3, END_CUT))
        add(band(noise(N), 1800, 8000) * vent_env(t, vi, wi), 0.018 * g, pan)
add(clack(0.9), 0.05, 0.2, start=FULL); n = int(0.5 * SR); add(band(noise(n), 1000, 7000) * env(0.005, 0.12, n), 0.025, start=FULL + 0.02)
blip(FULL + 0.05, 1568, 2349, 0.03)                                            # full
add(np.sin(2 * np.pi * 1568 * np.arange(int(0.9 * SR)) / SR) * env(0.005, 0.35, int(0.9 * SR)) * 0.4, 0.02, start=FULL + 0.05)

# ================================================================ 8. undock, turn toward the Moon and burn
for j in range(4): add(clack(0.8), 0.04, float(np.cos(j * 1.3)) * 0.5, start=UNDOCK + 0.02 + 0.04 * j)
add(thump(75, 40, 0.2), 0.08, 0.15, start=UNDOCK + 0.08)
rcs_burst(UNDOCK, 27.3, 0.9, 0.25, 0.045)
rcs_burst(TURN0, 27.55, 0.7, -0.2, 0.04); rcs_burst(27.85, 28.15, 0.6, 0.2, 0.04)   # the turn: start it, stop it
add(reverb(boom(1.2, 52, 28, 0.4, 40, 1000, 0.1, 0.6), 1.4, 0.5, 0.3), 0.14, start=BURN)        # the engines light
dep = smooth(span(t, BURN, BURN + 0.25)) * win(BURN, END_CUT, 0.006)
add(ship_eng * (1 + 0.3 * span(t, BURN, END_CUT)), 0.12 * dep)
n = int(2.6 * SR); k = np.arange(n) / SR                                        # a soft chord under the final caption, gone before the loop
padc = sum(a * np.sin(2 * np.pi * f * k + j) for j, (f, a) in enumerate([(73.42, 1.0), (110.0, 0.7), (146.83, 0.55), (185.0, 0.35), (220.0, 0.3)]))
padc *= smooth(k / 0.3) * (1 - smooth(span(k, 1.9, 2.6)))
add(np.stack([padc, np.roll(padc, 90)]), 0.026, start=FINAL0)

# ================================================================ UI: step changes, chips and badges
for t0 in (2.65, ARRIVE + 0.05, 12.65, 16.85, 22.35):
    blip(t0, 1568, 2093, 0.035)
for t0 in (8.9, 9.5, 13.6, 14.4, 16.95, 17.6, 20.8, 25.2):
    blip(t0, 2637, 3136, 0.013, 0.2)

# ================================================================ master (no fades: the track loops)
for ch in (L, R):
    ch[:] = filt(ch, 28, None, 3)
mix = np.stack([L, R], 1)
mix /= np.abs(mix).max() / 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'audio.wav'
with wave.open(out, 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
