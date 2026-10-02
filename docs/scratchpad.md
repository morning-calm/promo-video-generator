# Scratchpad

## Log: HealthStore promo (projects/healthstore)
- Output: `out/healthstore/healthstore.mp4` (59 s, 1920x1080, 60 fps, h264 + aac, ~31 MB).
- Re-render: `python3 projects/healthstore/sound.py && node tools/render.js projects/healthstore --frames && bash tools/build.sh projects/healthstore`.
- Re-capture real screens (needs network): `node projects/healthstore/capture-site.js`, `node projects/healthstore/capture-figma.js`, then `python3 projects/healthstore/stitch.py`.
- Layout check (numbers, not eyeballing): `node projects/healthstore/check-layout.js`.
- Not verified: the audio has never been heard, only measured (peak/RMS per 3 s, decoded-peak check).

## Lessons
- `tools/build.sh` counted frames with `ls frames/*.jpg`; at 14,160 frames the glob exceeds macOS ARG_MAX (exit 126, no output). Fixed with `find`.
- Chip rows sized by assumption overlapped (measured: 18 px chip-chip, 39 px chip-card). Always `getBoundingClientRect` text that wraps or pads.
- Scene hand-overs: a departing scene (phone) was still visible when the next scene started; shift the next scene's `*In` cue after the previous one's exit finishes.
- Figma viewers are canvas-based: find buttons by colour blobs, poll until a button of the expected width exists, stitch scroll frames using wheel steps (120 -> 40 css px).
- AAC encode overshoots the WAV peak by up to ~1-2 dB: master with a ceiling around -2.5 dBFS.
- Never needed the supplied site credentials: the alpha site was open access. Do not hard-code them.
