#!/usr/bin/env node
/* smoke.js - end-to-end test of the whole pipeline on a tiny copy of the starter (1 s, 30 fps, 2 sub-frames):
   scene loads -> stills render -> frames render -> synth writes a wav -> ffmpeg builds an mp4 with H.264 + AAC at the right size/duration.
   Also checks determinism: the same time must produce byte-identical stills.   npm test   (PV_PYTHON picks the Python, as in tools/doctor.js) */
const { execSync, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { handler } = require('../tools/serve');
const REPO = path.join(__dirname, '..'), P = path.join(REPO, 'projects', '_selftest'), V = path.join(REPO, 'projects', '_selftest_video');
const PY = process.env.PV_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const sh = c => execSync(c, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const exe = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();  // no shell: paths with spaces are safe
// The RGB of one pixel of an image (or of the first frame of a video), read with ffmpeg.
const pixel = (file, x, y) => [...execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
let pass = 0; const ok = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '\n', e.message); cleanup(); process.exit(1); } };
const cleanup = () => { for (const d of [P, V, path.join(REPO, 'out', '_selftest'), path.join(REPO, 'out', '_selftest_video')]) fs.rmSync(d, { recursive: true, force: true }); };
const OUT = path.join(REPO, 'out', '_selftest');

(async () => {
  cleanup(); await ok('new-project copies the starter', () => { sh('node tools/new-project.js _selftest'); assert(fs.existsSync(path.join(P, 'index.html'))); });
  const cues = JSON.parse(fs.readFileSync(path.join(P, 'cues.json'), 'utf8')); Object.assign(cues, { fps: 30, duration: 1, subframes: 2, hit: 0.5, cardIn: 0.2, titleIn: 0.1, ctaIn: 0.6, out: 0.9 });
  fs.writeFileSync(path.join(P, 'cues.json'), JSON.stringify(cues));

  await ok('stills render without errors', () => { sh('node tools/render.js projects/_selftest --stills 0.3,0.7'); assert(fs.statSync(path.join(OUT, 'stills', 't0.30.png')).size > 5000); });
  await ok('rendering is deterministic (same sequence, same pixels)', () => { const a = fs.readFileSync(path.join(OUT, 'stills', 't0.70.png')); sh('node tools/render.js projects/_selftest --stills 0.3,0.7'); assert(a.equals(fs.readFileSync(path.join(OUT, 'stills', 't0.70.png')))); });
  await ok('time moves the picture', () => assert(!fs.readFileSync(path.join(OUT, 'stills', 't0.30.png')).equals(fs.readFileSync(path.join(OUT, 'stills', 't0.70.png')))));
  await ok('sub-frames render', () => { sh('node tools/render.js projects/_selftest --frames --workers 2'); assert.strictEqual(fs.readdirSync(path.join(OUT, 'frames')).length, 60); });
  await ok('sound renders', () => { exe(PY, [path.join('projects', '_selftest', 'sound.py')]); assert(fs.statSync(path.join(OUT, 'score.wav')).size > 100000); });
  await ok('mp4 builds with video + audio', () => {
    sh('node tools/build.js projects/_selftest'); const j = JSON.parse(exe('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(OUT, '_selftest.mp4')]));
    const v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
    assert.strictEqual(v.codec_name, 'h264'); assert.strictEqual(v.pix_fmt, 'yuv420p'); assert.strictEqual(v.width, 1920); assert.strictEqual(v.height, 1080);
    assert.strictEqual(v.nb_frames, '30'); assert(Math.abs(parseFloat(v.duration) - 1) < 0.05); assert.strictEqual(a.codec_name, 'aac');
  });

  await ok('the file server answers byte ranges', async () => {
    const srv = http.createServer(handler(REPO)).listen(0, '127.0.0.1'); await new Promise(r => srv.on('listening', r));
    const get = range => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: srv.address().port, path: '/package.json', headers: range ? { range } : {} }, r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => res({ status: r.statusCode, h: r.headers, body: Buffer.concat(b) })); }).on('error', rej));
    const file = fs.readFileSync(path.join(REPO, 'package.json')), n = file.length;
    try {
      const all = await get(); assert.strictEqual(all.status, 200); assert.strictEqual(all.h['accept-ranges'], 'bytes'); assert(all.body.equals(file));
      const head = await get('bytes=0-9'); assert.strictEqual(head.status, 206); assert.strictEqual(head.h['content-range'], `bytes 0-9/${n}`); assert(head.body.equals(file.subarray(0, 10)));
      const tail = await get('bytes=-5'); assert.strictEqual(tail.status, 206); assert(tail.body.equals(file.subarray(n - 5)));
      const rest = await get('bytes=10-'); assert.strictEqual(rest.status, 206); assert(rest.body.equals(file.subarray(10)));
      const past = await get(`bytes=${n}-`); assert.strictEqual(past.status, 416); assert.strictEqual(past.h['content-range'], `bytes */${n}`);
    } finally { srv.close(); }
  });
  await ok('a video in the scene seeks to the right frame', () => {
    // A 3 s clip that is red, then green, then blue: a still at 0.5 / 1.5 / 2.5 s shows which second the video really reached.
    fs.mkdirSync(V, { recursive: true });
    exe('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=lime:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=30:d=1',
      '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', path.join(V, 'clip.mp4')]);
    fs.writeFileSync(path.join(V, 'cues.json'), JSON.stringify({ fps: 30, duration: 3, subframes: 1, width: 320, height: 180 }));
    fs.writeFileSync(path.join(V, 'index.html'), `<!doctype html><html><body style="margin:0;background:#000">
<video id="v" src="clip.mp4" muted playsinline preload="auto" style="width:320px;height:180px;display:block"></video><script>
const v = document.getElementById('v');
window.seek = t => new Promise(res => { v.addEventListener('seeked', () => requestAnimationFrame(() => requestAnimationFrame(res)), { once: true }); setTimeout(res, 4000); v.currentTime = t; });
if (v.readyState >= 2) window.__ready = true; else v.addEventListener('loadeddata', () => { window.__ready = true; }, { once: true });
</script></body></html>`);
    sh('node tools/render.js projects/_selftest_video --stills 0.5,1.5,2.5');
    const [r, g, b] = ['0.50', '1.50', '2.50'].map(t => pixel(path.join(REPO, 'out', '_selftest_video', 'stills', `t${t}.png`), 160, 90));
    assert(r[0] > 200 && r[1] < 80, `0.5 s should be red, got ${r}`); assert(g[1] > 200 && g[0] < 100, `1.5 s should be green, got ${g}`); assert(b[2] > 200 && b[1] < 80, `2.5 s should be blue, got ${b}`);
  });

  await ok('a broken scene fails loudly', () => {
    fs.writeFileSync(path.join(P, 'scene.js'), 'throw new Error("boom")'); let failed = false;
    try { sh('node tools/render.js projects/_selftest --stills 0.1'); } catch (e) { failed = true; assert(/PAGE ERROR|__ready/.test(String(e.stdout) + String(e.stderr))); }
    assert(failed);
  });
  cleanup(); console.log(`\n${pass} passed`);
})();
