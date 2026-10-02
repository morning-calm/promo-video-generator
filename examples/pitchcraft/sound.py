#!/usr/bin/env python3
"""Soundtrack for the Pitchcraft promo, locked to cues.json (the picture reads the same file).
   python3 examples/pitchcraft/sound.py [out.wav]   ->  out/pitchcraft/score.wav   (needs numpy + scipy)"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lib'))
from synth import *

C = load_cues(HERE)
init(C['duration'])

BEAT = 0.47
T0 = C['burst']                       # the groove drops on the burst
CH = [[57, 60, 64, 67], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]   # Am7 Fmaj7 Cmaj C/G-ish
ROOT = [45, 41, 48, 43]
ARP = [[0, 3, 2, 3], [0, 2, 3, 2], [0, 3, 1, 3], [0, 2, 3, 1]]

# intro: sub drone + shimmer + riser (0 → burst)
add(pad([45, 52, 57], 3.3, 0.16, 2.6), 0.0, 1.0, 0.0, 0.6)
add(riser(C['burst'] - 0.35, 0.35), 0.3, 1.0, 0.0, 0.25)
add(bell(93, 2.2, 0.20), C['spark'], 1, -0.2, 0.9)
add(bell(81, 2.2, 0.12), C['spark'] + 0.05, 1, 0.3, 0.9)
add(whoosh(0.5, 0.4, True, 400, 7000), C['spark'] - 0.12, 1, 0, 0.3)
add(reverse_hit(0.5, 0.35), C['burst'] - 0.5)

# typing (prompt)
n_chars = len(C['typeText']); span = C['typeEnd'] - C['typeStart']
for i in range(n_chars):
    tm = C['typeStart'] + span * i / (n_chars - 1) + rng.uniform(-0.01, 0.01)
    add(tick(0.22 + 0.1 * rng.random(), 2200 + 700 * rng.random()), tm, 1, rng.uniform(-0.3, 0.3), 0.08)
add(tick(0.45, 1700), C['enter'], 1, 0, 0.2); add(blip(79, 0.18), C['enter'], 1, 0, 0.5)

# card in / title in
add(whoosh(0.45, 0.28, True, 600, 4500), C['titleIn1'] - 0.1, 1, -0.3, 0.2)
add(whoosh(0.45, 0.25, True, 500, 4000), C['cardIn'] - 0.05, 1, 0.3, 0.2)

# drop
add(boom(2.2, 0.85), C['burst'], 1, 0, 0.35)
add(kick(1.0), C['burst'], 1)
add(whoosh(0.45, 0.35, False, 6000, 400), C['titleOut1'], 1, 0, 0.3)
add(bell(88, 2.0, 0.12), C['burst'] + 0.02, 1, 0.2, 0.9)

# groove from the drop → collapse
end_groove = C['collapse']
k = 0
while T0 + k * BEAT < end_groove - 0.05:
    tm = T0 + k * BEAT; bar = (k // 4) % 4; step = k % 4
    if k > 0: add(kick(0.85), tm, 1)
    add(hat(0.22 if step % 2 == 0 else 0.34), tm + BEAT / 2, 1, 0.25)
    if step in (1, 3): add(clap(0.34), tm, 1, 0, 0.25)
    for e8 in (0, 1):                      # bass in 8ths with off-beat push
        if step != 0 or e8: add(bass(ROOT[bar] + (12 if e8 and step == 3 else 0), BEAT * 0.45, 0.42), tm + e8 * BEAT / 2, 1)
    for q in range(4):                     # 16th arp
        m = CH[bar][ARP[step][q]] + 12
        add(pluck(m, 0.28, 0.14 if q else 0.2), tm + q * BEAT / 4, 1, (-0.4, 0.4, -0.15, 0.15)[q], 0.35)
    if step == 0: add(pad(CH[bar], BEAT * 4.2, 0.13, 0.25), tm, 1, 0, 0.4)
    k += 1

# transitions & UI hits
add(whoosh(0.7, 0.55, True, 250, 6000), C['whip1'] - 0.25, 1, 0, 0.3)
add(boom(0.9, 0.5), C['whip1'] + 0.05, 1, 0, 0.3)
add(tick(0.5, 1500), C['cursorClick'], 1, 0.2, 0.2)
for i in range(4):
    tm = C['themeClick'] + i * C['themeStep']
    add(tick(0.5, 1800), tm, 1, 0.1, 0.2); add(blip([76, 79, 83, 88][i], 0.22, 0.3), tm + 0.01, 1, 0.1 * i - 0.2, 0.6)
for i in range(3):
    add(blip([72, 76, 79][i] + 12, 0.24, 0.35), C['chips'] + i * 0.14, 1, (-0.4, 0, 0.4)[i], 0.7)
    add(kick(0.4), C['chips'] + i * 0.14, 1)
add(riser(C['zoom'] + 0.45 - (C['zoom'] - 0.5), 0.35), C['zoom'] - 0.5, 1, 0, 0.3)
add(whoosh(0.6, 0.5, True, 300, 7000), C['zoom'] - 0.05, 1, 0, 0.3)
add(boom(0.9, 0.5), C['presentIn'] - 0.05, 1, 0, 0.35)
add(tick(0.6, 1300), C['key'], 1, 0.3, 0.2)
add(boom(1.4, 0.8), C['push'], 1, 0, 0.4)
add(whoosh(0.5, 0.5, True, 300, 6000), C['push'] - 0.2, 1, 0, 0.3)
add(whoosh(0.35, 0.3, False, 5000, 600), C['shrink'], 1, 0, 0.2)
for i in range(3):
    add(blip([84, 88, 91][i], 0.2, 0.3), C['tiles'] + i * 0.1, 1, (-0.4, 0, 0.4)[i], 0.7)
# URL typing
nU = 22
for i in range(nU):
    tm = C['urlStart'] + (C['urlEnd'] - C['urlStart']) * i / (nU - 1)
    add(tick(0.18, 3000 + 600 * (i % 3)), tm, 1, rng.uniform(-0.2, 0.2), 0.06)
add(blip(96, 0.2, 0.5), C['lock'], 1, 0, 0.9); add(tick(0.7, 1200), C['lock'], 1, 0, 0.2)
add(blip(103, 0.14, 0.4), C['lock'] + 0.07, 1, 0.2, 0.9)

# collapse → finale
add(noise_sweep(0.45, 7000, 250, 0.4, False), C['collapse'], 1, 0, 0.3)
add(reverse_hit(0.45, 0.55), C['finale'] - 0.45)
add(boom(3.0, 0.75), C['finale'], 1, 0, 0.5)
add(kick(1.0), C['finale'], 1)
add(pad([57, 60, 64, 67, 71], 3.3, 0.14, 0.12), C['finale'], 1, 0, 0.7)
add(pad([45, 52], 3.3, 0.12, 0.15), C['finale'], 1, 0, 0.5)
for i, m in enumerate([81, 84, 88, 91, 95, 100]):
    add(bell(m, 2.0, 0.17), C['finale'] + 0.05 + i * 0.09, 1, (-0.5, 0.4, -0.2, 0.5, -0.4, 0.2)[i], 0.9)
add(whoosh(0.6, 0.4, True, 400, 7000), C['wordmark'] - 0.15, 1, 0, 0.3)
add(blip(88, 0.22, 0.4), C['wordmark'], 1, -0.2, 0.7)
add(blip(91, 0.2, 0.4), C['tagline'], 1, 0.2, 0.7)
add(blip(96, 0.2, 0.5), C['urlPill'], 1, 0, 0.8); add(tick(0.5, 1800), C['urlPill'], 1)
# sparkle tail
for i in range(9):
    add(bell(96 + [0, 4, 7, 12, 7, 4, 0, -5, 0][i], 1.2, 0.07), 13.95 + i * 0.11, 1, rng.uniform(-0.6, 0.6), 0.9)

master(default_out(HERE), body=(3.2, 12.0))
