"""synth.py - a tiny procedural sound studio for promo videos.  numpy + scipy only; no samples, so nothing to license.

Usage from a project's sound.py:

    import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib'))
    from synth import *
    C = load_cues(HERE)                  # the same cues.json the picture uses
    init(C['duration'])
    add(kick(), C['hit'])                # add(sound, time_s, gain=1, pan=-1..1, reverb_send=0..1)
    ...
    master(default_out(HERE))            # loudness-normalise, soft-limit, write out/<project>/score.wav

Everything is deterministic (seeded).  Do NOT touch L/R/RL/RR directly - use add().

Instruments (each returns a mono numpy array):
  drums     kick(vol)  hat(vol, open_)  clap(vol)  boom(d, vol)
  tonal     bass(midi, d, vol)  pluck(midi, d, vol, bright)  bell(midi, d, vol)  blip(midi, vol, d)  pad([midi...], d, vol, swell)
  ui        tick(vol, freq)  (keyboard / click)   blip(...)  (UI chime)
  movement  whoosh(d, vol, up, f0, f1)  riser(d, vol)  reverse_hit(d, vol)  noise_sweep(d, f0, f1, vol, up)
Helpers: tt(d) time axis, midi(m) -> Hz, lp/hp/bp filters, expdecay, env.
"""
import json, os, sys, wave
import numpy as np
from scipy import signal

SR = 44100
rng = np.random.default_rng(7)
DUR = 0.0; N = 0
L = R = RL = RR = None


def init(duration, seed=7):
    """start a fresh mix of `duration` seconds"""
    global DUR, N, L, R, RL, RR
    DUR = float(duration); N = int(SR * DUR)
    L = np.zeros(N); R = np.zeros(N)       # dry bus
    RL = np.zeros(N); RR = np.zeros(N)     # reverb send
    rng.bit_generator.state = np.random.default_rng(seed).bit_generator.state


def load_cues(project_dir):
    """cues.json lives next to the project's index.html; the picture and the sound share it so they stay locked together"""
    return json.load(open(os.path.join(project_dir, 'cues.json')))


def default_out(project_dir, name='score.wav'):
    """out/<project name>/score.wav at the repo root, or argv[1] if given (tools/build.sh looks for exactly this file)"""
    if len(sys.argv) > 1: return sys.argv[1]
    repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    return os.path.join(repo, 'out', os.path.basename(os.path.abspath(project_dir)), name)


def tt(d): return np.arange(int(SR * d)) / SR
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, f, o=2):
    f = np.asarray(f, dtype=float)
    if f.ndim == 0: return signal.sosfilt(signal.butter(o, float(min(f, SR / 2 - 100)), 'low', fs=SR, output='sos'), x)
    lo, hi = float(f.min()), float(min(f.max(), SR / 2 - 100))      # moving cutoff: cross-fade a few fixed filters
    if hi - lo < 1: return lp(x, lo, o)
    pts = np.geomspace(lo, hi, 6); ys = [lp(x, p, o) for p in pts]
    pos = np.interp(np.log(np.clip(f, lo, hi)), np.log(pts), np.arange(len(pts)))
    out = np.zeros(len(x))
    for i, y in enumerate(ys): out += y * np.clip(1 - np.abs(pos - i), 0, 1)
    return out
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return signal.sosfilt(signal.butter(o, [a, b], 'band', fs=SR, output='sos'), x)


def add(x, t, gain=1.0, pan=0.0, send=0.0):
    """mix mono x into the bus at time t (seconds)"""
    i = int(t * SR)
    if i >= N or i + len(x) <= 0: return
    a = max(0, -i); i = max(0, i); x = x[a:a + (N - i)]
    n = len(x); gl = np.cos((pan + 1) * np.pi / 4); gr = np.sin((pan + 1) * np.pi / 4)
    L[i:i + n] += x * gain * gl; R[i:i + n] += x * gain * gr
    if send: RL[i:i + n] += x * send * gl; RR[i:i + n] += x * send * gr


def env(n, a=0.002, d=0.1, s=0.0, r=0.0):
    e = np.ones(n); na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    nd = int(d * SR); seg = e[na:na + nd]; seg *= np.exp(-np.linspace(0, 6, len(seg))) * (1 - s) + s if len(seg) else 1
    e[na + nd:] *= s
    if r: nr = min(n, int(r * SR)); e[-nr:] *= np.linspace(1, 0, nr)
    return e


def expdecay(n, tau): return np.exp(-np.arange(n) / (tau * SR))


# ───────────────────────── instruments ─────────────────────────
def kick(vol=1.0):
    t = tt(0.38); f = 48 + 120 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * expdecay(len(t), 0.11)
    x += 0.35 * lp(rng.standard_normal(len(t)), 1800) * expdecay(len(t), 0.008)
    return np.tanh(x * 1.6) * vol


def hat(vol=0.3, open_=False):
    n = int(SR * (0.22 if open_ else 0.05)); x = hp(rng.standard_normal(n), 7500, 3)
    return x * expdecay(n, 0.09 if open_ else 0.016) * vol


def clap(vol=0.5):
    n = int(SR * 0.25); x = bp(rng.standard_normal(n), 1200, 3800)
    burst = np.zeros(n)
    for k in (0.0, 0.011, 0.023):
        i = int(k * SR); burst[i:] += expdecay(n - i, 0.012)
    return x * (burst * 0.6 + expdecay(n, 0.06)) * vol


def bass(m, d, vol=0.5):
    t = tt(d); f = midi(m)
    x = signal.sawtooth(2 * np.pi * f * t) * 0.6 + np.sin(2 * np.pi * f * t)
    x = lp(x, 520 + 1200 * np.exp(-t * 14), 2)
    return x * env(len(t), 0.004, d * 0.8, 0.35, 0.03) * vol


def pluck(m, d=0.35, vol=0.3, bright=4200):
    t = tt(d); f = midi(m); x = 0
    for det in (-0.07, 0.07):
        x = x + signal.sawtooth(2 * np.pi * f * 2 ** (det / 12) * t)
    x = lp(x, bright * np.exp(-t * 7) + 500, 2)
    return x * expdecay(len(t), d * 0.32) * env(len(t), 0.002, 1, 1, 0.02) * vol


def bell(m, d=1.4, vol=0.25):
    t = tt(d); f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 5) + 0.3 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9)
    return x * expdecay(len(t), d * 0.35) * env(len(t), 0.001, 1, 1, 0.05) * vol


def pad(ms, d, vol=0.12, swell=0.8):
    t = tt(d); x = 0
    for m in ms:
        for det in (-0.12, 0.0, 0.12):
            x = x + signal.sawtooth(2 * np.pi * midi(m + det) * t + rng.uniform(0, 6))
    x = lp(x, 900 + 2600 * np.minimum(1, t / max(swell, 0.01)) ** 2, 2)
    e = np.minimum(1, t / swell) * np.minimum(1, (d - t) / 0.6)
    return x * e * vol / max(1, len(ms))


def noise_sweep(d, f0, f1, vol=0.4, up=True, q=1.0):
    """band-limited noise whose centre frequency glides f0 -> f1 (filter bank + moving gaussian weights, click-free)"""
    if d < 0.05: return np.zeros(max(1, int(SR * d)))      # too short to sweep (also guards negative durations from cue arithmetic)
    t = tt(d); n = rng.standard_normal(len(t))
    centres = np.geomspace(min(f0, f1) * 0.7, max(f0, f1) * 1.3, 14); centres = centres[centres < SR / 2 - 400]
    f = np.geomspace(f0, f1, len(t)); out = np.zeros(len(t))
    for c in centres:
        band = bp(n, c / 1.35, min(c * 1.35, SR / 2 - 200), 2)
        w = np.exp(-0.5 * (np.log2(f / c) / 0.45) ** 2)
        out += band * w
    e = (t / d) ** 2 if up else (1 - t / d) ** 1.5
    e = e * np.minimum(1, (d - t) / 0.03) * np.minimum(1, t / 0.01)
    return out * e * vol * 3


def whoosh(d=0.6, vol=0.5, up=True, f0=300, f1=5000):
    x = noise_sweep(d, f0, f1, vol, up)
    t = tt(d); x = x * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.6
    return x


def tick(vol=0.25, f=2600):
    n = int(SR * 0.03); t = np.arange(n) / SR
    x = bp(rng.standard_normal(n), f * 0.6, f * 1.6) * expdecay(n, 0.004) + 0.5 * np.sin(2 * np.pi * f * 0.5 * t) * expdecay(n, 0.006)
    return x * vol


def blip(m, vol=0.3, d=0.18):
    t = tt(d); f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)
    return x * expdecay(len(t), d * 0.3) * env(len(t), 0.001, 1, 1, 0.02) * vol


def boom(d=1.8, vol=0.9):
    t = tt(d); f = 36 + 60 * np.exp(-t * 6); ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * expdecay(len(t), 0.5)
    x += 0.8 * lp(rng.standard_normal(len(t)), 2500) * expdecay(len(t), 0.12)
    x += 0.4 * hp(rng.standard_normal(len(t)), 3000) * expdecay(len(t), 0.35)
    return np.tanh(x * 1.5) * vol


def riser(d, vol=0.5):
    x = noise_sweep(d, 200, 9000, vol, True)
    t = tt(d)
    tone = np.sin(2 * np.pi * np.cumsum(np.geomspace(180, 1400, len(t))) / SR) * (t / d) ** 2 * 0.12
    return x + tone


def reverse_hit(d=0.7, vol=0.5):
    return (hp(rng.standard_normal(int(SR * d)), 1500, 2) * (tt(d) / d) ** 3 * vol)


def master(path, body=None, target_rms=-15.0, ceiling=-1.0, reverb_mix=0.5, tail=0.9):
    """reverb, level the 'body' of the mix to target_rms dBFS (body=(start_s, end_s), default the middle 60%), soft-limit at `ceiling` dBFS, fade the end, write a 16-bit stereo wav"""
    t = tt(2.2); ir = (rng.standard_normal((2, len(t))) * np.exp(-t * 2.4)) * (1 - np.exp(-t * 90))
    ir[:, :] = lp(ir, 5200, 1)
    wl = signal.fftconvolve(RL, ir[0])[:N]; wr = signal.fftconvolve(RR, ir[1])[:N]
    out = np.stack([hp(L + wl * reverb_mix, 28, 2), hp(R + wr * reverb_mix, 28, 2)], 1)
    fade_in = np.minimum(1, np.arange(N) / (0.04 * SR)); fade_out = np.minimum(1, (N - np.arange(N)) / (tail * SR))
    out *= (fade_in * fade_out)[:, None]
    a, b = body if body else (DUR * 0.2, DUR * 0.8)
    seg = out[int(a * SR):int(b * SR)]
    out *= 10 ** (target_rms / 20) / max(1e-9, np.sqrt(np.mean(seg ** 2)))
    ceil = 10 ** (ceiling / 20)
    out = ceil * np.tanh(out / ceil)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype('<i2').tobytes())
    print(f'wrote {path}: {DUR}s  peak {20 * np.log10(np.max(np.abs(out))):.1f} dBFS  rms {20 * np.log10(np.sqrt(np.mean(out ** 2))):.1f} dBFS')
    return out
