#!/usr/bin/env python3
"""Synthesized sound design for the booster landing explainer, driven by the same clock as booster.js
(s = real flight time since stage separation, touchdown at s = 460, played back at different speeds). Writes a 48 kHz
stereo WAV:
    python3 audio.py audio.wav
The video loops, so the sound does too: the end pre-roll (23.6–24 s) and the hook (0–2 s) are cut from one continuous
buffer on the hook clock h, there are no fades, and every filter is circular. Only numpy is needed."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 24.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261027)


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
def clank(secs, freqs, tau, g_noise=0.5):
    """Metallic hit: a few inharmonic partials plus a short noise burst."""
    n = int(secs * SR); k = np.arange(n) / SR
    out = sum(np.sin(2 * np.pi * f * k + j) * np.exp(-k / (tau / (1 + 0.4 * j))) for j, f in enumerate(freqs))
    return out / len(freqs) + g_noise * band(noise(n), 800, 7000) * env(0.0005, 0.012, n)


L = np.zeros(N); R = np.zeros(N)
def add(sig, gain=1.0, pan=0.0, start=0.0):
    if start is None: return
    i0 = int(round(start * SR))
    if sig.ndim == 2:
        n = min(sig.shape[1], N - i0); g = gain[i0:i0 + n] if np.ndim(gain) and len(gain) == N else (gain[:n] if np.ndim(gain) else gain)
        L[i0:i0 + n] += sig[0, :n] * g; R[i0:i0 + n] += sig[1, :n] * g
    else:
        n = min(len(sig), N - i0); g = gain[i0:i0 + n] if np.ndim(gain) and len(gain) == N else (gain[:n] if np.ndim(gain) else gain)
        L[i0:i0 + n] += sig[:n] * g * np.sqrt(1 - pan); R[i0:i0 + n] += sig[:n] * g * np.sqrt(1 + pan)


# ---------------------------------------------------------------- the clock and flight profile (mirrors booster.js)
def monotone(xs, ys):
    """Fritsch–Carlson monotone cubic with flat, clamped ends (booster.js monotone(xs, ys))."""
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


G, S_TD, DECEL = 9.81, 460.0, 14.0
S_LB = S_TD - 270 / DECEL
TWR_MAX = 3.2
FOOT = -(2.6 + 9.6 * np.cos(np.radians(125))) + 0.125
HOOK_RATE, HOOK0, REW0, REW1, FINAL0, END_CUT = 0.7, S_TD - 2.35, 2.0, 2.6, 22.0, 23.6
ALT_EARLY = monotone([-5, 0, 55, 160, 330, S_LB], [68000, 70000, 85000, 100000, 40000, 0.5 * DECEL * (S_TD - S_LB) ** 2])
SPD_EARLY = monotone([-5, 0, 28, 55, 160, 330, S_LB], [1680, 1667, 1650, 610, 360, 1190, 270])
main_s = monotone([2.6, 3.8, 5.0, 6.0, 10.0, 10.9, 13.4, 14.0, 14.6, 19.0, 20.6, 21.4, 22.0],
                  [-1.2, 1.0, 4.6, 8.0, 60.0, 100.0, 420.0, 437.0, S_LB, 452.5, 458.0, S_TD, S_TD + 0.28])
def alt_at(s): return np.where(s >= S_LB, 0.5 * DECEL * np.maximum(0, S_TD - s) ** 2, ALT_EARLY(s))
def speed_at(s): return np.where(s >= S_LB, DECEL * np.maximum(0, S_TD - s), SPD_EARLY(s))
def landing_burn(s): return np.where((s >= S_LB) & (s < S_TD), smooth(span(s, S_LB, S_LB + 0.6)), 0) * (1 - smooth(span(s, S_TD - 0.05, S_TD + 0.35)))
def flame_at(s): return np.where(s >= S_LB, smooth(span(s, S_LB, S_LB + 0.6)), 0) * np.where(s < S_TD, 1, (1 - smooth(span(s, S_TD - 0.05, S_TD + 1.0))) ** 1.5)
def boostback(s): return pulse(s, 30, 31.5, 53.5, 55)
def rcs_on(s): return pulse(s, 8, 9, 26, 28) + pulse(s, 58, 60, 100, 105)
def us_burn(s): return smooth(span(s, 3.5, 4.2))
def sep_dist(s): return np.where(s <= 0, 0, 0.6 * s * s + np.where(s > 3.5, 4.5 * (s - 3.5) ** 2, 0))

hook = (t < REW0) | (t >= END_CUT)
kk = smooth(span(t, REW0, REW1 - 0.05))
s = np.where(hook, HOOK0 + HOOK_RATE * np.where(t >= END_CUT, t - DUR, t),
             np.where(t < REW1, lerp(HOOK0 + HOOK_RATE * REW0, -1.0, 1 - (1 - kk) ** 2),
                      np.where(t >= FINAL0, S_TD + 0.3 + (t - FINAL0) * 0.8, main_s(t))))
xray = smooth(span(t, 14.0, 14.5)) * (1 - smooth(span(t, 19.0, 19.4)))
main = (~hook) & (t >= REW1)
alt, v, fl = alt_at(s), speed_at(s), flame_at(s)
def when(s_value):
    """First video time on the main (non-hook) timeline at which s reaches s_value."""
    idx = np.where(main & (s >= s_value))[0]
    return idx[0] / SR if len(idx) else None


# ---------------------------------------------------------------- shared recipes
def engine_roar(n, scale=1.0):
    """Sea-level kerosene engine: sub rumble, a broad roar, Merlin-style crackle and a hiss on top."""
    return (stereo_noise(22 * scale, 170 * scale, 0.5, n) * 0.9 + stereo_noise(140 * scale, 1100 * scale, 0.7, n) * 0.55
            + np.stack([crackle(n, 70, 180, 2600, 12), crackle(n, 70, 180, 2600, 12)]) * 0.42
            + stereo_noise(2000, 8000, 0.8, n) * 0.08) * lfo(7, 0.12, n)
def beeps(alt_arr, active, n):
    """Radar-altimeter beeps: the interval shrinks with altitude, from ~0.6 s at 2.6 km to ~0.1 s at the ground."""
    interval = 0.1 + 0.5 * clamp(alt_arr / 2600.0) ** 0.6
    phase = np.cumsum(active / interval) / SR
    starts = np.where(np.diff(np.floor(phase), prepend=np.floor(phase[0])) > 0)[0]
    out = np.zeros(n); m = int(0.04 * SR); k = np.arange(m) / SR
    for i in starts:
        if i + m >= n: continue
        f = 1500 + 500 * (1 - clamp(alt_arr[i] / 2600.0))
        out[i:i + m] += (np.sin(2 * np.pi * f * k) + 0.25 * np.sin(4 * np.pi * f * k)) * env(0.002, 0.012, m) * clamp((0.04 - k) / 0.008)
    return out


# ================================================================ 1. the hook buffer (hook clock h ∈ [−0.4, 2.0)), looped
H0, H1 = -0.4, 2.0
NH = int((H1 - H0) * SR)
h = np.arange(NH) / SR + H0
hs = HOOK0 + HOOK_RATE * h
halt = alt_at(hs); hfl = flame_at(hs)
h_eng = halt + FOOT
hit = hfl * clamp((32 - h_eng) / 22)
hroar = engine_roar(NH, 0.9)                                             # 0.7× slow motion: a touch lower
hbuf = hroar * (0.27 + 0.06 * hit)
hbuf += stereo_noise(70, 2600, 0.9, NH) * lfo(2.5, 0.35, NH) * (0.16 * hit)          # dust and gravel blasted off the pad
hbuf += stereo_noise(18, 60, 0.3, NH) * 0.12                                         # felt rumble (camera shake)
hb = beeps(halt, np.ones(NH), NH) * 0.03
hbuf += np.stack([hb * np.sqrt(0.7), hb * np.sqrt(1.3)])
cut = int(-H0 * SR)
seg = hbuf[:, cut:cut + int(REW0 * SR)].copy(); seg[:, -720:] *= np.linspace(1, 0, 720)       # 15 ms out into the rewind
add(seg, 1.0, start=0.0)                                                     # h ∈ [0, 2) → t ∈ [0, 2)
pre = hbuf[:, :cut].copy(); pre[:, :240] *= np.linspace(0, 1, 240)                             # 5 ms in at the hard cut
add(pre, 1.0, start=END_CUT)                                                 # h ∈ [−0.4, 0) → t ∈ [23.6, 24)

# ================================================================ 2. rewind (2.0–2.6): VHS tape warble, the roar sucked backwards, glitches
n = int(0.6 * SR); k = np.arange(n) / SR
warble = np.sin(2 * np.pi * np.cumsum(900 * (1 - k / 0.6) ** 1.5 + 140 + 60 * np.sin(2 * np.pi * 9 * k)) / SR)
rev = hbuf[:, cut + int(1.4 * SR):cut + int(2.0 * SR)][:, ::-1] * (1 - k / 0.6) ** 1.5         # the hook roar, reversed and draining away
rev_swell = band(noise(n), 200, 3000) * (k / 0.6) ** 2.5
glitch = np.zeros(n)
for j in range(8):
    c0 = int((0.04 + j * 0.065 + 0.02 * rng.random()) * SR); m = int(0.025 * SR)
    glitch[c0:c0 + m] += band(noise(m), 800 + 400 * j, 9000) * 0.9
add(rev, 0.8, start=REW0)
add(warble * pulse(k, 0, 0.03, 0.5, 0.6), 0.05, 0.1, start=REW0)
add(rev_swell * (1 - smooth(span(k, 0.56, 0.6))), 0.08, -0.1, start=REW0)
add(glitch, 0.05, 0.0, start=REW0)
add(np.stack([band(noise(n), 2000, 9000), band(noise(n), 2000, 9000)]) * (0.4 + 0.6 * clamp(np.sin(2 * np.pi * 15 * k))), 0.02, start=REW0)

# ================================================================ 3. the edge of space (2.6–10): hum, separation, the upper stage, flip, boostback
space = pulse(t, 2.55, 2.75, 12.2, 13.4) * main
add(tone(np.full(N, 36.0), [1, 0.5, 0.3, 0.15]) * lfo(0.3, 0.25), 0.09 * space)                 # low structural hum
add(stereo_noise(60, 500, 0.8) * lfo(0.25, 0.4), 0.05 * space)
add(stereo_noise(3000, 9000, 0.9) * lfo(0.5, 0.5), 0.004 * space)                               # faint electronics
t_sep, t_us = when(0.0), when(3.5)
add(reverb(boom(1.2, 150, 55, 0.25, 300, 4500, 0.06, 1.0), 1.8, 0.6, 0.35), 0.2, start=t_sep)   # pneumatic pushers
add(clank(1.4, [410, 663, 1187, 1730], 0.45, 0.6), 0.06, 0.15, start=t_sep + 0.02)
n = int(0.5 * SR); add(band(noise(n), 2500, 10000) * env(0.005, 0.12, n), 0.05, -0.1, start=t_sep)
# upper-stage engine: a deep muffled roar that swells, then recedes as the stage pulls away
us = us_burn(s) * main / (1 + sep_dist(s) / 60.0) * (1 - smooth(span(t, 5.7, 6.3)))
usr = filt(engine_roar(N, 0.6)[0], None, 700) * 2.2
add(np.stack([usr, usr]), 0.22 * us * np.sqrt(1 + 0.6 * clamp(t - 4.5)), 0.0)
add(reverb(boom(2.2, 70, 32, 0.8, 40, 900, 0.3, 0.8, 0.4), 2.2, 0.8, 0.4), 0.16, 0.25, start=t_us)
# cold-gas thrusters: short hissing bursts from the two pods, in step with the puffs on screen
for pod, (ph, pan) in enumerate([(0.0, -0.5), (2.0, 0.5)]):
    g1 = smooth(span(np.sin(s * 2.3 + ph), 0.1, 0.5)) * pulse(s, 8, 9, 26, 28)
    g2 = smooth(span(np.sin(2 * np.pi * 3.4 * t + ph), 0.1, 0.5)) * pulse(s, 58, 60, 100, 105)
    gate = filt((g1 + g2) * main, None, 60)
    add(band(noise(N), 1800, 10000) * 0.8 + band(noise(N), 400, 1800) * 0.3, 0.095 * clamp(gate), pan)
# boostback: three engines in near-vacuum, felt more than heard
bb = filt(boostback(s) * main, None, 30)
bbr = engine_roar(N, 0.55)
add(np.stack([filt(bbr[0], None, 900), filt(bbr[1], None, 900)]) * 1.6, 0.2 * clamp(bb))
t_bb = when(30.0)
add(reverb(boom(1.8, 90, 36, 0.6, 50, 1500, 0.2, 1.0, 0.3), 2.0, 0.7, 0.4), 0.17, start=t_bb)

# ================================================================ 4. grid fins (10–14): hydraulics, then the air thickens
t_f0, t_f1 = when(72.0), when(96.0)
if t_f0 and t_f1:
    n = int((t_f1 - t_f0 + 0.1) * SR); k = np.arange(n) / SR; kd = k / (t_f1 - t_f0)
    whine = tone(320 + 260 * clamp(kd), [1, 0.5, 0.3, 0.2]) + 0.5 * band(noise(n), 500, 3000)
    add(whine * pulse(kd, 0, 0.08, 0.9, 1.0), 0.045, 0.2, start=t_f0)
    add(clank(0.9, [520, 845, 1460, 2210], 0.3, 0.8), 0.11, 0.25, start=t_f1)
    add(clank(0.9, [495, 820, 1390, 2150], 0.3, 0.8), 0.09, -0.25, start=t_f1 + 0.05)
# re-entry wind scales with dynamic pressure (air density × speed²); buffeting rides on top
q = np.exp(-alt / 8000.0) * v ** 2
wind = clamp(filt(clamp(np.sqrt(q / 1.0e5)) * main * (1 - smooth(span(t, 21.2, 21.6))), None, 8))
bright = clamp(np.sqrt(q / 1.0e5))
add(stereo_noise(250, 4500, 0.8) * lfo(3.5, 0.35), 0.16 * wind * (1 - 0.6 * xray))
add(stereo_noise(30, 260, 0.6) * lfo(5, 0.5), 0.18 * wind * (1 - 0.5 * xray))
add(stereo_noise(3000, 9000, 0.9) * lfo(6, 0.4), 0.03 * wind * bright * (1 - xray))
for c0 in (11.3, 12.1, 12.9, 13.5):                                          # fin servo corrections
    n = int(0.28 * SR); k = np.arange(n) / SR
    add(tone(np.full(n, 640.0 + 90 * rng.random()) * (1 + 0.15 * np.sin(np.pi * k / 0.28)), [1, 0.4, 0.2]) * np.sin(np.pi * k / 0.28) ** 2, 0.018, 0.3 * rng.choice([-1, 1]), start=c0)
n = int(1.6 * SR); k = np.arange(n) / SR
add(np.sin(2 * np.pi * np.cumsum(420 + 1100 * (k / 1.6) ** 2) / SR) * pulse(k, 0, 0.1, 1.3, 1.6) + 0.4 * band(noise(n), 1500, 6000) * (k / 1.6) ** 2 * pulse(k, 0, 0.1, 1.3, 1.6), 0.016, 0.3, start=12.4)   # teaser riser

# ================================================================ 5. the landing burn (14–22): X-ray scan, relight, the roar, the beeps
def scan(t0, up, g, pan):
    n = int(1.6 * SR); k = np.arange(n) / SR; out = np.zeros(n)
    for j, c in enumerate([300, 800, 2000, 5000] if up else [5000, 2000, 800, 300]):
        out += band(noise(n), c * 0.6, c * 1.6) * np.exp(-((k - 0.18 - j * 0.14) / 0.16) ** 2) * (0.5 + 0.15 * j * up)
    shimmer = sum(np.sin(2 * np.pi * f * (1 + (0.03 if up else -0.03) * k) * k) for f in (1320, 1980, 2640, 3960)) * env(0.04, 0.45, n) * 0.18
    add(out * 0.5 + shimmer, g, pan, start=t0)
scan(13.9, True, 0.06, 0.15)
scan(18.9, False, 0.07, -0.15)
t_lb = when(S_LB)
add(reverb(boom(2.6, 95, 30, 0.9, 40, 3000, 0.25, 1.6, 0.3), 2.6, 0.9, 0.5), 0.42, start=t_lb)      # relight: the whump
n = int(0.12 * SR); add(band(noise(n), 1200, 9000) * env(0.0008, 0.03, n), 0.2, start=t_lb)
roar_env = clamp(filt(fl * main, None, 40))
h_eng = alt + FOOT
hitm = clamp(roar_env * clamp((32 - h_eng) / 22) * main)
roar = engine_roar(N)
muffled = np.stack([filt(roar[0], None, 700), filt(roar[1], None, 700)]) * 1.9                       # inside the X-ray view
near = 0.7 + 0.3 * smooth(span(t, 19.0, 20.6))
add(roar, 0.24 * roar_env * (1 - xray) * near * (1 + 0.25 * hitm))
add(muffled, 0.2 * roar_env * xray)
add(stereo_noise(70, 2600, 0.9) * lfo(2.5, 0.35), 0.17 * hitm)                                        # dust blasted off the pad
add(stereo_noise(18, 60, 0.3), 0.1 * roar_env * (1 - 0.5 * xray))
alive = main & (s < S_TD) & (s >= S_LB)
bp = beeps(alt, alive.astype(float), N) * 0.028
add(bp, 1.0, 0.3)
# legs: helium pneumatics, then four latches
t_l0, t_l1 = when(452.5), when(455.0)
if t_l0 and t_l1:
    n = int((t_l1 - t_l0 + 0.2) * SR); k = np.arange(n) / SR; kd = k / (t_l1 - t_l0)
    add(band(noise(n), 2200, 11000) * pulse(kd, 0, 0.06, 0.85, 1.05), 0.05, -0.2, start=t_l0)
    for j, pan in enumerate((-0.6, 0.6, -0.3, 0.3)):
        add(clank(0.8, [230 + 15 * j, 410, 760, 1300], 0.25, 0.9), 0.1, pan, start=t_l1 - 0.05 + 0.035 * j)
# touchdown: the thud, the crush cores, shutdown, a dust blast, then the "landed" chime
t_td = when(S_TD)
add(reverb(boom(2.0, 72, 26, 0.6, 40, 1600, 0.25, 1.5, 0.25), 2.4, 0.9, 0.45), 0.45, start=t_td)
n = int(0.18 * SR); add(band(noise(n), 300, 3500) * env(0.002, 0.06, n), 0.12, start=t_td)
n = int(2.6 * SR); k = np.arange(n) / SR
add(np.stack([band(noise(n), 90, 3500), band(noise(n), 90, 3500)]) * env(0.03, 0.9, n), 0.1, start=t_td + 0.02)
add(np.sin(2 * np.pi * np.cumsum(140 * np.exp(-k / 0.5) + 40) / SR) * env(0.01, 0.7, n), 0.06, start=t_td + 0.05)   # engine spool-down
n = int(1.4 * SR); k = np.arange(n) / SR
add(sum(np.sin(2 * np.pi * f * k) for f in (1568, 2349)) * env(0.002, 0.4, n), 0.03, 0.2, start=t_td + 0.18)
# aftermath (the final shot): settling dust, wind, cooling metal pings
after = smooth(span(t, 21.8, 22.4)) * (t < END_CUT)
add(stereo_noise(150, 3000, 0.9) * lfo(0.6, 0.4), 0.045 * after)
add(stereo_noise(40, 400, 0.7) * lfo(0.3, 0.4), 0.03 * after)
# a warm closing chord under "Flip. Fall. Burn. Land." (cut by the loop's hard cut back into the roar)
n = int((END_CUT - FINAL0) * SR); k = np.arange(n) / SR
pad = sum(a * np.sin(2 * np.pi * f * k + j) * (1 + 0.004 * np.sin(2 * np.pi * (0.3 + 0.1 * j) * k)) for j, (f, a) in enumerate([(73.42, 1.0), (110.0, 0.7), (146.83, 0.6), (185.0, 0.4), (220.0, 0.35), (293.66, 0.2)]))
pad *= smooth(k / 0.35) * clamp((END_CUT - FINAL0 - k) / 0.006)
add(np.stack([pad, np.roll(pad, 90)]), 0.05, start=FINAL0)
for c0 in (22.15, 22.6, 22.95, 23.3):
    n = int(0.5 * SR); k = np.arange(n) / SR; f = 3200 + 2400 * rng.random()
    add((np.sin(2 * np.pi * f * k) + 0.4 * np.sin(2 * np.pi * f * 1.51 * k)) * env(0.0005, 0.08, n), 0.012, rng.uniform(-0.5, 0.5), start=c0)

# ================================================================ UI: step changes and callouts
def blip(t0, f1, f2, g, pan=0.0):
    n1, n2 = int(0.03 * SR), int(0.05 * SR)
    a = np.sin(2 * np.pi * f1 * np.arange(n1) / SR) * env(0.001, 0.01, n1)
    b = np.sin(2 * np.pi * f2 * np.arange(n2) / SR) * env(0.001, 0.015, n2)
    add(np.concatenate([a, np.zeros(int(0.02 * SR)), b]), g, pan, start=t0)
for t0 in (2.65, 6.05, 10.05, 14.05, 19.05, 22.05):
    blip(t0, 1568, 2093, 0.04)
for t0 in (10.5, 14.7, 16.4, 19.3):
    blip(t0, 2637, 3136, 0.015, 0.2)

# ================================================================ master (no fades: the track loops)
for ch in (L, R):
    ch[:] = filt(ch, 28, None, 3)
mix = np.stack([L, R], 1)
mix /= np.abs(mix).max() / 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'audio.wav'
with wave.open(out, 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out, ' events:', {k: round(v, 2) for k, v in dict(separation=t_sep, upper_stage=t_us, boostback=t_bb, fins=t_f0, fins_locked=t_f1, relight=t_lb, legs=t_l0, legs_locked=t_l1, touchdown=t_td).items()})
