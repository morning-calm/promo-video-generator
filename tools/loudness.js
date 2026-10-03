#!/usr/bin/env node
/* loudness.js - a loudness report for a wav or a video's soundtrack, so a score can be checked without listening.
     node tools/loudness.js <file> [--every 0.5]
   Prints the short-term loudness every N seconds (default 1), then integrated loudness, loudness range and true peak (EBU R128)
   and the sample peak.  Short-term loudness is measured over the 3 s up to each time. */
const { spawnSync } = require('child_process');
if (process.argv.length < 3 || process.argv[2].startsWith('--')) { console.log('usage: node tools/loudness.js <file> [--every seconds]'); process.exit(2); }
const file = process.argv[2], i = process.argv.indexOf('--every'), every = i > 0 ? Number(process.argv[i + 1]) : 1;
if (!(every > 0)) { console.log('--every needs a number of seconds above 0'); process.exit(2); }
const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true+sample:metadata=1,ametadata=print:key=lavfi.r128.S', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.error || r.status !== 0) { console.log(r.error ? r.error.message : (r.stderr || '').trim().split('\n').pop()); process.exit(1); }
let t = null, next = every;
for (const line of r.stderr.split('\n')) {
  const mt = line.match(/pts_time:([\d.]+)/); if (mt) t = Number(mt[1]);
  const ms = line.match(/lavfi\.r128\.S=(-?[\d.]+|-inf)/);
  // ffmpeg reports a -120.7 floor until the 3 s window has filled; that is not a measurement, so it is not printed as one.
  if (ms && t !== null && t + 1e-6 >= next) { console.log(`${next.toFixed(1).padStart(6)} s  short-term ${next < 3 ? 'n/a (needs 3 s of audio)' : ms[1] + ' LUFS'}`); next += every; }
}
const sum = r.stderr.slice(r.stderr.lastIndexOf('Summary:')), v = re => (sum.match(re) || [, '?'])[1];
console.log(`integrated ${v(/I:\s+(-?[\d.]+|-inf) LUFS/)} LUFS   range ${v(/LRA:\s+([\d.]+) LU/)} LU   true peak ${v(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/)} dBFS   sample peak ${v(/Sample peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/)} dBFS`);
