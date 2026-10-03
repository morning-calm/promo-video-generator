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
const pixel = (file, x, y) => [...execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
let pass = 0; const ok = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '\n', e.message); cleanup(); process.exit(1); } };
// Every test project is named _selftest*; cleanup() removes them and their output.
const cleanup = () => { for (const top of ['projects', 'out']) { const d = path.join(REPO, top); for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) if (n.startsWith('_selftest')) fs.rmSync(path.join(d, n), { recursive: true, force: true }); } };
const fixture = (name, files) => { const d = path.join(REPO, 'projects', name); for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } return d; };
const fails = c => { try { sh(c); return null; } catch (e) { return String(e.stdout) + String(e.stderr); } };  // the command's output if it failed, else null
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

  await ok('crf and preset come from render settings, and CRF / PRESET in the environment win', () => {
    // x264 writes its settings into the stream: "crf=18.0", and subme=8 for preset slow, 7 for medium.
    const x264 = mp4 => (/options: ([^\0]*)/.exec(fs.readFileSync(mp4).toString('latin1')) || [, ''])[1];
    const cuesFile = path.join(P, 'cues.json'), base = JSON.parse(fs.readFileSync(cuesFile, 'utf8'));
    const build = (render, env, name) => {
      fs.writeFileSync(cuesFile, JSON.stringify(render ? { ...base, render } : base));
      execFileSync('node', ['tools/build.js', 'projects/_selftest', path.join(OUT, name)], { cwd: REPO, stdio: 'pipe', env: { ...process.env, CRF: '', PRESET: '', ...env } });
      return x264(path.join(OUT, name));
    };
    try {
      const d = build(null, {}, 'default.mp4'); assert(/crf=18\.0/.test(d) && /subme=8/.test(d), `defaults are crf 18 / slow: ${d.slice(0, 80)}`);
      const r = build({ crf: 30, preset: 'medium' }, {}, 'render.mp4'); assert(/crf=30\.0/.test(r) && /subme=7/.test(r), 'render.crf 30 and render.preset medium');
      const e = build({ crf: 30, preset: 'medium' }, { CRF: '22', PRESET: 'slow' }, 'env.mp4'); assert(/crf=22\.0/.test(e) && /subme=8/.test(e), 'CRF and PRESET override render settings');
      fs.writeFileSync(cuesFile, JSON.stringify({ ...base, render: { preset: 'quick' } }));
      const out = fails('node tools/build.js projects/_selftest'); assert(out && /preset must be one of/.test(out), 'an unknown preset must fail');
    } finally { fs.writeFileSync(cuesFile, JSON.stringify(base)); }
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

  await ok('render.page renders another page of the project and keeps its #hash', () => {
    fixture('_selftest_page', { 'cues.json': JSON.stringify({ fps: 30, duration: 1, subframes: 1, width: 320, height: 180, render: { page: 'sub/page.html#go' } }),
      'sub/page.html': `<!doctype html><html><body style="margin:0"><script>
document.body.style.cssText = 'margin:0;height:180px;background:' + (location.hash === '#go' ? 'red' : 'blue'); window.seek = () => {}; window.__ready = true;
</script></body></html>` });
    sh('node tools/render.js projects/_selftest_page --stills 0.5');
    const c = pixel(path.join(REPO, 'out', '_selftest_page', 'stills', 't0.50.png'), 160, 90); assert(c[0] > 200 && c[2] < 80, `expected red (page found, hash kept), got ${c}`);
    fixture('_selftest_nopage', { 'cues.json': JSON.stringify({ fps: 30, duration: 1, render: { page: 'missing.html' } }) });
    const out = fails('node tools/render.js projects/_selftest_nopage --stills 0.5'); assert(out && /No missing\.html in/.test(out), 'a missing render.page must fail with its name');
  });

  await ok('sub-frames sample the shutter ends by default and slice centres with render.sampling "centre"', () => {
    // The page paints t into its red channel (6000 levels per second). Frame 0, sub-frame 1 of 2 at 30 fps with a 0.5 shutter is at
    // t = 0.25/30 (red 50) when sampling the ends, and t = 0.125/30 (red 25) at the slice centres.
    const probe = sampling => fixture(`_selftest_sampling_${sampling || 'default'}`, { 'cues.json': JSON.stringify({ fps: 30, duration: 0.2, subframes: 2, shutter: 0.5, width: 64, height: 64, ...(sampling ? { render: { sampling } } : {}) }),
      'index.html': `<!doctype html><html><body style="margin:0;height:64px"><script>window.seek = t => { document.body.style.background = 'rgb(' + Math.round(t * 6000) + ',0,0)'; }; window.__ready = true;</script></body></html>` });
    const red = sampling => { probe(sampling); sh(`node tools/render.js projects/_selftest_sampling_${sampling || 'default'} --frames --workers 1`); return pixel(path.join(REPO, 'out', `_selftest_sampling_${sampling || 'default'}`, 'frames', '000001.jpg'), 32, 32)[0]; };
    const ends = red(null), centre = red('centre');
    assert(Math.abs(ends - 50) <= 3, `default sampling: expected red ~50, got ${ends}`); assert(Math.abs(centre - 25) <= 3, `centre sampling: expected red ~25, got ${centre}`);
    fixture('_selftest_sampling_bad', { 'cues.json': JSON.stringify({ fps: 30, duration: 0.2, render: { sampling: 'middle' } }), 'index.html': '' });
    const out = fails('node tools/render.js projects/_selftest_sampling_bad --stills 0'); assert(out && /render\.sampling must be/.test(out), 'an unknown render.sampling must fail');
  });

  await ok('a broken scene fails loudly', () => {
    fs.writeFileSync(path.join(P, 'scene.js'), 'throw new Error("boom")'); let failed = false;
    try { sh('node tools/render.js projects/_selftest --stills 0.1'); } catch (e) { failed = true; assert(/PAGE ERROR|__ready/.test(String(e.stdout) + String(e.stderr))); }
    assert(failed);
  });
  cleanup(); console.log(`\n${pass} passed`);
})();
