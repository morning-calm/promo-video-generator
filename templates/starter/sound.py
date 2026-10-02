#!/usr/bin/env python3
"""Starter soundtrack: every sound is placed at a time read from cues.json, so picture and sound cannot drift apart.
   python3 projects/<name>/sound.py   ->  out/<name>/score.wav"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lib'))
from synth import *

C = load_cues(HERE)
init(C['duration'])

add(pad([45, 52, 57], C['duration'] - 0.6, 0.14, 1.5), 0.0, 1, 0, 0.5)             # quiet drone under everything
for i, ch in enumerate('Make something move.'):                                      # a key tick per letter as the title types
    add(tick(0.22, 2300 + 600 * (i % 3)), C['titleIn'] + i * 0.03, 1, 0.0, 0.08)
add(whoosh(0.5, 0.35, True, 500, 5000), C['cardIn'] - 0.15, 1, -0.3, 0.2)           # the card flies in
rs = max(0.0, C['hit'] - 1.5); add(riser(C['hit'] - rs - 0.05, 0.3), rs, 1, 0, 0.3)  # tension building up to the hit
add(reverse_hit(0.5, 0.4), C['hit'] - 0.5)
add(boom(2.0, 0.8), C['hit'], 1, 0, 0.4); add(kick(1.0), C['hit'])                   # the impact (matches the shake + particles)
for i, m in enumerate([81, 84, 88, 93]): add(bell(m, 1.8, 0.14), C['hit'] + 0.05 + i * 0.08, 1, (-0.4, 0.3, -0.2, 0.4)[i], 0.9)
add(blip(88, 0.25, 0.4), C['ctaIn'], 1, 0.2, 0.7); add(tick(0.5, 1800), C['ctaIn'])  # the pill pops in
add(whoosh(0.5, 0.4, False, 5000, 400), C['out'], 1, 0, 0.3)                         # everything leaves
master(default_out(HERE))
