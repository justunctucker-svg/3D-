#!/usr/bin/env python3
"""Synthesized sound design for the Can It Really Fly? explainer, driven by the same clocks as flight.js (the flight
clock T in the hook / final shot, video time t elsewhere) and by the same jet and air-left curves. Writes a 48 kHz
stereo WAV:
    python3 audio.py audio.wav
The video loops, so the sound does too: the final shot (25–27 s) and the hook (0–2 s) are cut from one continuous
buffer on the hook clock, there are no fades across the seam, and every filter is circular. Only numpy is needed."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 27.0
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



# ---------------------------------------------------------------- clocks and curves (mirror flight.js)
REW0, REW1, FINAL0, END_CUT, HOOK_RATE = 2.0, 2.6, 25.0, 26.6, 0.35
VX, APEX = 7.0, 5.6
T_LAND = np.sqrt(2 * APEX / G)
TAU = 2 * np.pi
def rnd(i, j):
    x = np.sin(np.asarray(i, float) * 127.1 + j * 311.7) * 43758.5453
    return x - np.floor(x)
def air_at(tt):
    tt = np.asarray(tt, float)
    hk = (tt < REW0) | (tt >= FINAL0)
    T_ = HOOK_RATE * np.where(tt >= FINAL0, tt - DUR, tt)
    a = np.select([hk, tt < REW1, tt < 6.6, tt < 10.0, tt < 15.0, tt < 21.0],
                  [62 - 13.5 * T_, lerp(62 - 13.5 * HOOK_RATE * REW0, 100, smooth(span(tt, 2.05, 2.55))), 100 + 0 * tt,
                   100 - 5 * smooth(span(tt, 6.7, 9.8)), 95 - 33 * span(tt, 10.2, 15.0), 62 * (1 - span(tt, 15.1, 20.6)) ** 1.5],
                  9 * smooth(span(tt, 22.2, 25.0)))
    return np.maximum(a, 0)
def jet_hook(f, k):
    return pulse(f, -1.5, -1.3, 1.2, 1.35) * (1.0 if k < 6 else 0.75 if k < 8 else 0.35) * (0.85 + 0.15 * np.sin(f * 47 + k * 1.7))
def jet_main(tt, k):
    tt = np.asarray(tt, float); down = k < 6; a = air_at(tt)
    p = clamp(a / 22) ** 0.7
    sput = np.where(a < 22, np.where(rnd(np.floor(tt * 14), k) > 0.4 * (1 - a / 22), 1.0, 0.15), 1.0)
    return np.select([tt < 6.0, tt < 10.0, tt < 15.0, tt < 21.0],
                     [0 * tt, (0.8 * smooth(span(tt, 6.68, 6.85)) * (1 - smooth(span(tt, 9.75, 9.95)))) * down,
                      0.72 * (1 + 0.06 * np.sin(tt * 31 + k)) * down,
                      (1.0 if down else 0.25) * p * sput * smooth(span(tt, 15.0, 15.25))],
                     (0.22 * (1 - smooth(span(tt, 21.0, 21.75))) * (0.6 + 0.4 * rnd(np.floor(tt * 14), k))) * down)
def jets_main(tt):
    d = sum(jet_main(tt, k) for k in range(6)) / 6; o = sum(jet_main(tt, k) for k in range(6, 10)) / 4
    return d, o


# ---------------------------------------------------------------- shared jet recipe
def jet_hiss(n, lo=300, hi=10000, slow=1.0):
    """Cold-gas jet: a broadband hiss with fast turbulent flutter, a little crackle, and a body that roars underneath."""
    hs = stereo_noise(lo * slow, hi * slow, 0.7, n) * lfo(16 * slow, 0.3, n)
    cr = np.stack([crackle(n, 260, 1500 * slow, 9000 * slow, 3.5), crackle(n, 260, 1500 * slow, 9000 * slow, 3.5)]) * 0.22
    body = stereo_noise(60 * slow, 500 * slow, 0.5, n) * lfo(6 * slow, 0.35, n) * 0.55
    return hs + cr + body
def clack(g=1.0):
    n = int(0.12 * SR); k = np.arange(n) / SR
    return (band(noise(n), 1500, 9000) * env(0.0004, 0.006, n) + 0.6 * np.sin(2 * np.pi * 1850 * k) * env(0.0005, 0.02, n) + 0.4 * np.sin(2 * np.pi * 420 * k) * env(0.001, 0.03, n)) * g


# ================================================================ 1. the hook buffer (hook clock h ∈ [−2, 2), slow motion), looped
H0, H1 = -2.0, 2.0
NH = int((H1 - H0) * SR)
h = np.arange(NH) / SR + H0
Th = HOOK_RATE * h
HL, HR = np.zeros(NH), np.zeros(NH)
hb = (HL, HR)
cam = np.array([14.0, 1.4, -8.0])
Tc = np.clip(Th, -T_LAND, T_LAND)
car = np.stack([VX * Th, np.maximum(0, APEX - 0.5 * G * Tc ** 2) + 0.55, 0 * Th], -1)
prox = clamp(11.0 / np.linalg.norm(car - cam, axis=-1), 0, 1.4)
roll = TAU * smooth(span(Th, -1.0, 1.05))
jd = sum(jet_hook(Th, k) for k in range(10)) / 10
jets_h = jet_hiss(NH, 300, 10000, 0.55)                                        # slowed to 0.35×: everything a little deeper
pan = 0.55 * np.sin(roll)                                                      # the jets swing across the stereo field as the car rolls
gl, gr = np.sqrt(1 - pan), np.sqrt(1 + pan)
HL += jets_h[0] * jd * prox * 0.3 * gl; HR += jets_h[1] * jd * prox * 0.3 * gr
add(stereo_noise(25, 140, 0.4, NH) * lfo(2, 0.4, NH), 0.19 * jd * prox, buf=hb)                  # pressure rumble + camera shake
add(tone(np.full(NH, 41.0), [1, 0.5, 0.25]) + 0.5 * tone(np.full(NH, 61.5), [1, 0.4]), 0.03, buf=hb)   # slow-motion drone
add(stereo_noise(80, 900, 0.8, NH) * lfo(0.5, 0.4, NH), 0.012, buf=hb)                             # evening air on the stage
add(crickets(NH, 0.7, 51), 0.004, buf=hb)
hook_buf = np.stack([HL, HR])
cut = int(-H0 * SR)
seg = hook_buf[:, cut:cut + int(2.0 * SR)].copy(); seg[:, -720:] *= np.linspace(1, 0, 720)       # 15 ms out into the rewind
add(seg, 1.0, start=0.0)                                                      # h ∈ [0, 2) → t ∈ [0, 2)
pre = hook_buf[:, :cut].copy(); pre[:, :240] *= np.linspace(0, 1, 240)                             # 5 ms in at the hard cut
add(pre, 1.0, start=FINAL0)                                                   # h ∈ [−2, 0) → t ∈ [25, 27)

# ================================================================ 2. rewind (2.0–2.6): VHS tape warble, the flip sucked backwards, glitches
n = int(0.6 * SR); k = np.arange(n) / SR
warble = np.sin(2 * np.pi * np.cumsum(900 * (1 - k / 0.6) ** 1.5 + 140 + 60 * np.sin(2 * np.pi * 9 * k)) / SR)
rev = hook_buf[:, cut:cut + int(2.0 * SR)][:, ::-1][:, ::3][:, :n] * (1 - k / 0.6) ** 1.2
glitch = np.zeros(n)
for j in range(8):
    c0 = int((0.04 + j * 0.065 + 0.02 * rng.random()) * SR); m = int(0.025 * SR)
    glitch[c0:c0 + m] += band(noise(m), 800 + 400 * j, 9000) * 0.9
add(rev, 0.9, start=2.0)
add(warble * pulse(k, 0, 0.03, 0.5, 0.6), 0.05, 0.1, start=2.0)
add(band(noise(n), 200, 3000) * (k / 0.6) ** 2.5 * (1 - smooth(span(k, 0.56, 0.6))), 0.07, -0.1, start=2.0)
add(glitch, 0.05, start=2.0)
add(np.stack([band(noise(n), 2000, 9000), band(noise(n), 2000, 9000)]) * (0.4 + 0.6 * clamp(np.sin(2 * np.pi * 15 * k))), 0.02, start=2.0)

# ================================================================ 3. the stage (2.6–25): ambience everywhere outside the X-ray
X = smooth(span(t, 6.0, 6.35)) * (1 - smooth(span(t, 9.85, 10.0))) + smooth(span(t, 15.0, 15.35)) * (1 - smooth(span(t, 20.85, 21.0)))
main = (t >= REW1) & (t < FINAL0)
amb = main * (1 - 0.7 * X)
add(stereo_noise(80, 900, 0.8) * lfo(0.5, 0.4), 0.02 * amb)
add(crickets(N, 0.8, 61), 0.007 * amb)
add(tone(np.full(N, 100.0), [1, 0.4, 0.2]) * lfo(0.3, 0.1), 0.006 * amb, 0.3)                       # spotlight ballast hum
add(tone(np.full(N, 60.0), [1, 0.4, 0.3, 0.1]) * lfo(0.5, 0.2) + 0.3 * band(noise(N), 60, 400), 0.012 * X)   # X-ray room tone
scan(5.9, True, 0.06, 0.15); scan(9.82, False, 0.05, -0.15)
scan(14.9, True, 0.06, 0.15); scan(20.82, False, 0.05, -0.15)

# ================================================================ 4. the jets on the main clock (02 push, 03 hover, 04 limit, 05 last puffs)
jd_m, jo_m = jets_main(t)
jd_m = jd_m * main; jo_m = jo_m * main
air = air_at(t)
press = clamp(air / 62)
full = jet_hiss(N, 300, 10000)
bright = np.stack([filt(full[0], 1800, None), filt(full[1], 1800, None)])
dark = np.stack([filt(full[0], None, 1800), filt(full[1], None, 1800)])
tone_mix = 0.35 + 0.65 * np.where(t >= 15.0, press, 1.0)                                              # the hiss loses its top as the pressure falls
jet_sig = bright * tone_mix + dark
muff = np.stack([filt(jet_sig[0], None, 1400), filt(jet_sig[1], None, 1400)]) * 1.4                   # heard through the X-ray
beat = np.where(t < 10.0, 0.72, np.where(t < 15.0, 0.62 * lfo(0.7, 0.18), 1.0))                          # the hover breathes; full flow is the loudest
add(jet_sig, 0.17 * beat * (jd_m + 0.4 * jo_m) * (1 - X))
add(muff * 0.7 + jet_sig * 0.3, 0.17 * beat * (jd_m + 0.4 * jo_m) * X)
near = clamp((1.9 - np.select([t < 10, t < 15, t < 21], [0.35 * smooth(span(t, 6.75, 7.6)), 0.7 + 0 * t, 0.7 - 0.45 * smooth(span(t, 18.8, 21.0))], 0.25 * (1 - smooth(span(t, 21.0, 21.75))))) / 1.2)
add(stereo_noise(40, 600, 0.6) * lfo(5, 0.4), 0.09 * jd_m * near * (1 - X))                             # the blast hitting the stage
flow = np.stack([filt(full[1], 500, 3000), filt(full[0], 500, 3000)])
add(flow, 0.03 * jd_m * X)                                                                             # air rushing through the lines
# valves: solenoid clacks as they open (6.68, 15.0) and shut (9.8, 20.7); a sharp pressure release on opening
for t0, nv in ((6.68, 6), (9.8, 6), (15.0, 10), (20.7, 10)):
    for j in range(nv):
        add(clack(0.9 if t0 in (6.68, 15.0) else 0.6), 0.05, float(np.sin(j * 1.7)) * 0.6, start=t0 + 0.012 * j)
for t0 in (6.7, 15.02):
    n = int(0.5 * SR); k = np.arange(n) / SR
    add(np.stack([band(noise(n), 1200, 12000), band(noise(n), 1200, 12000)]) * env(0.002, 0.08, n), 0.09, start=t0)
add(reverb(boom(1.2, 70, 34, 0.35, 40, 800, 0.15, 0.6), 1.6, 0.5, 0.3), 0.12, start=6.78)              # the car lifts off the stage
# the tank running dry: a falling pressure tone, then the empty vessels creak
pg = smooth(span(t, 15.3, 15.8)) * (1 - smooth(span(t, 20.4, 20.8)))
add(tone(120 + 300 * press, [1, 0.3]) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t)) ** 2, 0.006 * pg, -0.2)
n = int(1.6 * SR); k = np.arange(n) / SR
add(sum(np.sin(2 * np.pi * f * k + j) * np.exp(-k / (0.5 / (1 + j * 0.3))) for j, f in enumerate((612, 997, 1543, 2210))) / 4, 0.035, 0.2, start=20.75)
add(sum(np.sin(2 * np.pi * f * k + j) * np.exp(-k / (0.4 / (1 + j * 0.3))) for j, f in enumerate((488, 803, 1311))) / 3, 0.028, -0.3, start=21.05)
add(stereo_noise(30, 200, 0.5) * lfo(3, 0.4), 0.05 * smooth(span(t, 18.8, 19.5)) * (1 - smooth(span(t, 20.9, 21.0))) * X)   # the car settling down

# ================================================================ 5. the verdict (21–25): touchdown, then the claimed recharge
add(reverb(boom(0.8, 75, 38, 0.18, 150, 1200, 0.05, 0.6), 1.2, 0.4, 0.25), 0.15, start=21.74)            # soft touchdown on the suspension
n = int(0.25 * SR); add(band(noise(n), 180, 900) * env(0.005, 0.06, n), 0.04, start=21.75)                 # tyres settling
comp = smooth(span(t, 22.2, 22.8)) * (t < FINAL0) * (1 - smooth(span(t, 24.9, 25.0)))
cf = 92 + 10 * span(t, 22.2, 25.0)
add(tone(cf, [1, 0.6, 0.4, 0.25]) * (0.75 + 0.25 * np.sin(2 * np.pi * 6 * t)) + 0.3 * band(noise(N), 200, 1500) * (0.5 + 0.5 * np.sin(2 * np.pi * 6 * t)) ** 2, 0.022 * comp, 0.1)

# ================================================================ 6. final caption: a soft chord over the flip's lead-in, gone before the loop
n = int(1.5 * SR); k = np.arange(n) / SR
pad = sum(a * np.sin(2 * np.pi * f * k + j) for j, (f, a) in enumerate([(73.42, 1.0), (110.0, 0.7), (146.83, 0.55), (185.0, 0.35), (220.0, 0.3)]))
pad *= smooth(k / 0.25) * (1 - smooth(span(k, 1.0, 1.5)))
add(np.stack([pad, np.roll(pad, 90)]), 0.028, start=FINAL0)

# ================================================================ UI: step changes, claim stamps, chips and badges
for t0 in (2.65, 6.05, 10.05, 15.05, 21.05):
    blip(t0, 1568, 2093, 0.035)
for t0 in (3.0, 3.6, 4.2):                                                     # "claimed" stamps
    blip(t0, 1175, 880, 0.03, -0.2)
    n = int(0.08 * SR); add(band(noise(n), 200, 1500) * env(0.002, 0.02, n), 0.03, start=t0)
for t0 in (6.35, 6.9, 7.4, 8.1, 8.4, 10.35, 15.9, 17.3, 22.2):
    blip(t0, 2637, 3136, 0.013, 0.2)
n = int(0.4 * SR); k = np.arange(n) / SR
add(band(noise(n), 600, 6000) * np.sin(np.pi * k / 0.4) ** 2, 0.025, 0.1, start=7.9)                      # arrows sweep in
n = int(1.6 * SR); k = np.arange(n) / SR
add(np.sin(2 * np.pi * np.cumsum(420 + 1100 * (k / 1.6) ** 2) / SR) * pulse(k, 0, 0.1, 1.3, 1.6), 0.014, 0.3, start=13.4)   # teaser riser

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
