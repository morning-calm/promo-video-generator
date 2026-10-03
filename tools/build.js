#!/usr/bin/env node
/* build.js - turn rendered sub-frames (+ optional score.wav) into an H.264 / AAC mp4.
     node tools/build.js <project> [output.mp4] [--variant name]
   Reads fps / duration / subframes from <project>/cues.json.  Looks for out/<name>/frames/*.jpg and out/<name>/score.wav
   (out/<name>-<variant>/ with --variant, see tools/cues.js).
     CRF=18 (default; lower = bigger, better)   PRESET=slow (default)   - or set "render": { "crf", "preset" } in cues.json
   The ffmpeg command itself is in tools/encode.js. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const { settings, ffmpegArgs, loudness, describe } = require('./encode'), { loadCues, findScore } = require('./cues');
if (process.argv.length < 3 || process.argv[2].startsWith('--')) { console.log('usage: node tools/build.js <project-dir> [output.mp4] [--variant name]'); process.exit(2); }
const vi = process.argv.indexOf('--variant'), VARIANT = vi > 0 ? process.argv[vi + 1] : null;
if (vi > 0 && (!VARIANT || VARIANT.startsWith('--'))) { console.log('--variant needs a name'); process.exit(2); }
const REPO = path.join(__dirname, '..'), PROJ = path.resolve(process.argv[2]);
let C, NAME, BASE, S; try { ({ cues: C, name: NAME, base: BASE } = loadCues(PROJ, VARIANT)); S = settings(C, PROJ); } catch (e) { console.log(e.message); process.exit(2); }
const OUTDIR = path.join(REPO, 'out', NAME), FRAMES = path.join(OUTDIR, 'frames'), WAV = path.join(OUTDIR, 'score.wav');
const OUT = process.argv[3] && !process.argv[3].startsWith('--') ? path.resolve(process.argv[3]) : path.join(OUTDIR, NAME + '.mp4');
// Sub-frame files are numbered f*S+s; with an intro or outro only the page's own frames (S.first .. S.last-1) are rendered.
const inRange = f => /^\d+\.jpg$/.test(f) && Number(f.slice(0, -4)) >= S.first * S.S && Number(f.slice(0, -4)) < S.last * S.S;
const N = (S.last - S.first) * S.S, COUNT = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter(inRange).length : 0;
if (COUNT < N) { console.log(`Expected ${N} frames in ${FRAMES} but found ${COUNT}. Run: node tools/render.js ${process.argv[2]} --frames${VARIANT ? ' --variant ' + VARIANT : ''}`); process.exit(1); }
const score = findScore(path.join(REPO, 'out'), NAME, BASE), wav = score && score.file;
if (!score) console.log(`(no ${WAV} - building a silent video)`); else if (score.shared) console.log(`(no score.wav of its own - using the base cut's ${wav})`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// Arguments go straight to the program (no shell), so paths with spaces need no quoting on any OS.
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.error) { console.error(`${cmd}: ${r.error.message}`); process.exit(1); } if (r.status !== 0) process.exit(r.status ?? 1); };
let L; try { L = loudness(S, wav); } catch (e) { console.log(e.message); process.exit(1); }
if (L) console.log(describe(S, L));
run('ffmpeg', ffmpegArgs(S, { frames: path.join(FRAMES, '%06d.jpg'), wav, out: OUT, af: L && L.filter }));
run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,duration', '-of', 'default=nw=1', OUT]);
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
