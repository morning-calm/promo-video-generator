#!/usr/bin/env node
/* doctor.js - check that everything the pipeline needs is installed.   node tools/doctor.js   (exit code 1 if something is missing)
   PV_PYTHON names the Python to check (default python3, or python on Windows).  PV_CHANNEL as in render.js. */
const { execSync, execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const WIN = process.platform === 'win32', PY = process.env.PV_PYTHON || (WIN ? 'python' : 'python3');
const run = c => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return null; } };
const runPy = code => { try { return execFileSync(PY, ['-c', code], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return null; } };
let bad = 0;
const row = (ok, what, detail, fix) => { console.log(`${ok ? 'ok  ' : 'MISSING'}  ${what}${detail ? '  ' + detail : ''}`); if (!ok) { bad++; if (fix) console.log('        fix: ' + fix); } };

(async () => {
  const node = process.versions.node; row(parseInt(node) >= 18, 'node >= 18', node, 'install Node 18+ (https://nodejs.org)');
  const pw = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'playwright-core')); row(pw, 'playwright-core', '', 'npm install');
  const ff = run('ffmpeg -version'); row(!!ff, 'ffmpeg', ff && ff.split('\n')[0], WIN ? 'winget install Gyan.FFmpeg' : 'brew install ffmpeg   (or apt install ffmpeg)');
  if (ff) { const enc = run('ffmpeg -hide_banner -encoders') || ''; row(/libx264/.test(enc), 'ffmpeg libx264 encoder', '', 'install an ffmpeg build with libx264'); row(/\baac\b/.test(enc), 'ffmpeg aac encoder'); row(!!run('ffprobe -version'), 'ffprobe'); }
  const py = runPy('import numpy, scipy; print(numpy.__version__, scipy.__version__)'); row(!!py, `${PY} + numpy + scipy`, py && ('numpy/scipy ' + py), `${PY} -m pip install numpy scipy   (or set PV_PYTHON to a Python that has them)`);
  const pil = !!runPy('import PIL; print(1)'); console.log(`${pil ? 'ok  ' : 'note'}  Pillow ${pil ? '' : `(optional, for tools/sheet.py contact sheets)  fix: ${PY} -m pip install pillow`}`);
  // Launch the browser exactly as render.js does: the only check that holds on every OS and install location.
  const channel = process.env.PV_CHANNEL === undefined ? 'chrome' : process.env.PV_CHANNEL;
  let browser = false; if (pw) { try { const b = await require('playwright-core').chromium.launch({ channel: channel || undefined }); await b.close(); browser = true; } catch (e) {} }
  if (channel) row(browser, 'Google Chrome (or set PV_CHANNEL="" and run: npx playwright-core install chromium)', '', 'install Chrome from https://google.com/chrome');
  else row(browser, "Playwright's bundled Chromium (PV_CHANNEL=\"\")", '', 'npx playwright-core install chromium');
  console.log(bad ? `\n${bad} problem(s) above.` : '\nAll good. Next: node tools/new-project.js my-video');
  process.exit(bad ? 1 : 0);
})();
