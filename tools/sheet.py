#!/usr/bin/env python3
"""sheet.py - tile images into one labelled contact sheet so a whole scene can be reviewed at a glance.
   python3 tools/sheet.py out.png in1.png in2.png ...        (needs Pillow: pip install pillow)"""
import os, sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
W, H, cols = 640, 360, 3
rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * (W + 6), rows * (H + 6)), 'white')
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((W, H)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 120, 26), fill='black'); d.text((6, 6), os.path.basename(f).rsplit('.', 1)[0], fill='white')
    S.paste(im, ((i % cols) * (W + 6), (i // cols) * (H + 6)))
S.save(out); print('wrote', out)
