#!/usr/bin/env node
/* render.js - step a scene through time with headless Chrome and save screenshots.

   node tools/render.js <project> --stills 0.5,3.2,9      PNG stills at those seconds           -> out/<name>/stills/t<sec>.png
   node tools/render.js <project> --frames                every sub-frame as JPEG               -> out/<name>/frames/NNNNNN.jpg
        [--workers N]      parallel Chrome pages (default: cores - 2, max 6)
        [--only 120-180]   render just frames 120..180 (quick spot-checks; still wipes the frames dir unless --keep)
        [--keep]           do not wipe the frames dir first
   node tools/render.js <project> --mp4 [out.mp4]         render and encode in one pass, no frame files on disk -> out/<name>/<name>.mp4
        [--workers N]      as above.  Uses out/<name>/score.wav if it exists; same encode as tools/build.js
   node tools/render.js <project> --sound                 just the page's own soundtrack (see below)            -> out/<name>/score.wav
   A page may make its own soundtrack: window.__soundtrack = async () => <base64-encoded WAV>.  Such a page owns score.wav:
   --frames, --mp4 and --sound rewrite it from the page every run.  Pages without it keep using sound.py.
   <project> is a folder (under this repo) containing index.html and cues.json.  Optional env: PV_CHANNEL=chrome (default) | chromium (Playwright's) | "" (Playwright's headless shell).
   cues.json "render": { "page": "dist/reel.html#clean" } renders another page of the project (path relative to the project; ?query and #hash are kept).

   Frame f, sub-frame s of S is rendered at   t = (f + (s/(S-1) - 0.5) * shutter) / fps   (shutter = fraction of a frame the "camera" is open, default 0.5).
   With "render": { "sampling": "centre" } it is   t = (f + ((s+0.5)/S - 0.5) * shutter) / fps   : the middle of S equal slices of the open shutter.
   tools/build.js averages the S sub-frames of each frame, so anything that moves during the shutter is blurred like real film. */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { handler } = require('./serve'), { settings, ffmpegArgs, loudness, describe } = require('./encode');
const REPO = path.join(__dirname, '..');
const arg = n => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

const projectArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (!projectArg || !(arg('stills') || arg('frames') || arg('mp4') || arg('sound'))) { console.log('usage: node tools/render.js <project-dir> (--stills 1,2.5 | --frames [--workers N] [--only a-b] [--keep] | --mp4 [out.mp4] [--workers N] | --sound)'); process.exit(2); }
const PROJECT = path.resolve(projectArg);
if (!PROJECT.startsWith(REPO + path.sep)) { console.error('The project folder must live inside this repo (so ../../lib/motion.js resolves). Try projects/<name>.'); process.exit(2); }
const NAME = path.basename(PROJECT), OUT = path.join(REPO, 'out', NAME);
if (!fs.existsSync(path.join(PROJECT, 'cues.json'))) { console.error('No cues.json in ' + PROJECT); process.exit(2); }
const CUES = JSON.parse(fs.readFileSync(path.join(PROJECT, 'cues.json'), 'utf8')), R = CUES.render || {};
const PAGE = R.page || 'index.html';
if (!fs.existsSync(path.join(PROJECT, PAGE.split(/[?#]/)[0]))) { console.error(`No ${PAGE.split(/[?#]/)[0]} in ${PROJECT}`); process.exit(2); }
const FPS = CUES.fps || 60, DUR = CUES.duration, S = CUES.subframes || 4, SHUTTER = CUES.shutter === undefined ? 0.5 : CUES.shutter, W = CUES.width || 1920, H = CUES.height || 1080, DPR = CUES.dpr || 1;
if (!DUR) { console.error('cues.json needs "duration" (seconds)'); process.exit(2); }
const SAMPLING = R.sampling || 'ends';
if (!['ends', 'centre'].includes(SAMPLING)) { console.error(`render.sampling must be "ends" or "centre", not ${JSON.stringify(R.sampling)}`); process.exit(2); }
const offset = s => S === 1 ? 0 : (SAMPLING === 'centre' ? (s + 0.5) / S - 0.5 : s / (S - 1) - 0.5) * SHUTTER;  // sub-frame s, in frames from the frame's own time
const timeOf = (f, s) => Math.max(0, Math.min(DUR, (f + offset(s)) / FPS));
const MODE = arg('stills') ? 'stills' : arg('frames') ? 'frames' : arg('mp4') ? 'mp4' : 'sound';
let ENC; if (MODE === 'mp4') { try { ENC = settings(CUES); } catch (e) { console.error(e.message); process.exit(2); } }

(async () => {
  const srv = http.createServer(handler(REPO)).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}/${path.relative(REPO, PROJECT).split(path.sep).join('/')}/${PAGE}`;
  const channel = process.env.PV_CHANNEL === undefined ? 'chrome' : process.env.PV_CHANNEL;
  const b = await chromium.launch({ channel: channel || undefined, args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  let failed = false;
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), pg = await ctx.newPage();
    pg.on('pageerror', e => { failed = true; console.log('PAGE ERROR:', e.message); });
    pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('console.error:', m.text()); });
    pg.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) { failed = true; console.log(`HTTP ${r.status()} (missing file?): ${r.url()}`); } });
    await pg.goto(url);
    try { await pg.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); }
    catch (e) { console.error('Scene never set window.__ready - check the console errors above (missing file, JS error, or PV.ready() not called).'); await b.close(); srv.close(); process.exit(1); }
    return pg;
  };
  // Writes out/<name>/score.wav from window.__soundtrack() if the page defines it; returns whether it did.
  const soundtrack = async pg => {
    if (!(await pg.evaluate(() => typeof window.__soundtrack === 'function'))) return false;
    const wav = Buffer.from(String((await pg.evaluate(() => window.__soundtrack())) || ''), 'base64');
    if (wav.length < 44 || wav.toString('latin1', 0, 4) !== 'RIFF' || wav.toString('latin1', 8, 12) !== 'WAVE') { console.error('window.__soundtrack() must return a base64-encoded WAV file.'); await b.close(); srv.close(); process.exit(1); }
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'score.wav'), wav); console.log(`score.wav written from the page (${(wav.length / 1048576).toFixed(1)} MB)`);
    return true;
  };
  const workers = Number(arg('workers')) || Math.max(2, Math.min(6, os.cpus().length - 2));
  if (MODE === 'stills') {
    fs.mkdirSync(OUT + '/stills', { recursive: true }); const pg = await open();
    for (const t of String(arg('stills')).split(',').map(Number)) { await pg.evaluate(t => window.seek(t), t); await pg.screenshot({ path: `${OUT}/stills/t${t.toFixed(2)}.png` }); console.log('still', t); }
  } else if (MODE === 'frames') {
    const N = Math.round(FPS * DUR), total = N * S;
    if (!arg('keep')) fs.rmSync(OUT + '/frames', { recursive: true, force: true }); fs.mkdirSync(OUT + '/frames', { recursive: true });
    const only = arg('only') ? String(arg('only')).split('-').map(Number) : null;
    const todo = []; for (let f = 0; f < N; f++) { if (only && (f < only[0] || f > only[1])) continue; for (let s = 0; s < S; s++) todo.push([f, s]); }
    const first = await open(); await soundtrack(first);
    let next = 0, done = 0; const t0 = Date.now();
    const run = async pg => {
      pg = pg || await open();
      for (;;) {
        const i = next++; if (i >= todo.length) break; const [f, s] = todo[i], t = timeOf(f, s);
        await pg.evaluate(t => window.seek(t), t);
        await pg.screenshot({ path: `${OUT}/frames/${String(f * S + s).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 95 });
        if (++done % 200 === 0) console.log(`${done}/${todo.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
      }
    };
    await Promise.all(Array.from({ length: workers }, (_, k) => run(k === 0 ? first : null))); console.log(`frames done: ${todo.length} in ${Math.round((Date.now() - t0) / 1000)}s -> ${path.relative(REPO, OUT)}/frames`);
  } else if (MODE === 'mp4') {
    // Workers screenshot sub-frames in parallel; the writer feeds them to ffmpeg strictly in order, holding at most a few per worker in memory.
    const total = Math.round(FPS * DUR) * S, out = arg('mp4') === true ? path.join(OUT, NAME + '.mp4') : path.resolve(String(arg('mp4'))), wav = path.join(OUT, 'score.wav');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const first = await open(); await soundtrack(first);
    const score = fs.existsSync(wav) ? wav : null;
    let L; try { L = loudness(ENC, score); } catch (e) { console.error(e.message); await b.close(); srv.close(); process.exit(1); }
    if (L) console.log(describe(ENC, L));
    const ff = spawn('ffmpeg', ffmpegArgs(ENC, { frames: '-', wav: score, out, af: L && L.filter }), { stdio: ['pipe', 'inherit', 'inherit'] });
    let ended = false; const ffDone = new Promise(res => ff.on('close', code => { ended = true; res(code); }));
    ff.stdin.on('error', () => {});  // a broken pipe means ffmpeg stopped; its exit code is reported below
    const shots = new Map(), wait = ms => new Promise(r => setTimeout(r, ms)); let next = 0, written = 0; const t0 = Date.now();
    const run = async pg => {
      pg = pg || await open();
      for (;;) {
        const i = next++; if (i >= total || ended) break;
        while (i - written >= workers * 4 && !ended) await wait(5);
        await pg.evaluate(t => window.seek(t), timeOf(Math.floor(i / S), i % S));
        shots.set(i, await pg.screenshot({ type: 'jpeg', quality: 95 }));
      }
    };
    const writer = (async () => {
      while (written < total && !ended) {
        if (!shots.has(written)) { await wait(2); continue; }
        const buf = shots.get(written); shots.delete(written); written++;
        if (!ff.stdin.write(buf)) await Promise.race([new Promise(r => ff.stdin.once('drain', r)), ffDone]);
        if (written % 200 === 0) console.log(`${written}/${total}  ${Math.round((Date.now() - t0) / 1000)}s`);
      }
      ff.stdin.end();
    })();
    await Promise.all([...Array.from({ length: workers }, (_, k) => run(k === 0 ? first : null)), writer]);
    const code = await ffDone;
    if (code !== 0 || written < total) { console.error(`ffmpeg stopped (exit ${code}) after ${written} of ${total} sub-frames.`); await b.close(); srv.close(); process.exit(1); }
    console.log(`mp4 done: ${total} sub-frames in ${Math.round((Date.now() - t0) / 1000)}s -> ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
  } else if (!(await soundtrack(await open()))) { console.error('This page has no window.__soundtrack(); use its sound.py instead.'); await b.close(); srv.close(); process.exit(1); }
  await b.close(); srv.close(); if (failed) { console.error('Finished with errors (see above).'); process.exit(1); }
})();
