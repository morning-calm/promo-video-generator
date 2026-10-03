# API reference

Everything a scene or soundtrack can call. Source of truth: `lib/motion.js`, `lib/synth.py`, `tools/render.js`, `tools/build.js`.

## cues.json (per project)

The single source of timing for picture **and** sound.

| key | default | meaning |
|---|---|---|
| `duration` | required | seconds |
| `fps` | 60 | output frame rate |
| `subframes` | 4 | sub-frames averaged per frame (motion blur quality; 1 = no blur, fastest) |
| `shutter` | 0.5 | fraction of a frame the virtual shutter is open (0.5 = 180 degrees, the film look) |
| `width`, `height` | 1920, 1080 | output size. Also set the same size on `#v` in your CSS, on the `<canvas>`, and in `PV.createWorld(stage, canvas, w, h)`; positions in your scene are yours to re-lay-out |
| `dpr` | 1 | device scale factor (2 renders at 2x then encodes at the larger size - slow) |
| `render` | | optional render settings, in one object so they never collide with your moment names (table below) |
| anything else | | your named moments in seconds: `"hit": 2.45`. Strings and numbers are fine (e.g. the typed text) |

### `render` settings

All optional; leave `render` out and nothing changes.

| key | default | meaning |
|---|---|---|
| `page` | `index.html` | the page to render, relative to the project; a `?query` or `#hash` is passed to the page (`"dist/reel.html#clean"`) |
| `sampling` | `ends` | where the sub-frames sit in the open shutter: `ends` spaces them from opening to closing, `centre` puts each at the middle of one of `subframes` equal slices (a slightly shorter blur: `(S-1)/S` of the shutter between first and last sample) |
| `crf` | 18 | x264 quality (0-51, lower = bigger and better). `CRF=` in the environment wins, for one-off builds |
| `preset` | `slow` | x264 speed preset (`ultrafast` ... `veryslow`). `PRESET=` in the environment wins |
| `loudness` | off | target integrated loudness of the soundtrack in LUFS (EBU R128), e.g. `-14` for social video. The build measures `score.wav` over the video's duration, applies one gain, holds peaks at `peak`, and corrects the gain against the limited result until it is within 0.1 LU; it prints what it reached. Without it the score is encoded as it is |
| `peak` | -2 | with `loudness`: sample-peak ceiling in dBFS for the limiter. Below 0 leaves room for the AAC encoder's overshoot (about 1 dB) |
| `intro` | off | `{ "file": "sting.mp4", "until": 2.0, "trim": 0 }`: the picture before `until` seconds comes from a video clip (path relative to the project), starting `trim` seconds into it and holding its last frame if it runs short. The page is only rendered from `until` on. The clip's own audio is not used |
| `outro` | off | `{ "file": "logo.mp4", "at": 12.5, "trim": 0.16 }`: the picture from `at` seconds to the end comes from a clip, the same way; the page is only rendered up to `at`. A clip is scaled to the video's size, so give it the same aspect ratio |
| `variants` | none | named overrides for other cuts of the same film: `{ "vertical": { "width": 1080, "height": 1920, "render": { "page": "vertical.html", "outro": null } } }`. `--variant vertical` on `render.js` and `build.js` applies one: it can override any top-level key and any `render` setting, `null` removes a setting, and its output goes to `out/<name>-vertical/` |

## Scene contract (browser)

`index.html` must load `../../lib/motion.js` and your scene file, and the scene must:

1. define `window.seek = t => { ... }` (pure function of `t`),
2. call `window.seek(0); PV.ready();` once fonts and images are loaded (`await PV.loaded([...])` first).

`render.js` waits up to 60 s for `window.__ready === true`, fails on any `pageerror`, and reports any HTTP 4xx (a missing image or font) with its URL.

`seek(t)` may return a Promise; `render.js` waits for it before the screenshot. That is how a scene with a `<video>` stays exact: set `currentTime`, wait for the `seeked` event and two `requestAnimationFrame`s, then resolve. The local server answers byte ranges, which Chrome needs before it will seek a `<video>` or `<audio>`.

A page can make its own soundtrack instead of `sound.py` (for example with an `OfflineAudioContext`): define `window.__soundtrack = async () => base64WavString`. Such a page owns `out/<name>/score.wav`: `render.js --frames`, `--mp4` and `--sound` rewrite it from the page every run, so a stale score never reaches a build. Pages without it are untouched.

### `PV` - maths

| | |
|---|---|
| `P(t, a, b)` | progress of `t` through `[a, b]`, clamped 0..1. **Every animation is `ease(P(t, start, end))`.** |
| `lerp(a, b, k)`, `clamp(x, a=0, b=1)` | |
| `eo3 eo4 eoE` | ease **out** (cubic, quartic, exponential): arrive softly. `eo4` is the default for entrances. |
| `ei3` | ease **in** (cubic): for exits |
| `eio3 eio4` | ease in-out: for moves between two resting places (camera, wipes) |
| `eoB(x, s=1.9)` | ease out with back-overshoot: things that "pop" |
| `spring(t, start, freq=2.2, damping=6.5)` | 0 before `start`, then a damped oscillation to 1 (overshoots ~10%). `freq` 2 = bouncy, 1.4 = floaty; `damping` 6-8 settles in ~0.5 s. Use for anything that lands. |
| `rng(seed)` | returns a seeded random function (mulberry32). Create once at the top; never `Math.random()`. |
| `hex('#rrggbb')`, `mixc(hexA, hexB, k)` | colour helpers; `mixc` returns `rgb(...)` |

### `PV` - DOM

| | |
|---|---|
| `createWorld(stageEl, canvasEl?, w=1920, h=1080)` | makes the layer everything lives in (so the camera/shake moves it as one) and sets `PV.world` |
| `mk(html, css, parent?, className='abs')` | create an absolutely positioned div (default parent: the world). Position with `left/top` **once**, animate with `put`. |
| `put(el, {x, y, z, rx, ry, r, s, sx, sy, o})` | the one way to move things: translate (px), rotate X/Y/Z (deg), scale, opacity. `o` <= 0.002 hides the element entirely. |
| `show(el, bool)` | `display:none` toggle for whole scene containers |
| `img(src, css)` | `<img>` markup string |
| `kinetic(text, css, gradient?, parent?)` | a clipped line with one span per letter. Needs `.line`/`.ch` CSS (`lib/motion.css`). |
| `kUpdate(k, t, tin, tout, gap=0.035)` | letters rise + straighten one by one from `tin`; if `tout` is set they drop out from `tout`. Hidden before/after. |
| `shake(t, [[time, px], ...])` | `{x, y}` damped camera shake after each impact; apply to the world's `translate3d` |
| `loaded(fontSpecs?)` / `ready()` | await fonts+images, then flag `window.__ready` |

### Recipes (all pure functions of `t`)

- **Entrance:** `put(el, { y: (1 - eo4(P(t, 1.0, 1.5))) * 80, o: P(t, 1.0, 1.3) })`
- **Landing with bounce:** `const a = spring(t, 1.0); put(el, { s: lerp(0.8, 1, Math.min(a, 1.08)), o: t < 1 ? 0 : 1 })`
- **Stagger:** `items.forEach((e, i) => put(e, { y: (1 - eo4(P(t, 1 + i * 0.08, 1.5 + i * 0.08))) * 60, o: P(t, 1 + i * 0.08, 1.2 + i * 0.08) }))`
- **Camera move:** wrap content in a div with `transform-origin: 0 0`; `put(cam, { s: lerp(1, 1.6, eio4(P(t, 8, 9))), x: -fx * (s - 1), y: -fy * (s - 1) })` to zoom toward point `(fx, fy)`.
- **Circular reveal:** `el.style.clipPath = 'circle(' + r + 'px at ' + cx + 'px ' + cy + 'px)'` with `r = 2000 * eio3(P(t, a, b))`.
- **Typed text:** `el.textContent = full.slice(0, Math.floor(full.length * P(t, a, b)))`; add a blinking caret with `Math.floor(t * 2) % 2`.
- **Counter:** `Math.round(target * eo3(P(t, a, b)))`, finishing before the element fades.
- **Cursor path:** interpolate between element rects (captured from the real UI) with `eio3`; add a click ring (a circle scaled 0 -> 1 with fading opacity) at the click cue.
- **Particles:** precompute velocities with `PV.rng`; position at time `d` since burst: `x0 + vx * (1 - exp(-d*k)) / k`, `y0 + vy * ... + g * d * d`.
- **3D carousel:** parent `perspective: 2400px`, cards `transform: rotateY(a) translateZ(R)` via `put({ry, z})`.
- **Painted background:** a `<canvas>` redrawn from scratch in every `seek` (gradients with `globalCompositeOperation = 'lighter'`, dot grid, vignette, seeded grain).

## `lib/synth.py`

```python
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lib'))
from synth import *
C = load_cues(HERE); init(C['duration'])
add(kick(), C['hit'])
master(default_out(HERE))        # -> out/<project>/score.wav
```

| function | notes |
|---|---|
| `init(duration, seed=7)` | start a mix; reseeds the noise generator so results are reproducible |
| `add(sound, t, gain=1, pan=0, send=0)` | place a mono array at time `t`; `pan` -1..1; `send` 0..1 feeds the reverb |
| `master(path, body=None, target_rms=-15, ceiling=-1, reverb_mix=0.5, tail=0.9)` | reverb, level the `body=(start,end)` seconds to `target_rms` dBFS, tanh soft-limit at `ceiling`, fade out `tail` s, write 16-bit stereo wav |
| `load_cues(dir)`, `default_out(dir)` | read cues.json; `out/<project>/score.wav` (or `argv[1]`) |
| `kick(vol)` `hat(vol, open_)` `clap(vol)` `boom(d, vol)` | drums / impact |
| `bass(midi, d, vol)` `pluck(midi, d, vol, bright)` `bell(midi, d, vol)` `blip(midi, vol, d)` `pad([midi...], d, vol, swell)` | tonal |
| `tick(vol, freq)` | keyboard / click; call once per typed letter |
| `whoosh(d, vol, up, f0, f1)` `riser(d, vol)` `reverse_hit(d, vol)` `noise_sweep(d, f0, f1, vol, up)` | movement and tension |
| `tt(d)` `midi(m)` `lp hp bp` `env` `expdecay` | building blocks for your own instruments: return `np.array` mono at 44.1 kHz |

Musical shortcuts: MIDI 45 = A2, 57 = A3, 69 = A4, 81 = A5, 93 = A6. A minor / C major pentatonic notes always sound fine over each other. A groove: kick every beat, hat on the off-beat, clap on 2 and 4, 16th-note `pluck` arpeggio through a 4-chord loop, `bass` on 8ths. `examples/pitchcraft/sound.py` is a complete 15 s score.

## tools

```bash
node tools/doctor.js                                      # check dependencies
node  tools/new-project.js <name>                         # scaffold projects/<name> from the starter
node  tools/render.js <project> --stills 1,2.5,9          # PNG stills -> out/<name>/stills/
node  tools/render.js <project> --frames [--workers N] [--only 120-180] [--keep]
python3 <project>/sound.py                                # -> out/<name>/score.wav
node  tools/build.js <project> [out.mp4]                  # CRF=18 PRESET=slow by default
node  tools/render.js <project> --mp4 [out.mp4]           # render + build in one pass, no frame files (run sound.py first)
node  tools/render.js <project> --sound                   # score.wav from the page's window.__soundtrack()
node  tools/loudness.js <wav-or-mp4> [--every 0.5]        # short-term loudness over time, integrated, range, true + sample peak
python3 tools/sheet.py out/sheet.png a.png b.png ...      # contact sheet (needs Pillow)
npm test                                                  # end-to-end smoke test (~30 s)
```

Environment: `PV_CHANNEL=chrome` (default, the installed Chrome), `PV_CHANNEL=chromium` (Playwright's full Chromium) or `PV_CHANNEL=""` (Playwright's headless shell, which draws WebGL in software). Chrome and Chromium use the graphics card without extra flags. `PV_PYTHON` = the Python that `doctor.js` and `npm test` run (default `python3`, or `python` on Windows).

Timing, for planning: the 15 s example is 3,600 JPEG screenshots and takes about 1-5 minutes on a modern laptop; a 6 s starter about a third of that. `subframes: 2` halves it with a lighter blur; `subframes: 1` is the fast draft mode.
