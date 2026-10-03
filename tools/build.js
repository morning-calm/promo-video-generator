#!/usr/bin/env node
/* build.js - turn rendered sub-frames (+ optional score.wav) into an H.264 / AAC mp4.
     node tools/build.js <project> [output.mp4]
   Reads fps / duration / subframes from <project>/cues.json.  Looks for out/<name>/frames/*.jpg and out/<name>/score.wav.
     CRF=18 (default; lower = bigger, better)   PRESET=slow (default)   - or set "render": { "crf", "preset" } in cues.json
   The ffmpeg command itself is in tools/encode.js. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const { settings, ffmpegArgs } = require('./encode');
if (process.argv.length < 3) { console.log('usage: node tools/build.js <project-dir> [output.mp4]'); process.exit(2); }
const REPO = path.join(__dirname, '..'), PROJ = path.resolve(process.argv[2]), NAME = path.basename(PROJ);
const OUTDIR = path.join(REPO, 'out', NAME), FRAMES = path.join(OUTDIR, 'frames'), WAV = path.join(OUTDIR, 'score.wav');
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(OUTDIR, NAME + '.mp4');
if (!fs.existsSync(path.join(PROJ, 'cues.json'))) { console.log(`No cues.json in ${PROJ}`); process.exit(2); }
let S; try { S = settings(JSON.parse(fs.readFileSync(path.join(PROJ, 'cues.json'), 'utf8'))); } catch (e) { console.log(e.message); process.exit(2); }
const N = Math.round(S.fps * S.duration) * S.S, COUNT = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter(f => f.endsWith('.jpg')).length : 0;
if (COUNT < N) { console.log(`Expected ${N} frames in ${FRAMES} but found ${COUNT}. Run: node tools/render.js ${process.argv[2]} --frames`); process.exit(1); }
const wav = fs.existsSync(WAV) ? WAV : null;
if (!wav) console.log(`(no ${WAV} - building a silent video)`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// Arguments go straight to the program (no shell), so paths with spaces need no quoting on any OS.
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.error) { console.error(`${cmd}: ${r.error.message}`); process.exit(1); } if (r.status !== 0) process.exit(r.status ?? 1); };
run('ffmpeg', ffmpegArgs(S, { frames: path.join(FRAMES, '%06d.jpg'), wav, out: OUT }));
run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,duration', '-of', 'default=nw=1', OUT]);
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
