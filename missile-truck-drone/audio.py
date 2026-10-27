#!/usr/bin/env python3
"""Synthesized sound design for The Missile Truck Drone explainer, driven by the same clocks as drone.js (the world
clock w, with w = 0 at the drone's release; the hook and the last 2 s run on the hook clock h, w = h + 0.25).
Writes a 48 kHz stereo WAV:
    python3 audio.py audio.wav
The video loops, so the sound does too: the hook and the last 2 s are cut from one continuous buffer on the hook
clock, there are no fades across the seam, and every filter is circular. Only numpy is needed."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 27.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261029)


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
def jet(n):
    """A fighter's engines heard from close by: a deep rumble, a broad roar and a faint turbine whine."""
    return stereo_noise(25, 180, 0.4, n) * lfo(2, 0.25, n) + 0.7 * stereo_noise(180, 2800, 0.6, n) * lfo(5, 0.2, n) + 0.04 * tone(np.full(n, 3150.0), [1, 0.3])
def turbofan(n):
    """The drone's small engine: a brighter roar with a high whine."""
    return 0.6 * stereo_noise(120, 900, 0.5, n) * lfo(6, 0.25, n) + 0.5 * stereo_noise(900, 6000, 0.6, n) * lfo(11, 0.2, n) + 0.07 * tone(np.full(n, 5240.0), [1, 0.2])
def wind(n):
    return stereo_noise(250, 5000, 0.8, n) * lfo(0.7, 0.35, n)
def whirr(dur, f0, f1):
    n = int(dur * SR); k = np.arange(n) / SR
    return (np.tanh(2.5 * tone(f0 + (f1 - f0) * k / dur, [1, 0.4, 0.2])) * 0.5 + band(noise(n), 400, 3000) * 0.4) * np.sin(np.pi * k / dur) ** 0.5
def ping(f=1250, g=1.0):
    n = int(1.4 * SR); k = np.arange(n) / SR
    return reverb(np.sin(2 * np.pi * f * k) * env(0.002, 0.09, n), 1.4, 0.5, 0.5) * g


# ---------------------------------------------------------------- clocks and curves (mirror drone.js)
REW0, REW1, T_REL, SPLIT0, FINAL0, H_OFF = 2.0, 2.6, 7.2, 21.0, 25.0, 0.25
W_DOORS, W_DROP, W_IGN = 9.3, 9.95, 10.5
X_REL, V_F, DOME_EDGE_X = 6800, 300, 18000 - np.sqrt(7000 ** 2 - 3000 ** 2)
AHEAD = monotone([0, 0.4, 1.0, 2.0, 4.0, 7.0, 10.3, 14, 20], [0, 0, 4, 25, 150, 800, 2700, 4200, 7000])
DROP = monotone([0, 0.4, 0.9, 1.6, 3.0, 6.0], [0, -0.8, -3.2, -5.5, -6.5, -6])
def win(a, b, ramp=0.008):
    """1 inside [a, b), with short ramps so hard cuts do not click."""
    return smooth(span(t, a, a + ramp)) * (1 - smooth(span(t, b - ramp, b)))
def fighter_xz(ws):
    """The fighter's path: straight, then a banked turn back after the release (drone.js F_PATH)."""
    dw = 0.002; g = np.arange(-8, 18 + dw, dw); hd = np.radians(140) * smooth(span(g, 1.0, 7.0))
    x = X_REL - 8 * V_F + np.concatenate([[0], np.cumsum(V_F * np.cos(hd[:-1]) * dw)])
    z = np.concatenate([[0], np.cumsum(-V_F * np.sin(hd[:-1]) * dw)])
    return np.interp(ws, g, x), np.interp(ws, g, z)
def dist_display(ws):
    """DISTANCE FROM JET as the counter shows it (illustrative log scale)."""
    ws = np.asarray(ws, float); fx, fz = fighter_xz(ws)
    d = np.sqrt((X_REL + V_F * ws + AHEAD(ws) - fx) ** 2 + (-1.55 + DROP(ws) - 0.2 * np.sin(0.9 * ws)) ** 2 + fz ** 2) - np.hypot(0.4, 1.55)
    return np.where(ws <= 0, 0.0, 30 * np.log10(1 + np.maximum(0, d) / 5))
def counter_ticks(ws, ts, gain, pan, buf=None):
    shown = np.round(dist_display(ws)); idx = np.nonzero(np.diff(shown) != 0)[0] + 1
    last = -1.0
    for i in idx:
        if ts[i] - last < 0.035: continue                                     # the fast early climb: one tick per frame at most
        add(tick(3150, 1.0), gain, pan, start=float(ts[i]), buf=buf); last = ts[i]
w = t - T_REL                                                                  # world clock on the main timeline (not in the hook or the rewind)
X = smooth(span(t, 10.0, 10.6)) * (1 - smooth(span(t, 14.6, 15.2)))
TAC = smooth(span(t, 3.4, 4.4)) * (1 - smooth(span(t, 6.0, 6.8))) + smooth(span(t, 19.2, 20.2)) * (t < SPLIT0)
eng = smooth(span(w, 0.4, 0.6))
def over(*xs):
    """Sum mono sounds of different lengths."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs: out[:len(x)] += x
    return out
def latch(g=1.0):
    """The release hooks letting go: a sharp metal clack over a soft low knock."""
    return over(0.8 * clack(1.0), thump(95, 48, 0.12)) * g
def whoomp(g=1.0):
    return reverb(boom(1.4, 70, 34, 0.35, 100, 2500, 0.12, 0.7), 1.2, 0.4, 0.25) * g


# ================================================================ 1. the hook buffer (hook clock h ∈ [−2, 2.25), w = h + 0.25): carried, dropped, lit
H0, H1 = -2.0, 2.25
NH = int((H1 - H0) * SR)
h = np.arange(NH) / SR + H0
wh = h + H_OFF
at = lambda hh: hh - H0                                                        # hook time → offset in the buffer
HL, HR = np.zeros(NH), np.zeros(NH)
hb = (HL, HR)
add(jet(NH), 0.06 * (1 + 0.15 * pulse(wh, 1.0, 2.2, 5.6, 7.0)), buf=hb)       # the fighter right beside the camera the whole hook
add(wind(NH), 0.022, buf=hb)
add(latch(), 0.11, 0.05, start=at(-H_OFF), buf=hb)                             # w = 0: the drone drops off the pylon
add(band(noise(int(0.3 * SR)), 400, 3000) * env(0.005, 0.08, int(0.3 * SR)), 0.03, 0.1, start=at(-H_OFF + 0.01), buf=hb)
add(whirr(0.6, 500, 900), 0.02, 0.15, start=at(0.25 - H_OFF), buf=hb)            # wings swing out (w 0.25–0.85) …
add(over(clack(1.0), thump(140, 90, 0.05)), 0.05, 0.15, start=at(0.85 - H_OFF), buf=hb)   # … and lock
add(whirr(0.3, 900, 1400), 0.012, 0.2, start=at(0.3 - H_OFF), buf=hb)            # canards up (w 0.3–0.6)
add(clack(0.5), 0.025, 0.2, start=at(0.6 - H_OFF), buf=hb)
add(whoomp(), 0.08, 0.2, start=at(0.4 - H_OFF), buf=hb)                          # the drone's engine lights (w 0.4–0.6)
cam_d = np.sqrt((AHEAD(np.maximum(wh, 0)) + 0.4 + 38) ** 2 + (-1.55 + DROP(np.maximum(wh, 0)) - 3) ** 2 + 14 ** 2)
add(turbofan(NH), 0.075 * smooth(span(wh, 0.4, 0.6)) * (41 / cam_d) ** 1.3, 0.25, buf=hb)   # … and pulls away from the camera
add(stereo_noise(25, 120, 0.3, NH), 0.05 * pulse(wh, 0.6, 0.75, 1.4, 2.3), buf=hb)          # the surge (the camera shakes)
counter_ticks(wh, h - H0, 0.008, 0.35, buf=hb)
hook_buf = np.stack([HL, HR])
cut = int(-H0 * SR)
add(hook_buf[:, cut:cut + int(2.0 * SR)], 1.0, start=0.0)                     # h ∈ [0, 2) → t ∈ [0, 2)
pre = hook_buf[:, :cut].copy(); pre[:, :240] *= np.linspace(0, 1, 240)
add(pre, 1.0, start=FINAL0)                                                   # h ∈ [−2, 0) → t ∈ [25, 27)

# ================================================================ 2. rewind (2.0–2.6): the hook sucked backwards to before the launch
n = int(0.6 * SR); k = np.arange(n) / SR
rev = hook_buf[:, cut:cut + int(2.25 * SR)][:, ::-1][:, ::4]
add(rev * np.linspace(1, 0.35, rev.shape[1]), 0.85, start=REW0)
warble = np.sin(2 * np.pi * np.cumsum(900 * (1 - k / 0.6) ** 1.5 + 140 + 60 * np.sin(2 * np.pi * 9 * k)) / SR)
glitch = np.zeros(n)
for j in range(8):
    c0 = int((0.04 + j * 0.065 + 0.02 * rng.random()) * SR); m = int(0.025 * SR)
    glitch[c0:c0 + m] += band(noise(m), 800 + 400 * j, 9000) * 0.9
add(warble * pulse(k, 0, 0.03, 0.5, 0.6), 0.05, 0.1, start=REW0)
add(band(noise(n), 200, 3000) * (k / 0.6) ** 2.5 * (1 - smooth(span(k, 0.56, 0.6))), 0.07, -0.1, start=REW0)
add(glitch, 0.05, start=REW0)

# ================================================================ 3. the fighter and the air (01 and 02 close up; quiet in the tactical view)
close = win(REW1, SPLIT0, 0.05) * (1 - 0.85 * TAC)
add(jet(N), 0.06 * close * (1 - smooth(span(t, 8.2, 9.6))) * (1 + 0.15 * pulse(w, 1.0, 2.2, 5.6, 7.0)))
add(wind(N), 0.02 * close * (1 - 0.9 * X))

# ================================================================ 4. the tactical view (01, the end of 04, and 05): a low hum, the zone pulsing
tacg = TAC * win(REW1, SPLIT0) + win(SPLIT0, FINAL0)
add(tone(np.full(N, 55.0), [1, 0.5, 0.3]) + 0.6 * tone(np.full(N, 82.5), [1, 0.3]) + 0.5 * stereo_noise(40, 300, 0.5)[0] * lfo(0.3, 0.3), 0.032 * tacg)
add(stereo_noise(2500, 8000, 0.9) * lfo(0.3, 0.4), 0.004 * tacg)
beats = (np.pi / 2 + 2 * np.pi * np.arange(40)) / 4.2                          # the dome's beat (0.5 + 0.5 sin 4.2t) peaks
for tb in beats[(beats > REW1) & (beats < FINAL0 - 0.4)]:
    g = float(np.interp(tb, t, tacg))
    if g > 0.05: add(boom(0.5, 62, 42, 0.12, 80, 400, 0.03, 0.2), 0.05 * g, start=float(tb) - 0.03)
for t0 in (4.0, 19.7):                                                         # the reach ring draws on …
    nn = int(0.9 * SR); kk = np.arange(nn) / SR
    sw = band(noise(nn), 500, 6000) * np.sin(np.pi * kk / 0.9) ** 2 + 0.3 * np.sin(2 * np.pi * np.cumsum(600 + 900 * kk / 0.9) / SR) * np.sin(np.pi * kk / 0.9)
    add(sw, 0.018, -0.1, start=t0)
    add(ping(1250), 0.02, 0.1, start=t0 + 0.9)                                 # … and closes

# ================================================================ 5. 02: the release, the wings, the engine
add(latch(), 0.1, 0.05, start=T_REL)
add(band(noise(int(0.3 * SR)), 400, 3000) * env(0.005, 0.08, int(0.3 * SR)), 0.03, 0.1, start=T_REL + 0.01)
add(whirr(0.6, 500, 900), 0.02, 0.15, start=T_REL + 0.25)
add(over(clack(1.0), thump(140, 90, 0.05)), 0.05, 0.15, start=T_REL + 0.85)
add(whirr(0.3, 900, 1400), 0.012, 0.2, start=T_REL + 0.3)
add(clack(0.5), 0.025, 0.2, start=T_REL + 0.6)
add(whoomp(), 0.08, 0.2, start=T_REL + 0.4)
add(stereo_noise(25, 120, 0.3), 0.05 * pulse(t, 7.75, 7.9, 8.5, 9.3))          # the surge (the camera shakes)
counter_ticks(np.where((t >= REW1) & (t < SPLIT0), w, 0), t, 0.007 * (1 - 0.5 * X), 0.35)

# the drone's engine for the rest of the flight: close in the chase, muffled through the X-ray, left behind when the missile goes
fan = turbofan(N); fan_dull = np.stack([filt(fan[0], None, 700), filt(fan[1], None, 700)]) * 1.8
fg = 0.07 * eng * win(REW1, SPLIT0, 0.05) * (1 - 0.7 * smooth(span(t, 17.9, 19.0))) * (1 - 0.85 * TAC)
add(fan, fg * (1 - X))
add(fan_dull, 0.9 * fg * X)

# ================================================================ 6. 03: inside (X-ray)
scan(9.95, True, 0.06, 0.0)
scan(14.55, False, 0.05, 0.0)
add(tone(np.full(N, 110.0), [1, 0.4, 0.15]) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * t)), 0.016 * X)
add(stereo_noise(3000, 9000, 0.9), 0.004 * X)
nn = int(1.3 * SR); kk = np.arange(nn) / SR                                     # "Next: what it does at the edge." — a soft lift
riser = sum(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.25 * kk / 1.3)) / SR) for f in (660, 990, 1320)) / 3 + 0.5 * band(noise(nn), 1500, 7000)
add(riser * (kk / 1.3) ** 2 * (1 - smooth(span(kk, 1.15, 1.3))), 0.012, 0.0, start=13.4)

# ================================================================ 7. 04: into the zone, doors open, the missile drops and lights
cross = float(t[np.argmax((t > T_REL) & (X_REL + V_F * w + AHEAD(np.maximum(w, 0)) > DOME_EDGE_X))])   # the drone crosses the zone wall
inzone = smooth(span(t, cross, cross + 0.4)) * (1 - smooth(span(t, 19.0, 19.6))) * win(REW1, SPLIT0)
warn = tone(np.full(N, 220.0), [1, 0.3]) + tone(np.full(N, 233.1), [1, 0.3])
add(warn * (0.6 + 0.4 * np.sin(4.2 * t)), 0.009 * inzone, -0.1)
add(whirr(0.45, 300, 520), 0.03, 0.0, start=T_REL + W_DOORS)                   # doors swing open …
add(over(clack(0.7), thump(80, 45, 0.1)), 0.06, 0.0, start=T_REL + W_DOORS + 0.45)  # … and stop
add(stereo_noise(300, 3000, 0.6), 0.025 * pulse(t, T_REL + W_DOORS + 0.1, T_REL + W_DOORS + 0.45, 17.8, 18.4))   # air rushing past the open bay
add(latch(0.8), 0.08, 0.0, start=T_REL + W_DROP)                               # the missile lets go
ti = T_REL + W_IGN                                                              # 17.7: its motor lights
add(reverb(boom(1.6, 90, 30, 0.4, 200, 6000, 0.08, 1.0), 1.4, 0.5, 0.3), 0.1, 0.0, start=ti)
nr = int((SPLIT0 - ti) * SR); kr = np.arange(nr) / SR + ti
renv = smooth(span(kr, ti, ti + 0.08)) * (1 - 0.88 * smooth(span(kr, 19.0, 20.3))) * (1 - smooth(span(kr, SPLIT0 - 0.008, SPLIT0)))
add(roar(nr, 20, 200) * renv, 0.1, start=ti)
add(hiss(nr, 2000, 9000, 0.5) * renv, 0.03, start=ti)
add(stereo_noise(25, 120, 0.3), 0.05 * pulse(t, 17.5, 17.6, 18.0, 18.6))

# ================================================================ 8. 05: side by side — the fighter on the left flies into the red, both launch
nn = int(0.9 * SR); kk = np.arange(nn) / SR
add(thump(60, 35, 0.25), 0.08, start=SPLIT0)
add(band(noise(nn), 400, 6000) * env(0.002, 0.18, nn), 0.035, start=SPLIT0)
s = t - SPLIT0
fx_l = 6400 + 6300 * smooth(span(s, 0.2, 2.3))
alarm = smooth(span(fx_l, DOME_EDGE_X - 300, DOME_EDGE_X + 600)) * win(SPLIT0, FINAL0)
gate = (np.sin(2 * np.pi * 4 * t) > 0.2).astype(float); gate = filt(gate, None, 300)
add(np.tanh(2.0 * tone(np.where(np.sin(2 * np.pi * 2 * t) > 0, 1100.0, 880.0), [1, 0.3, 0.15])) * gate, 0.008 * alarm, -0.6)   # the left side's alarm
for pan in (-0.55, 0.55):                                                     # both launch at the same moment
    nl = int((FINAL0 - SPLIT0 - 2.45) * SR); kl = np.arange(nl) / SR
    add(roar(nl, 30, 300) * (smooth(span(kl, 0, 0.05)) * np.exp(-kl / 0.9) * (1 - smooth(span(kl, kl[-1] - 0.008, kl[-1])))), 0.04, pan, start=SPLIT0 + 2.45)
    add(boom(0.8, 90, 40, 0.15, 200, 4000, 0.05, 0.6), 0.04, pan, start=SPLIT0 + 2.45)

# ================================================================ 9. the end card ("Launch. Carry. Release."): a soft chord over the hook lead-in
nc = int(1.6 * SR); kc = np.arange(nc) / SR
chord = sum(a * tone(np.full(nc, f), [1, 0.25]) for f, a in ((146.8, 1.0), (220.0, 0.8), (293.7, 0.6), (370.0, 0.45), (440.0, 0.35)))
add(reverb(chord * env(0.03, 0.6, nc) * (1 - smooth(span(kc, 1.1, 1.6))), 1.2, 0.4, 0.3)[:nc] * (1 - smooth(span(kc, 1.45, 1.6))), 0.02, start=FINAL0)

# ================================================================ UI: step changes and chips
for t0 in (2.65, 6.05, 10.05, 15.05, 21.05):
    blip(t0, 1568, 2093, 0.035)
for t0 in (3.7, 7.0, 8.1, 11.0, 11.6, 12.2, 19.8, 21.6):
    blip(t0, 2637, 3136, 0.013, 0.2)
for t0, pan in ((4.1, -0.1), (15.6, -0.1), (21.55, -0.5)):                    # the red chips: lower
    blip(t0, 1175, 880, 0.016, pan)

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
