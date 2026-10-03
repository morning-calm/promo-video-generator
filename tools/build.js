#!/usr/bin/env node
/* build.js - turn rendered sub-frames (+ optional score.wav) into an H.264 / AAC mp4.
     node tools/build.js <project> [output.mp4]
   Reads fps / duration / subframes from <project>/cues.json.  Looks for out/<name>/frames/*.jpg and out/<name>/score.wav.
     CRF=18 (default; lower = bigger, better)   PRESET=slow (default)
   The S sub-frames of each frame are averaged with ffmpeg's tmix (that average IS the motion blur).  tmix averages the TRAILING window, so the
   frame we keep from each group is the last one: n%S == S-1.  JPEG frames are full-range, so they are converted to TV range (yuv420p, bt709) -
   without this players show a yuvj420p file with washed-out or crushed colours. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
if (process.argv.length < 3) { console.log('usage: node tools/build.js <project-dir> [output.mp4]'); process.exit(2); }
const REPO = path.join(__dirname, '..'), PROJ = path.resolve(process.argv[2]), NAME = path.basename(PROJ);
const OUTDIR = path.join(REPO, 'out', NAME), FRAMES = path.join(OUTDIR, 'frames'), WAV = path.join(OUTDIR, 'score.wav');
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(OUTDIR, NAME + '.mp4');
if (!fs.existsSync(path.join(PROJ, 'cues.json'))) { console.log(`No cues.json in ${PROJ}`); process.exit(2); }
const C = JSON.parse(fs.readFileSync(path.join(PROJ, 'cues.json'), 'utf8')), FPS = C.fps || 60, DUR = C.duration, S = C.subframes || 4;
const N = Math.round(FPS * DUR) * S, COUNT = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter(f => f.endsWith('.jpg')).length : 0;
if (COUNT < N) { console.log(`Expected ${N} frames in ${FRAMES} but found ${COUNT}. Run: node tools/render.js ${process.argv[2]} --frames`); process.exit(1); }
let VF = 'scale=in_range=full:out_range=tv:flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709,format=yuv420p';
if (S > 1) VF = `tmix=frames=${S},select='eq(mod(n,${S}),${S - 1})',setpts=N/(${FPS}*TB),${VF}`;
const AUDIO = fs.existsSync(WAV) ? ['-i', WAV, '-c:a', 'aac', '-b:a', '256k'] : [];
if (!AUDIO.length) console.log(`(no ${WAV} - building a silent video)`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// Arguments go straight to the program (no shell), so paths with spaces need no quoting on any OS.
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.error) { console.error(`${cmd}: ${r.error.message}`); process.exit(1); } if (r.status !== 0) process.exit(r.status ?? 1); };
run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS * S), '-i', path.join(FRAMES, '%06d.jpg'), ...AUDIO,
  '-vf', VF, '-r', String(FPS), '-c:v', 'libx264', '-preset', process.env.PRESET || 'slow', '-crf', process.env.CRF || '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-t', String(DUR), '-movflags', '+faststart', OUT]);
run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,duration', '-of', 'default=nw=1', OUT]);
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
