#!/usr/bin/env python3
"""Synthesized sound design for the ejection seat explainer, driven by the same clock as ejection.js
(τ = real time since the handle is pulled, played back at different speeds). Writes a 48 kHz stereo WAV:
    python3 audio.py audio.wav
The video loops, so the sound does too: the end pre-roll (21.6–22 s) and the hook (0–2 s) are cut from one continuous
buffer on the hook clock h, there are no fades, and every filter is circular. Only numpy is needed."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 22.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261026)


def clamp(x, a=0.0, b=1.0): return np.minimum(b, np.maximum(a, x))
def span(x, a, b): return clamp((x - a) / (b - a))
def smooth(k): k = clamp(k); return k * k * (3 - 2 * k)
def lerp(a, b, k): return a + (b - a) * k
def pulse(x, a, b, c, d): return smooth(span(x, a, b)) * (1 - smooth(span(x, c, d)))


def band(x, lo=None, hi=None, order=2):
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
def add(sig, gain=1.0, pan=0.0, start=0.0):
    i0 = int(round(start * SR))
    if sig.ndim == 2:
        n = min(sig.shape[1], N - i0); g = gain[:n] if np.ndim(gain) else gain
        L[i0:i0 + n] += sig[0, :n] * g; R[i0:i0 + n] += sig[1, :n] * g
    else:
        n = min(len(sig), N - i0); g = gain[:n] if np.ndim(gain) else gain
        L[i0:i0 + n] += sig[:n] * g * np.sqrt(1 - pan); R[i0:i0 + n] += sig[:n] * g * np.sqrt(1 + pan)


# ---------------------------------------------------------------- the clock (mirrors ejection.js)
T_CAT, T_RAILS, T_BURN, T_DROGUE, T_SEP, T_MAIN, T_FULL = 0.18, 0.32, 0.55, 0.62, 1.5, 1.95, 2.75
TIMER_FINAL = T_FULL + 0.15
HOOK0, HOOKR, REW0, REW1, END_CUT = 0.10, 0.2, 2.0, 2.7, 21.6


def monotone(xs, ys):
    xs, ys = np.asarray(xs, float), np.asarray(ys, float); n = len(xs)
    d = np.diff(ys) / np.diff(xs); m = np.zeros(n); m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n - 1): m[i] = 0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2
    for i in range(n - 1):
        if d[i] == 0: m[i] = m[i + 1] = 0; continue
        a, b = m[i] / d[i], m[i + 1] / d[i]; s = a * a + b * b
        if s > 9: k = 3 / np.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]
    def f(x):
        x = np.asarray(x, float); i = np.clip(np.searchsorted(xs, x) - 1, 0, n - 2)
        h = xs[i + 1] - xs[i]; s_ = (x - xs[i]) / h; s2, s3 = s_ * s_, s_ ** 3
        y = (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s_) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1]
        y = np.where(x < xs[0], ys[0] + (x - xs[0]) * m[0], y)
        return np.where(x > xs[-1], ys[-1] + (x - xs[-1]) * m[-1], y)
    return f


main_tau = monotone([2.7, 5.0, 5.7, 6.0, 10.0, 13.0, 15.0, 16.0, 17.0, 18.3, 21.6], [-2.3, -0.05, 0.0, 0.008, 0.16, 0.32, 0.42, 0.50, 0.98, 1.80, 5.1])
hook = (t < REW0) | (t >= END_CUT)
tau = np.where(hook, HOOK0 + HOOKR * np.where(t >= END_CUT, t - DUR, t),
               np.where(t < REW1, lerp(HOOK0 + HOOKR * REW0, 0.0, smooth(span(t, REW0, REW1 - 0.08))), main_tau(t)))
rate = np.gradient(tau, 1 / SR)
def when(tau_value):
    """First video time (in the main, non-hook timeline) at which τ reaches tau_value."""
    idx = np.where((~hook) & (t >= REW1) & (tau >= tau_value))[0]
    return idx[0] / SR if len(idx) else None


# ================================================================ 1. the hook buffer (hook clock h ∈ [−0.4, 2.0]), looped
H0, H1 = -0.4, 2.0
NH = int((H1 - H0) * SR)
h = np.arange(NH) / SR + H0
htau = HOOK0 + HOOKR * h
HL = np.zeros(NH); HR = np.zeros(NH)
def hadd(sig, gain=1.0, pan=0.0, at=None):
    global HL, HR
    if at is not None:
        i0 = int(round((at - H0) * SR)); n = min(sig.shape[-1], NH - i0)
        pad = [(0, 0)] * (sig.ndim - 1) + [(i0, NH - i0 - n)]; sig = np.pad(sig[..., :n], pad)
    if sig.ndim == 2: HL += sig[0] * gain; HR += sig[1] * gain
    else: HL += sig * gain * np.sqrt(1 - pan); HR += sig * gain * np.sqrt(1 + pan)
h_at = lambda tv: (tv - HOOK0) / HOOKR
# slowed-down (1/5×) world: deep wind rush and the jet's low drone, the canopy tumbling away
hadd(stereo_noise(60, 700, 0.7, NH) * lfo(1.2, 0.3, NH), 0.07)
hadd(stereo_noise(500, 2600, 0.7, NH) * lfo(2.0, 0.3, NH), 0.025)
hadd(tone(np.full(NH, 46.0), [1, 0.6, 0.35, 0.2]) * lfo(0.6, 0.2, NH), 0.035)
n = int(1.6 * SR); k = np.arange(n) / SR
hadd(band(noise(n), 150, 1500) * np.exp(-((k - 0.5) / 0.35) ** 2) * (1 + 0.4 * np.sin(2 * np.pi * 7 * k)), 0.07, -0.3, at=H0)  # canopy whoosh
# catapult: a deep slow-motion blast; rocket: low roar that swells
hadd(reverb(boom(2.5, 75, 28, 0.9, 50, 1800, 0.4, 1.3, 0.35), 2.5, 0.8, 0.45), 0.3, at=h_at(T_CAT))
n = int(0.08 * SR); hadd(band(noise(n), 1500, 8000) * env(0.001, 0.02, n), 0.12, at=h_at(T_CAT) - 0.01)
rk = smooth(span(htau, T_RAILS, T_RAILS + 0.03)) * (1 - smooth(span(htau, T_BURN - 0.02, T_BURN + 0.04)))
roar = stereo_noise(30, 260, 0.6, NH) * 0.7 + stereo_noise(200, 1200, 0.7, NH) * 0.45 + crackle(NH, 50, 150, 1500, 10) * 0.3
hadd(roar * lfo(4, 0.2, NH), 0.14 * rk)
hadd(boom(1.4, 60, 32, 0.5, 80, 1200, 0.2, 0.6), 0.2, at=h_at(T_RAILS))
hook_buf = np.stack([HL, HR])
cut = int(-H0 * SR)
seg = hook_buf[:, cut:cut + int(REW0 * SR)].copy(); seg[:, -720:] *= np.linspace(1, 0, 720)               # 15 ms out into the rewind
add(seg, 1.0, start=0.0)                                                     # h ∈ [0, 2) → t ∈ [0, 2)
pre = hook_buf[:, :cut].copy(); pre[:, :240] *= np.linspace(0, 1, 240)                                     # 5 ms in at the hard cut
add(pre, 1.0, start=END_CUT)                                                 # h ∈ [−0.4, 0) → t ∈ [21.6, 22)

# ================================================================ 2. rewind (2.0–2.7): VHS tape warble, reversed swell, glitch chirps
n = int(0.7 * SR); k = np.arange(n) / SR
warble = np.sin(2 * np.pi * np.cumsum(900 * (1 - k / 0.7) ** 1.5 + 140 + 60 * np.sin(2 * np.pi * 9 * k)) / SR)
rev_swell = band(noise(n), 200, 3000) * (k / 0.7) ** 2.5
glitch = np.zeros(n)
for j in range(9):
    c0 = int((0.05 + j * 0.07 + 0.02 * rng.random()) * SR); m = int(0.025 * SR)
    glitch[c0:c0 + m] += band(noise(m), 800 + 400 * j, 9000) * 0.9
add(warble * pulse(k, 0, 0.03, 0.6, 0.7), 0.05, 0.1, start=REW0)
add(rev_swell * (1 - smooth(span(k, 0.66, 0.7))), 0.08, -0.1, start=REW0)
add(glitch, 0.05, 0.0, start=REW0)
add(np.stack([band(noise(n), 2000, 9000), band(noise(n), 2000, 9000)]) * (0.4 + 0.6 * clamp(np.sin(2 * np.pi * 15 * k))), 0.02, start=REW0)  # tape hiss

# ================================================================ 3. the cockpit in real time (2.7–5.7): engine, airflow, warning tone, breathing
cock = pulse(t, 2.7, 2.75, 5.6, 6.2)
add(stereo_noise(50, 400, 0.5) * lfo(0.8, 0.15), 0.09 * cock)                        # engine through the airframe
add(stereo_noise(800, 6000, 0.7) * lfo(1.5, 0.25), 0.045 * cock)                      # airflow over the canopy
add(tone(np.full(N, 1040.0), [1, 0.3]) * clamp((np.sin(2 * np.pi * 2.2 * (t - 2.9)) - 0.2) * 25) * pulse(t, 2.9, 2.95, 5.2, 5.3), 0.012, 0.25)   # master caution
for b0 in (3.25, 4.35):                                                               # oxygen-mask breaths
    n = int(0.75 * SR); k = np.arange(n) / SR
    add(band(noise(n), 400, 2600) * np.sin(np.pi * clamp(k / 0.75)) ** 2 * 0.8, 0.03, -0.1, start=b0)
n = int(0.12 * SR); k = np.arange(n) / SR
add(band(noise(n), 300, 3000) * env(0.01, 0.05, n), 0.05, start=5.1)                  # glove grips
add(band(noise(n), 1500, 7000) * env(0.0008, 0.012, n) + 0.6 * np.sin(2 * np.pi * 1400 * k) * env(0.0005, 0.01, n), 0.18, start=5.55)  # handle click
add(boom(0.6, 140, 70, 0.12, 200, 2000, 0.05, 0.6), 0.16, start=5.62)                 # sear release clunk
# into slow motion: everything falls away into a deep drone
n = int(3.0 * SR); k = np.arange(n) / SR
whoom = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-k / 0.8) + 32) / SR) * env(0.15, 1.4, n)
add(reverb(whoom, 2.5, 0.9, 0.4), 0.1, start=5.7)

# ================================================================ 4. slow motion (6–15): canopy, catapult, rocket (deep, stretched)
slowbed = pulse(t, 5.8, 6.4, 15.6, 17.2)
add(tone(np.full(N, 41.0), [1, 0.5, 0.25]) * lfo(0.3, 0.25) + 0.5 * stereo_noise(30, 160, 0.4)[0], 0.05 * slowbed)
add(stereo_noise(120, 900, 0.8) * lfo(0.4, 0.5), 0.03 * slowbed)
t_can = when(0.012)
add(reverb(boom(3.5, 60, 26, 1.4, 40, 1200, 0.6, 1.0, 0.5), 3.0, 1.0, 0.5), 0.22, start=t_can)          # canopy thrusters, slowed
n = int(3.4 * SR); k = np.arange(n) / SR
add(band(noise(n), 90, 900) * pulse(k, 0.2, 1.2, 2.6, 3.4), 0.05, -0.3, start=t_can)                    # canopy lifting into the airflow
# X-ray scan whooshes (10 s on, 15 s off)
def scan(t0, up, g, pan):
    n = int(1.6 * SR); k = np.arange(n) / SR; out = np.zeros(n)
    for j, c in enumerate([300, 800, 2000, 5000] if up else [5000, 2000, 800, 300]):
        out += band(noise(n), c * 0.6, c * 1.6) * np.exp(-((k - 0.18 - j * 0.14) / 0.16) ** 2) * (0.5 + 0.15 * j * up)
    shimmer = sum(np.sin(2 * np.pi * f * (1 + (0.03 if up else -0.03) * k) * k) for f in (1320, 1980, 2640, 3960)) * env(0.04, 0.45, n) * 0.18
    add(out * 0.5 + shimmer, g, pan, start=t0)
scan(9.85, True, 0.06, 0.15)
scan(14.85, False, 0.07, -0.15)
t_cat, t_rails, t_burn = when(T_CAT), when(T_RAILS), when(T_BURN)
add(reverb(boom(4.0, 70, 24, 1.6, 40, 1500, 0.8, 1.2, 0.6), 3.2, 1.1, 0.55), 0.26, start=t_cat)        # catapult, very slow
n = int(0.1 * SR); add(band(noise(n), 1200, 7000) * env(0.001, 0.03, n), 0.08, start=t_cat - 0.01)
rk = smooth(span(tau, T_RAILS, T_RAILS + 0.01)) * (1 - smooth(span(tau, T_BURN - 0.02, T_BURN + 0.03))) * (~hook) * (t > REW1)
sroar = stereo_noise(25, 200, 0.6) * 0.8 + stereo_noise(150, 700, 0.7) * 0.4
add(sroar * lfo(1.5, 0.3), 0.12 * rk * clamp(rate * 6 + 0.4))
add(reverb(boom(2.5, 55, 28, 1.0, 60, 900, 0.4, 0.8, 0.5), 2.5, 0.8, 0.4), 0.2, start=t_rails)        # rocket lights
add(crackle(N, 25, 120, 900, 12), 0.05 * rk)

# ================================================================ 5. stabilize + landing (15–21.6): time catches up
airflow = clamp(rate) * pulse(t, 15.0, 16.5, 18.6, 19.8)
add(stereo_noise(200, 3500, 0.7) * lfo(3, 0.35), 0.13 * airflow)                     # wind rush as the seat flies free
add(stereo_noise(40, 300, 0.6) * lfo(2, 0.3), 0.05 * airflow)
t_drogue, t_sep, t_main, t_full = when(T_DROGUE), when(T_SEP), when(T_MAIN), when(T_FULL - 0.15)
n = int(0.3 * SR); k = np.arange(n) / SR
add(band(noise(n), 300, 5000) * env(0.001, 0.04, n) + 0.5 * np.sin(2 * np.pi * 180 * k) * env(0.001, 0.06, n), 0.15, -0.2, start=t_drogue)   # drogue gun
flap = band(noise(N), 150, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t)) ** 3
add(flap, 0.03 * pulse(t, t_drogue + 0.3, t_drogue + 0.6, t_sep - 0.1, t_sep + 0.2), -0.4)        # drogue fabric flutter
add(boom(0.5, 220, 90, 0.08, 400, 4000, 0.03, 0.8), 0.12, 0.2, start=t_sep)                       # seat-man separation clunk
n = int(1.2 * SR); k = np.arange(n) / SR
add(band(noise(n), 300, 3000) * np.exp(-((k - 0.5) / 0.25) ** 2), 0.05, -0.5, start=t_sep)        # the seat tumbling away
n = int(0.9 * SR); k = np.arange(n) / SR
add(band(noise(n), 800, 6000) * smooth(k / 0.9) ** 2, 0.06, 0.1, start=t_main)                    # main chute streaming out
add(reverb(boom(1.6, 95, 45, 0.35, 100, 3000, 0.12, 1.4, 0.15), 1.6, 0.5, 0.3), 0.3, start=t_full)    # canopy snaps open
calm = smooth(span(t, 19.2, 20.0)) * (t < END_CUT)
add(stereo_noise(80, 900, 0.8) * lfo(0.4, 0.4), 0.05 * calm)                          # quiet wind under the canopy
add(band(noise(N), 200, 1800) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.3 * t)) ** 2, 0.02 * calm, 0.2)     # canopy fabric breathing

# ================================================================ 6. the timer: ticks that follow the on-screen clock, stop when it stops
shown = np.where(hook | (t < REW1) | (tau < TIMER_FINAL), np.maximum(tau, 0), TIMER_FINAL)
step = np.where(np.abs(rate) < 0.12, 0.01, 0.1)
cell = np.floor(shown / step + 1e-9) * step
ticks = np.where((np.diff(cell, prepend=cell[0]) > 1e-6) & (t > REW1) & ~hook & (shown < TIMER_FINAL))[0]
n = int(0.012 * SR); k = np.arange(n) / SR
tick = np.sin(2 * np.pi * 2800 * k) * env(0.0005, 0.003, n)
for i in ticks:
    add(tick, 0.035 if step[i] < 0.05 else 0.05, 0.35, start=i / SR)
hook_ticks = np.where(np.diff(np.floor(np.where(hook, tau, 0) / 0.1), prepend=0) > 0)[0]
for i in hook_ticks:
    if 0.02 * SR < i < N - 0.02 * SR: add(tick, 0.04, 0.35, start=i / SR)
t_stop = when(TIMER_FINAL)
n = int(1.2 * SR); k = np.arange(n) / SR
add(sum(np.sin(2 * np.pi * f * k) for f in (1568, 2349)) * env(0.002, 0.35, n), 0.03, 0.2, start=t_stop)   # timer stops: soft chime

# ================================================================ UI ticks: step changes and callouts
def blip(t0, f1, f2, g, pan=0.0):
    n1, n2 = int(0.03 * SR), int(0.05 * SR)
    a = np.sin(2 * np.pi * f1 * np.arange(n1) / SR) * env(0.001, 0.01, n1)
    b = np.sin(2 * np.pi * f2 * np.arange(n2) / SR) * env(0.001, 0.015, n2)
    add(np.concatenate([a, np.zeros(int(0.02 * SR)), b]), g, pan, start=t0)
for t0 in (2.75, 6.05, 10.05, 15.05, 19.05):
    blip(t0, 1568, 2093, 0.04)
for t0 in (3.2, 6.5, 10.5, 12.1, 16.0, 19.4):
    blip(t0, 2637, 3136, 0.015, 0.2)
n = int(0.6 * SR); k = np.arange(n) / SR
add(np.sin(2 * np.pi * np.cumsum(500 + 900 * k / 0.6) / SR) * pulse(k, 0, 0.05, 0.4, 0.6), 0.012, 0.3, start=13.2)   # teaser riser

# ================================================================ master (no fades: the track loops)
for ch in (L, R):
    ch[:] = band(ch, 28, None, 3) * np.sqrt(np.mean(ch ** 2))
mix = np.stack([L, R], 1)
mix = np.tanh(mix / 0.9) * 0.9
mix /= np.abs(mix).max() / 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'audio.wav'
with wave.open(out, 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
    wv.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out, ' events:', {k: round(v, 2) for k, v in dict(canopy=t_can, catapult=t_cat, rails=t_rails, burnout=t_burn, drogue=t_drogue, sep=t_sep, main=t_main, full=t_full, timer_stop=t_stop).items()})
