# Lessons and techniques

Hard-won notes from building the Pitchcraft film. Each one cost real time; none are obvious.

## Rendering

- **Do not use `will-change: transform`** on animated elements. Chrome then keeps the raster scale from the first time the layer appeared, so a card that scales 0.9 -> 1 is rasterised once and stretched, and the result depends on the order frames were rendered in (parallel workers make that random). Without it Chrome re-rasterises at the right scale. Measured: with `will-change`, the same time rendered differently depending on which time was rendered before it; without it the difference dropped to a few anti-aliased pixels on one mid-rotation letter.
- **Determinism has limits.** Rendering the same sequence twice gives byte-identical PNGs (`npm test` checks this). Different histories can differ by a few anti-aliased pixels on glyphs that are mid-rotation. That is invisible in motion, but do not byte-compare frames from different render orders.
- **Hide containers with `display:none`.** A child with `visibility:visible` overrides a parent's `visibility:hidden` and leaks through. The symptom was "Present it." tiles ghosting on the end card.
- **Load fonts you only use later.** Pass them to `PV.loaded([...])`, otherwise text measured at t=0 uses a fallback and positions are wrong.
- **JPEG sub-frames are full-range.** Convert to TV range explicitly or you get `yuvj420p`.
- **`tmix` averages the trailing window**, so keep `n % S == S-1`. Verified by comparing the output frame against a numpy mean of the raw sub-frames.
- **Orphaned Chromes.** A killed render leaves Playwright's Chrome running (parent PID 1) and starves the next run into 30 s screenshot timeouts. Find them by `--remote-debugging-pipe` in the command line and kill those PIDs only.
- **Speed.** 3,600 screenshots at 1080p took 70 s with 6 workers on an idle 10-core Mac, and many times longer when other processes were hammering the CPU. Check `uptime` if it is slow.

## Verification without eyes (or ears)

- Image descriptions from a model are unreliable for details (wrong counts, invented elements, missed overlaps). Use them to get a rough read, then **measure**: `getBoundingClientRect()` of the elements involved at the exact time, pixel statistics (is a region dark? where is the bounding box of pixels > 200?), pixel diffs between two stills.
- To prove a refactor changed nothing, render stills before and after and diff them numerically (max difference 0).
- Compare the final MP4 against the raw sub-frames at a few frames to confirm the blur window; expect a small mean error (~1-2 levels) from H.264.
- Audio: per-second RMS and peak, `volumedetect` on the mp4, and byte-compare WAVs when refactoring (`maxdiff 0`). Remember you have not listened to it.
- Counters and typed text: make sure the final value is on screen before the exit starts.

## Motion design

- Everything that arrives eases **out** (`eo4`), everything that leaves eases **in** (`ei3`), moves between rest positions ease in-out (`eio4`).
- Things that *land* use a spring (freq ~2, damping ~6.5): it overshoots ~10% and settles in ~0.5 s.
- Stagger groups 0.03-0.15 s apart; per-letter reveals ~0.035 s apart.
- Pair every impact with sound + camera shake + particles/flash on the **same** cue; the combination is what sells weight.
- Build tension with a riser, a short silence or reverse-hit just before the drop, then hit hard.
- Camera: scale + translate a wrapper with `transform-origin: 0 0`; zoom toward a point with `translate = -p * (s - 1)`.
- Show the real product. A cursor that lands on a real button (rect captured from the real UI) is worth more than any mock.
- Hold the end card >= 1.5 s with name, tagline, URL. Make sure the last frame is a good thumbnail.
- Keep claims honest. If you cannot verify it, leave it out.

## Sound design recipes (lib/synth.py)

| moment | recipe |
|---|---|
| keyboard typing | `tick(0.22, 2200 + 700*rand)` per character, +-10 ms jitter, quiet reverb send |
| UI pop / chip | `blip(midi, vol, 0.3)` rising in pitch for successive items, reverb send 0.7 |
| click | `tick(0.5, 1500-1800)` + short blip |
| whoosh (in) | `whoosh(0.5, vol, True, 300, 6000)` ending on the hit; (out) `up=False` |
| drop / impact | `reverse_hit` 0.5 s before, then `boom(2, 0.85)` + `kick(1)` + 3-6 `bell` notes arpeggiated 0.08 s apart |
| groove | `kick` every beat, `hat` on off-beats, `clap` on 2 and 4, 16th `pluck` arp through Am7-Fmaj7-C-G, `bass` on 8ths |
| end card | `pad` on a 5-note chord (swell 0.12 s), low `pad`, ascending bell run, a sparkle tail of quiet high bells |
| loudness | `master(body=(start, end))` normalises that span to ~-15 dBFS RMS; peaks soft-limited at -1 dBFS |
