#!/usr/bin/env node
/* doctor.js - check that everything the pipeline needs is installed.   node tools/doctor.js   (exit code 1 if something is missing) */
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const run = c => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return null; } };
let bad = 0;
const row = (ok, what, detail, fix) => { console.log(`${ok ? 'ok  ' : 'MISSING'}  ${what}${detail ? '  ' + detail : ''}`); if (!ok) { bad++; if (fix) console.log('        fix: ' + fix); } };

const node = process.versions.node; row(parseInt(node) >= 18, 'node >= 18', node, 'install Node 18+ (https://nodejs.org)');
row(fs.existsSync(path.join(__dirname, '..', 'node_modules', 'playwright-core')), 'playwright-core', '', 'npm install');
const ff = run('ffmpeg -version'); row(!!ff, 'ffmpeg', ff && ff.split('\n')[0], 'brew install ffmpeg   (or apt install ffmpeg)');
if (ff) { const enc = run('ffmpeg -hide_banner -encoders') || ''; row(/libx264/.test(enc), 'ffmpeg libx264 encoder', '', 'install an ffmpeg build with libx264'); row(/\baac\b/.test(enc), 'ffmpeg aac encoder'); row(!!run('ffprobe -version'), 'ffprobe'); }
const py = run('python3 -c "import numpy, scipy; print(numpy.__version__, scipy.__version__)"'); row(!!py, 'python3 + numpy + scipy', py && ('numpy/scipy ' + py), 'pip3 install numpy scipy');
const pil = !!run('python3 -c "import PIL; print(1)"'); console.log(`${pil ? 'ok  ' : 'note'}  Pillow ${pil ? '' : '(optional, for tools/sheet.py contact sheets)  fix: pip3 install pillow'}`);
const macChrome = fs.existsSync('/Applications/Google Chrome.app'), linChrome = !!run('which google-chrome || which chromium || which chromium-browser');
row(macChrome || linChrome || process.env.PV_CHANNEL === '', 'Google Chrome (or set PV_CHANNEL="" and run: npx playwright-core install chromium)', '', 'install Chrome from https://google.com/chrome');
console.log(bad ? `\n${bad} problem(s) above.` : '\nAll good. Next: bash tools/new-project.sh my-video');
process.exit(bad ? 1 : 0);
