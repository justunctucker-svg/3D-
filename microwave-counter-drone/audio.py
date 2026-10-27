#!/usr/bin/env python3
"""Synthesized sound design for the microwave counter-drone explainer, driven by the same clocks as microwave.js
(the swarm clock in the hook / final shot / beat 05, and video time elsewhere). Writes a 48 kHz stereo WAV:
    python3 audio.py audio.wav
The video loops, so the sound does too: the final shot (24–26 s) and the hook (0–2 s) are cut from one continuous
buffer on the hook clock h, there are no fades across the seam, and every filter is circular. Only numpy is needed.
Every one of the 49 swarm drones is a voice: its motors buzz until the wave or the cone's edge reaches it, then it
crackles, spins down and hits the ground on the same frame the picture shows."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 26.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261027)
G = 9.81


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


# ---------------------------------------------------------------- the swarm (mirrors microwave.js)
def rnd(i, j):
    x = np.sin(i * 127.1 + j * 311.7) * 43758.5453
    return x - np.floor(x)
NSW, VSW, TAU = 49, 11.0, 2 * np.pi
OFF = np.array([[((i % 7) - 3) * 1.55 + (rnd(i, 1) - 0.5) * 0.8, 2.6 + rnd(i, 2) * 4.4 + (i // 7) * 0.35, (i // 7) * 2.4 + (rnd(i, 3) - 0.5) * 1.4] for i in range(NSW)])
PH = np.array([rnd(i, 4) * TAU for i in range(NSW)])
def alive(i, c, z0):
    c = np.asarray(c, float)
    return np.stack([OFF[i, 0] + 0.22 * np.sin(c * 1.3 + PH[i]), OFF[i, 1] + 0.16 * np.sin(c * 2.1 + PH[i] * 1.7), z0 + OFF[i, 2] - VSW * c + 0 * c], -1)
HOOK_WAVE, WAVE_V, WAVE_C = 0.12, 120.0, np.array([0, 1.5, -3.0])
Z0_HOOK, Z0_SWARM = 17.0, 30.0
HOOK_HIT = np.array([HOOK_WAVE + np.linalg.norm(alive(i, 0.4, Z0_HOOK) - WAVE_C) / WAVE_V for i in range(NSW)])
PANEL_C = np.array([0.9, 2.55, 0.35])
SWEEP_A, SWEEP_B = 0.45, 1.5
def sweep_az(c): return lerp(np.radians(-24), np.radians(24), smooth(span(c, SWEEP_A, SWEEP_B)))
def swarm_hit():
    out = []
    for i in range(NSW):
        p = alive(i, 1.0, Z0_SWARM); az = np.arctan2(p[0] - PANEL_C[0], p[2] - PANEL_C[2]) - np.radians(8.5)
        c = SWEEP_A + 0.05
        if az > sweep_az(c):
            lo, hi = SWEEP_A, SWEEP_B
            for _ in range(30):
                mid = (lo + hi) / 2
                if sweep_az(mid) >= az: hi = mid
                else: lo = mid
            c = hi
        out.append(c + rnd(i, 70) * 0.04)
    return np.array(out)
SWARM_HIT = swarm_hit()
def land_after(i, ch, z0):
    y = alive(i, ch, z0)[1]
    return np.sqrt(2 * max(0.01, y - 0.06) / G)
c5 = monotone([20.0, 20.6, 23.2, 24.0], [0.0, 0.42, 1.5, 2.15])
def c5_inv(c):
    lo, hi = 20.0, 24.0
    if c > float(c5(24.0)): return None
    for _ in range(40):
        mid = (lo + hi) / 2
        if float(c5(mid)) >= c: hi = mid
        else: lo = mid
    return hi


# ---------------------------------------------------------------- shared recipes
def crickets(n, density=1.0, seed=7):
    """Dusk field crickets: chirps of three or four pulses at ~4.5 kHz, several voices at different rates."""
    r = np.random.default_rng(seed); out = np.zeros((2, n)); k = np.arange(int(0.012 * SR)) / SR
    for v in range(int(5 * density)):
        f = 4200 + 700 * r.random(); period = 0.55 + 0.4 * r.random(); t0 = r.random() * period; pan = r.uniform(-0.7, 0.7); g = 0.5 + 0.5 * r.random()
        pulse_ = np.sin(2 * np.pi * f * k) * np.sin(np.pi * k / k[-1]) ** 2
        tt = t0
        while tt < n / SR:
            for p in range(3 + (v % 2)):
                i0 = int((tt + p * 0.032) * SR)
                if i0 + len(k) < n: out[0, i0:i0 + len(k)] += pulse_ * g * np.sqrt(1 - pan); out[1, i0:i0 + len(k)] += pulse_ * g * np.sqrt(1 + pan)
            tt += period * (0.9 + 0.2 * r.random())
    return out
def zap(rate=1.0, size=1.0):
    """A drone's electronics dying: a short electric crackle with a mains-like buzz, stretched in slow motion."""
    d = 0.03 / max(rate, 0.25); n = int(d * SR); k = np.arange(n) / SR
    cr = band(noise(n), 2500 * rate, 9500 * rate) * env(0.0005, 0.007 / rate, n)
    bz = np.tanh(3 * np.sin(2 * np.pi * 140 * rate * k)) * env(0.001, 0.012 / rate, n) * 0.35
    return (cr + bz) * size
def thud(rate=1.0):
    """A small drone hitting the field: a dull body thump plus a light carbon/plastic clatter."""
    n = int(0.35 / max(rate, 0.3) * SR); k = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(np.full(n, 95 * rate) + 120 * rate * np.exp(-k / 0.01)) / SR) * env(0.001, 0.04 / rate, n)
    clat = band(noise(n), 900 * rate, 5000 * rate) * env(0.0005, 0.018 / rate, n) * 0.6
    clat2 = np.roll(band(noise(n), 1200 * rate, 6000 * rate) * env(0.0005, 0.01 / rate, n) * 0.3, int(0.045 / rate * SR))
    return body + clat + clat2
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


def swarm_audio(clock, rate, hits, z0, cam, buf, t_of_clock, slow=False):
    """The swarm on a buffer: 12 buzz voices (drones grouped by column), each falling silent with its drones;
    per-drone crackles at the hit, counter ticks, and ground impacts."""
    n = len(clock); step = 48
    cc = clock[::step]; rr = np.interp(np.arange(0, n, step), np.arange(n), rate)
    spins, gains, xs = np.zeros((NSW, len(cc))), np.zeros((NSW, len(cc))), np.zeros(NSW)
    for i in range(NSW):
        ce = np.minimum(cc, hits[i]); p = alive(i, ce, z0)
        dist = np.linalg.norm(p - cam, axis=-1)
        gains[i] = clamp(10.0 / np.maximum(dist, 6.0), 0, 1.4)
        spins[i] = np.where(cc < hits[i], 1.0, np.exp(-(cc - hits[i]) / 0.25))
        xs[i] = OFF[i, 0]
    BL, BR = buf
    wash = np.zeros(n)
    for v in range(12):
        members = [i for i in range(NSW) if i % 12 == v]
        amp = np.interp(np.arange(n), np.arange(0, n, step)[:len(cc)], (spins[members] * gains[members]).sum(0) / 4.0)
        sp = np.interp(np.arange(n), np.arange(0, n, step)[:len(cc)], spins[members].mean(0))
        f0 = 168 + 9 * v + 6 * rnd(v, 90)
        freq = f0 * (0.3 + 0.7 * sp) * rate * (1 + 0.004 * np.sin(2 * np.pi * (0.7 + 0.1 * v) * np.arange(n) / SR))
        ph = 2 * np.pi * np.cumsum(freq) / SR
        sig = sum((1 / k ** 1.15) * np.sin(k * ph + 0.3 * k) for k in range(1, 9)) * (1 + 0.28 * np.sin(2 * ph * 1.5))
        pan = float(clamp(np.mean(xs[members]) / 6.0, -0.6, 0.6))
        BL += sig * amp * 0.05 * np.sqrt(1 - pan); BR += sig * amp * 0.05 * np.sqrt(1 + pan)
        wash += amp
    pw = band(noise(n), 250 * min(1, rate.mean() + 0.3), 3200) * wash * 0.012
    BL += pw; BR += pw
    for i in range(NSW):
        th = t_of_clock(hits[i])
        if th is None: continue
        r_ = float(np.interp(th * SR, np.arange(n), rate))
        g = float(clamp(10.0 / max(6.0, np.linalg.norm(alive(i, hits[i], z0) - cam)), 0, 1.4))
        pan = float(clamp(OFF[i, 0] / 6.0, -0.7, 0.7))
        add(zap(r_, 1.0), 0.07 * g, pan, start=th, buf=buf)
        add(tick(2900 if not slow else 2400), 0.03, 0.4, start=th, buf=buf)
        tl = t_of_clock(hits[i] + land_after(i, hits[i], z0))
        if tl is not None: add(thud(r_), 0.12 * g, pan, start=tl, buf=buf)


# ================================================================ 1. the hook buffer (hook clock h ∈ [−2, 2)), looped
H0, H1 = -2.0, 2.0
NH = int((H1 - H0) * SR)
h = np.arange(NH) / SR + H0
HL, HR = np.zeros(NH), np.zeros(NH)
CAM_HOOK = np.array([0.4, 1.3, -1.5])
swarm_audio(h, np.ones(NH), HOOK_HIT, Z0_HOOK, CAM_HOOK, (HL, HR), lambda c: (c - H0), slow=False)
hb = (HL, HR)
add(crickets(NH, 1.0, 11), 0.006, buf=hb)
add(stereo_noise(80, 1200, 0.8, NH) * lfo(0.4, 0.4, NH), 0.012, buf=hb)                                  # light evening air
# the wave: a deep pressure "whumm", a rush that rolls out past the camera, a faint visualization shimmer
w0 = HOOK_WAVE - H0
add(reverb(boom(2.2, 62, 26, 0.7, 30, 600, 0.3, 0.8, 0.35), 2.0, 0.8, 0.4), 0.32, start=w0, buf=hb)
n = int(1.2 * SR); k = np.arange(n) / SR
rush = np.stack([band(noise(n), 120, 3500), band(noise(n), 120, 3500)]) * (np.exp(-((k - 0.12) / 0.09) ** 2) + 0.35 * np.exp(-k / 0.5) * smooth(k / 0.1))
add(rush, 0.07, start=w0 - 0.04, buf=hb)
shim = sum(np.sin(2 * np.pi * f * k + j) for j, f in enumerate((2210, 2790, 3350, 4420))) * env(0.02, 0.22, n) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * k))
add(shim, 0.006, 0.1, start=w0, buf=hb)
hook_buf = np.stack([HL, HR])
cut = int(-H0 * SR)
seg = hook_buf[:, cut:cut + int(2.0 * SR)].copy(); seg[:, -720:] *= np.linspace(1, 0, 720)     # 15 ms out into the rewind
add(seg, 1.0, start=0.0)                                                    # h ∈ [0, 2) → t ∈ [0, 2)
pre = hook_buf[:, :cut].copy(); pre[:, :240] *= np.linspace(0, 1, 240)                           # 5 ms in at the hard cut
add(pre, 1.0, start=24.0)                                                   # h ∈ [−2, 0) → t ∈ [24, 26)

# ================================================================ 2. rewind (2.0–2.6): VHS tape warble, the hook sucked backwards, glitches
n = int(0.6 * SR); k = np.arange(n) / SR
warble = np.sin(2 * np.pi * np.cumsum(900 * (1 - k / 0.6) ** 1.5 + 140 + 60 * np.sin(2 * np.pi * 9 * k)) / SR)
rev = hook_buf[:, cut:cut + int(2.0 * SR)][:, ::-1][:, ::int(2.0 / 0.6)][:, :n]                 # the whole hook, reversed at ~3×
rev = rev * (1 - k / 0.6) ** 1.2
glitch = np.zeros(n)
for j in range(8):
    c0 = int((0.04 + j * 0.065 + 0.02 * rng.random()) * SR); m = int(0.025 * SR)
    glitch[c0:c0 + m] += band(noise(m), 800 + 400 * j, 9000) * 0.9
add(rev, 0.9, start=2.0)
add(warble * pulse(k, 0, 0.03, 0.5, 0.6), 0.05, 0.1, start=2.0)
add(band(noise(n), 200, 3000) * (k / 0.6) ** 2.5 * (1 - smooth(span(k, 0.56, 0.6))), 0.07, -0.1, start=2.0)
add(glitch, 0.05, start=2.0)
add(np.stack([band(noise(n), 2000, 9000), band(noise(n), 2000, 9000)]) * (0.4 + 0.6 * clamp(np.sin(2 * np.pi * 15 * k))), 0.02, start=2.0)

# ================================================================ 3. why jamming fails (2.6–6.0): the drone, the jammer, the glancing arcs
ext1 = pulse(t, 2.55, 2.62, 5.92, 6.0)
add(crickets(N, 1.0, 21), 0.006 * ext1)
add(stereo_noise(80, 1200, 0.8) * lfo(0.4, 0.4), 0.012 * ext1)
u = t - 2.6; k1 = smooth(span(u, 1.05, 1.9))
motors = sum(tone(np.full(N, f) * (1 + 0.006 * np.sin(2 * np.pi * 0.9 * t + j)), [1, 0.55, 0.35, 0.22, 0.14, 0.09]) for j, f in enumerate((204, 209.5, 198, 214)))
add(motors, 0.035 * ext1 * lerp(1.0, 0.4, k1), -0.1)
add(band(noise(N), 300, 4000) * lfo(8, 0.3), 0.01 * ext1 * lerp(1.0, 0.35, k1))                          # prop wash
# the jammer: a harsh digital hiss under each red arc, aimed from the left
jam = pulse(t, 4.0, 4.15, 5.85, 6.0)
add(np.tanh(3 * np.sin(2 * np.pi * 61 * t)) * band(noise(N), 800, 6000) * 0.4 + band(noise(N), 1500, 9000) * 0.3, 0.012 * jam, -0.55)
for kk in range(5):
    t_arc, t_hit = 2.6 + 1.55 + kk * 0.36, 4.34 + kk * 0.36
    n = int(0.14 * SR); k = np.arange(n) / SR
    burst = (band(noise(n), 1200, 8000) * np.tanh(3 * np.sin(2 * np.pi * 420 * k)) + np.sin(2 * np.pi * np.cumsum(1900 - 1100 * k / 0.14) / SR)) * env(0.002, 0.05, n)
    add(burst, 0.06, -0.5, start=t_arc)
    n = int(0.25 * SR); k = np.arange(n) / SR                                                               # the glance off the airframe
    add(np.sin(2 * np.pi * 3100 * k) * env(0.0005, 0.03, n) * 0.5 + band(noise(n), 2500, 9000) * env(0.0005, 0.012, n), 0.05, 0.1, start=t_hit)
n1, n2 = int(0.09 * SR), int(0.16 * SR)                                                                     # "no radio link": a denied blip
add(np.concatenate([np.sin(2 * np.pi * 880 * np.arange(n1) / SR) * env(0.002, 0.03, n1), np.sin(2 * np.pi * 587 * np.arange(n2) / SR) * env(0.002, 0.05, n2)]), 0.03, -0.1, start=4.36)

# ================================================================ 4. the weapon (6–10): power unit, tiles sequencing, the beam forms and sweeps
ext2 = pulse(t, 5.95, 6.05, 9.9, 10.05)
add(crickets(N, 0.8, 31), 0.005 * ext2)
near = 1 - smooth(span(t, 8.1, 8.3))
add(tone(np.full(N, 50.0), [1, 0.6, 0.4, 0.25, 0.15]) + 0.6 * band(noise(N), 300, 2500) * lfo(2, 0.2), 0.03 * ext2 * lerp(0.45, 1.0, near))   # generator + cooling fans
tiles = smooth(span(t, 6.3, 7.1)) * ext2
for j in range(int(3.7 * 11)):                                                                                # the array phasing up: soft sequenced pips
    t0 = 6.3 + j / 11
    n = int(0.05 * SR); k = np.arange(n) / SR; f = [1318, 1568, 1976, 2349][j % 4]
    add(np.sin(2 * np.pi * f * k) * env(0.002, 0.012, n), 0.012 * float(tiles[int(t0 * SR)]) * lerp(0.5, 1.0, near[int(t0 * SR)]), 0.4 * np.sin(j * 0.9), start=t0)
n = int(0.6 * SR); k = np.arange(n) / SR
add(sum(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.6 * (k / 0.6) ** 2)) / SR) for f in (110, 165, 220)) * smooth(k / 0.55) * 0.5, 0.03, start=6.6)   # charging swell
add(reverb(boom(2.0, 85, 30, 0.6, 40, 900, 0.25, 0.9, 0.3), 2.2, 0.8, 0.45), 0.24, start=7.18)               # the beam forms
beam2 = smooth(span(t, 7.1, 7.6)) * ext2
az2 = np.radians(14) * np.sin((t - 7.3) * 1.4) * smooth(span(t, 7.6, 8.4))
bhum = tone(np.full(N, 55.0), [1, 0.5, 0.2]) * (0.7 + 0.3 * np.sin(7.0 * t)) + 0.4 * band(noise(N), 1500, 6000) * (0.5 + 0.5 * np.sin(7.0 * t)) ** 4
add(np.stack([bhum * np.sqrt(1 - np.sin(az2) * 2), bhum * np.sqrt(1 + np.sin(az2) * 2)]), 0.035 * beam2)

# ================================================================ 5. inside / overload (10–20, X-ray)
xr = pulse(t, 9.95, 10.1, 19.9, 20.0)
scan(9.9, True, 0.06, 0.15)
scan(19.85, False, 0.07, -0.15)
add(tone(np.full(N, 60.0), [1, 0.4, 0.3, 0.1]) * lfo(0.5, 0.2) + 0.3 * band(noise(N), 60, 400), 0.011 * xr)          # the X-ray room tone
spin = 1 - smooth(span(t, 18.6, 19.7))
mfreq = lambda f: np.full(N, f) * (0.12 + 0.88 * spin)
xmot = sum(tone(mfreq(f), [1, 0.5, 0.3, 0.18]) for f in (204, 209.5, 198, 214))
add(filt(xmot, None, 1100) * 1.4, 0.011 * xr * spin ** 0.6)                                                       # the hero's motors, muffled
coupling = smooth(span(t, 10.5, 11.2)) * (1 - smooth(span(t, 18.6, 19.4)))
fizz = np.stack([crackle(N, 220, 1500, 9000, 3.5), crackle(N, 220, 1500, 9000, 3.5)]) * 0.6 + stereo_noise(3000, 10000, 0.7) * 0.25
add(fizz, 0.045 * coupling * xr)                                                                               # energy coupling in: an electric fizz
n = int(4.4 * SR); k = np.arange(n) / SR
add(sum(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.5 * (k / 4.4) ** 2)) / SR) for f in (220, 277, 330)) * smooth(k / 1.5) * (1 - smooth(span(k, 4.25, 4.4))), 0.01, start=10.6)   # tension riser
n = int(1.6 * SR); k = np.arange(n) / SR
add(np.sin(2 * np.pi * np.cumsum(420 + 1100 * (k / 1.6) ** 2) / SR) * pulse(k, 0, 0.1, 1.3, 1.6), 0.014, 0.3, start=13.4)   # teaser riser
n = int(0.9 * SR); k = np.arange(n) / SR
add(band(noise(n), 200, 5000) * np.exp(-((k - 0.45) / 0.22) ** 2) + 0.4 * np.sin(2 * np.pi * np.cumsum(300 + 900 * k) / SR) * np.exp(-((k - 0.5) / 0.2) ** 2), 0.06, start=15.0)  # the push-in
surge = smooth(span(t, 15.0, 15.6)) * (1 - smooth(span(t, 18.4, 19.0)))
add(np.stack([crackle(N, 600, 2000, 11000, 3.5), crackle(N, 600, 2000, 11000, 3.5)]), 0.042 * surge)                # surges racing along the traces
for j in range(int(3.4 / 0.35)):
    t0 = 15.2 + j * 0.35; n = int(0.25 * SR); k = np.arange(n) / SR
    add(band(noise(n), 1500, 9000) * np.sin(np.pi * k / 0.25) ** 2 * (0.5 + 0.5 * np.sin(2 * np.pi * (30 + 90 * k) * k)), 0.018, 0.5 * np.sin(j * 1.3), start=t0)
fails = [(16.3, 0.6), (16.6, 0.7), (16.9, 1.0), (17.2, 0.6), (17.5, 0.6), (17.7, 0.85)] + [(17.9 + kk * 0.18 + oo * 0.05, 0.45) for kk in range(4) for oo in range(3)]
for t0, g in fails:                                                                                           # chips flash and die
    n = int(0.3 * SR); k = np.arange(n) / SR
    pop = band(noise(n), 1500, 12000) * env(0.0004, 0.02, n) + 0.6 * np.sin(2 * np.pi * np.cumsum(260 * np.exp(-k / 0.05) + 60) / SR) * env(0.001, 0.06, n)
    add(pop, 0.12 * g, float(rng.uniform(-0.4, 0.4)), start=t0 - 0.02)
flick = ((np.floor(t * 40) % 2) * pulse(t, 17.88, 17.9, 18.08, 18.1))
add(np.tanh(3 * np.sin(2 * np.pi * 120 * t)) * band(noise(N), 500, 3000) * 0.3, filt(0.02 * flick, None, 200))
n = int(1.3 * SR); k = np.arange(n) / SR
add(band(noise(n), 100, 900) * np.exp(-k / 0.5) * smooth(k / 0.05), 0.02, start=18.6)                           # props winding down

# ================================================================ 6. the swarm (20–24): beat 05 in slow motion
S0 = int(20.0 * SR); NS = int(4.0 * SR)
ts = t[S0:S0 + NS]; cs = c5(ts); rs = np.gradient(cs, 1 / SR)
SL, SR_ = np.zeros(NS), np.zeros(NS)
CAM_SW = np.array([0.3, 4.5, -5.3])
swarm_audio(cs, rs, SWARM_HIT, Z0_SWARM, CAM_SW, (SL, SR_), lambda c: (None if c5_inv(c) is None else c5_inv(c) - 20.0), slow=True)
sb = (SL, SR_)
add(crickets(NS, 1.0, 41), 0.006, buf=sb)
add(stereo_noise(80, 1200, 0.8, NS) * lfo(0.4, 0.4, NS), 0.012, buf=sb)
t_fire = c5_inv(SWEEP_A - 0.08) - 20.0
add(reverb(boom(3.0, 70, 22, 1.1, 30, 700, 0.5, 0.9, 0.5), 2.8, 1.0, 0.5), 0.34, start=t_fire, buf=sb)           # the beam fires (slowed)
bm = smooth(span(cs, SWEEP_A - 0.1, SWEEP_A))
az5 = sweep_az(cs)
hum5 = tone(np.full(NS, 40.0), [1, 0.5, 0.25]) * (0.7 + 0.3 * np.sin(3.0 * ts)) + 0.3 * band(noise(NS), 800, 4000) * (0.5 + 0.5 * np.sin(3.0 * ts)) ** 4
add(np.stack([hum5 * np.sqrt(1 - np.sin(az5) * 1.8), hum5 * np.sqrt(1 + np.sin(az5) * 1.8)]), 0.04 * bm, buf=sb)
s05 = np.stack([SL, SR_]); s05[:, -480:] *= np.linspace(1, 0, 480)                                                  # 10 ms out at the hard cut
add(s05, 1.0, start=20.0)

# ================================================================ 7. final caption (24–25.6): a soft chord over the approaching swarm, gone before the loop
n = int(1.85 * SR); k = np.arange(n) / SR
pad = sum(a * np.sin(2 * np.pi * f * k + j) for j, (f, a) in enumerate([(73.42, 1.0), (110.0, 0.7), (146.83, 0.55), (174.61, 0.35), (220.0, 0.3)]))
pad *= smooth(k / 0.3) * (1 - smooth(span(k, 1.2, 1.85)))
add(np.stack([pad, np.roll(pad, 90)]), 0.03, start=24.0)

# ================================================================ UI: step changes and callouts
for t0 in (2.65, 6.05, 10.05, 15.05, 20.05):
    blip(t0, 1568, 2093, 0.035)
for t0 in (3.0, 6.4, 8.3, 11.0, 15.7, 17.4):
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
hk = sorted(HOOK_HIT); sw = sorted(SWARM_HIT)
print('wrote', out, f' hook hits {hk[0]:.3f}–{hk[-1]:.3f} s, swarm hits t {c5_inv(sw[0]):.2f}–{c5_inv(sw[-1]):.2f} s')
