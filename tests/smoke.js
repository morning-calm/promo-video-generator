#!/usr/bin/env node
/* smoke.js - end-to-end test of the whole pipeline on a tiny copy of the starter (1 s, 30 fps, 2 sub-frames):
   scene loads -> stills render -> frames render -> synth writes a wav -> ffmpeg builds an mp4 with H.264 + AAC at the right size/duration.
   Also checks determinism: the same time must produce byte-identical stills.   npm test   (PV_PYTHON picks the Python, as in tools/doctor.js) */
const { execSync, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..'), P = path.join(REPO, 'projects', '_selftest');
const PY = process.env.PV_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const sh = c => execSync(c, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const exe = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();  // no shell: paths with spaces are safe
let pass = 0; const ok = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '\n', e.message); cleanup(); process.exit(1); } };
const cleanup = () => { fs.rmSync(P, { recursive: true, force: true }); fs.rmSync(path.join(REPO, 'out', '_selftest'), { recursive: true, force: true }); };
cleanup(); ok('new-project copies the starter', () => { sh('node tools/new-project.js _selftest'); assert(fs.existsSync(path.join(P, 'index.html'))); });
const cues = JSON.parse(fs.readFileSync(path.join(P, 'cues.json'), 'utf8')); Object.assign(cues, { fps: 30, duration: 1, subframes: 2, hit: 0.5, cardIn: 0.2, titleIn: 0.1, ctaIn: 0.6, out: 0.9 });
fs.writeFileSync(path.join(P, 'cues.json'), JSON.stringify(cues));
const OUT = path.join(REPO, 'out', '_selftest');

ok('stills render without errors', () => { sh('node tools/render.js projects/_selftest --stills 0.3,0.7'); assert(fs.statSync(path.join(OUT, 'stills', 't0.30.png')).size > 5000); });
ok('rendering is deterministic (same sequence, same pixels)', () => { const a = fs.readFileSync(path.join(OUT, 'stills', 't0.70.png')); sh('node tools/render.js projects/_selftest --stills 0.3,0.7'); assert(a.equals(fs.readFileSync(path.join(OUT, 'stills', 't0.70.png')))); });
ok('time moves the picture', () => assert(!fs.readFileSync(path.join(OUT, 'stills', 't0.30.png')).equals(fs.readFileSync(path.join(OUT, 'stills', 't0.70.png')))));
ok('sub-frames render', () => { sh('node tools/render.js projects/_selftest --frames --workers 2'); assert.strictEqual(fs.readdirSync(path.join(OUT, 'frames')).length, 60); });
ok('sound renders', () => { exe(PY, [path.join('projects', '_selftest', 'sound.py')]); assert(fs.statSync(path.join(OUT, 'score.wav')).size > 100000); });
ok('mp4 builds with video + audio', () => {
  sh('node tools/build.js projects/_selftest'); const j = JSON.parse(exe('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(OUT, '_selftest.mp4')]));
  const v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
  assert.strictEqual(v.codec_name, 'h264'); assert.strictEqual(v.pix_fmt, 'yuv420p'); assert.strictEqual(v.width, 1920); assert.strictEqual(v.height, 1080);
  assert.strictEqual(v.nb_frames, '30'); assert(Math.abs(parseFloat(v.duration) - 1) < 0.05); assert.strictEqual(a.codec_name, 'aac');
});
ok('a broken scene fails loudly', () => {
  fs.writeFileSync(path.join(P, 'scene.js'), 'throw new Error("boom")'); let failed = false;
  try { sh('node tools/render.js projects/_selftest --stills 0.1'); } catch (e) { failed = true; assert(/PAGE ERROR|__ready/.test(String(e.stdout) + String(e.stderr))); }
  assert(failed);
});
cleanup(); console.log(`\n${pass} passed`);
