/* encode.js - the ffmpeg command that turns sub-frames (+ score.wav) into the mp4.  Used by tools/build.js and render.js --mp4.
   Encoder settings: CRF / PRESET in the environment win over "render": { "crf", "preset" } in cues.json, which win over 18 / slow.
   "render": { "loudness": -14, "peak": -2 } levels the score to that integrated loudness (LUFS) and holds sample peaks at "peak" dBFS.
   "render": { "intro": { "file", "until", "trim" }, "outro": { "file", "at", "trim" } } takes the picture before "until" / from "at" from a clip. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];

// render.intro / render.outro as { file (absolute path), trim, t } or null; t is "until" for the intro and "at" for the outro.
const clip = (R, key, project, duration) => {
  const c = R[key], t = key === 'intro' ? 'until' : 'at';
  if (c === undefined) return null;
  if (!c || typeof c !== 'object' || typeof c.file !== 'string' || typeof c[t] !== 'number') throw new Error(`render.${key} needs { "file": "clip.mp4", "${t}": seconds }`);
  if (!(c[t] > 0 && c[t] < duration)) throw new Error(`render.${key}.${t} must be inside the video (0 to ${duration} s), not ${c[t]}`);
  const trim = c.trim ?? 0;
  if (!(typeof trim === 'number' && trim >= 0)) throw new Error(`render.${key}.trim must be a number of seconds from 0, not ${JSON.stringify(c.trim)}`);
  const file = path.resolve(project, c.file);
  if (!fs.existsSync(file)) throw new Error(`render.${key}.file not found: ${file}`);
  return { file, trim, t: c[t] };
};

// Everything an encode needs from cues.json (project = the project folder, which clip paths are relative to); throws with a readable message
// on a bad setting.  The page renders frames first .. last-1; an intro fills the frames before first, an outro the frames from last.
const settings = (cues, project) => {
  const R = cues.render || {};
  const s = { fps: cues.fps || 60, duration: cues.duration, S: cues.subframes || 4, width: (cues.width || 1920) * (cues.dpr || 1), height: (cues.height || 1080) * (cues.dpr || 1),
    crf: String(process.env.CRF || (R.crf ?? 18)), preset: process.env.PRESET || R.preset || 'slow', loudness: R.loudness, peak: R.peak ?? -2 };
  if (!(s.duration > 0)) throw new Error('cues.json needs "duration" (seconds)');
  if (!(s.crf !== '' && Number(s.crf) >= 0 && Number(s.crf) <= 51)) throw new Error(`crf must be a number from 0 to 51, not ${JSON.stringify(s.crf)}`);
  if (!PRESETS.includes(s.preset)) throw new Error(`preset must be one of ${PRESETS.join(' ')}, not ${JSON.stringify(s.preset)}`);
  if (s.loudness !== undefined && !(typeof s.loudness === 'number' && s.loudness >= -70 && s.loudness <= 0)) throw new Error(`render.loudness must be a target in LUFS from -70 to 0, not ${JSON.stringify(s.loudness)}`);
  if (s.loudness !== undefined && !(typeof s.peak === 'number' && s.peak >= -24 && s.peak <= 0)) throw new Error(`render.peak must be a ceiling in dBFS from -24 to 0, not ${JSON.stringify(s.peak)}`);
  s.intro = clip(R, 'intro', project, s.duration); s.outro = clip(R, 'outro', project, s.duration);
  if (s.intro && s.outro && !(s.intro.t < s.outro.t)) throw new Error('render.intro.until must come before render.outro.at');
  s.frames = Math.round(s.fps * s.duration); s.first = s.intro ? Math.round(s.fps * s.intro.t) : 0; s.last = s.outro ? Math.round(s.fps * s.outro.t) : s.frames;
  if (!(s.first < s.last)) throw new Error('render.intro and render.outro leave no frames for the page');
  return s;
};

// The S sub-frames of each frame are averaged with tmix (that average IS the motion blur).  tmix averages the TRAILING window, so the frame kept
// from each group is the last one: n%S == S-1.  JPEG frames are full range, so they are converted to TV range (yuv420p, bt709) - without this
// players show a yuvj420p file with washed-out or crushed colours.
const videoFilter = s => {
  const vf = 'scale=in_range=full:out_range=tv:flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709,format=yuv420p';
  return s.S > 1 ? `tmix=frames=${s.S},select='eq(mod(n,${s.S}),${s.S - 1})',setpts=N/(${s.fps}*TB),${vf}` : vf;
};

// With render.loudness set: returns { measured, gain, reached, filter }, the filter applying one gain and a limiter that holds sample peaks at
// render.peak.  Limiting a loud peak also lowers the loudness around it, so the gain is corrected against the limited result (up to 4 times,
// until within 0.1 LU); "reached" is the integrated loudness of the filtered score over the video's duration.  alimiter delays its output by
// floor(rate * attack) - 1 samples (measured at 44.1 and 48 kHz, 2 and 5 ms), so that many are trimmed back off the front.
// Loudness is measured with ffmpeg's ebur128 filter, the meter tools/loudness.js reports with: loudnorm's own figure can be 0.5 LU
// away from it on a short score with quiet passages.  Returns null without render.loudness or a score.
const ATTACK_MS = 2;
const loudness = (s, wav) => {
  if (s.loudness === undefined || !wav) return null;
  const rate = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).stdout.trim());
  if (!(rate > 0)) throw new Error(`could not read the sample rate of ${wav}`);
  const delay = Math.floor(rate * ATTACK_MS / 1000) - 1;
  const measure = af => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', `${af ? af + ',' : ''}atrim=end=${s.duration},ebur128=framelog=quiet`, '-f', 'null', '-'], { encoding: 'utf8' });
    const sum = (r.stderr || '').slice((r.stderr || '').lastIndexOf('Summary:')), m = sum.match(/I:\s+(-?[\d.]+) LUFS/), i = m ? parseFloat(m[1]) : NaN;
    return i > -70 ? i : NaN;   // ebur128 reports -70.0 for silence
  };
  const chain = g => `volume=${g.toFixed(2)}dB,alimiter=limit=${Math.pow(10, s.peak / 20).toFixed(5)}:attack=${ATTACK_MS}:release=80:level=false,atrim=start_sample=${delay},asetpts=PTS-STARTPTS`;
  const measured = measure(null);
  if (!Number.isFinite(measured)) throw new Error(`could not measure the loudness of ${wav} (is it silent?)`);
  let gain = s.loudness - measured, reached = measure(chain(gain));
  for (let k = 0; k < 4 && Math.abs(s.loudness - reached) > 0.1; k++) { gain += s.loudness - reached; reached = measure(chain(gain)); }
  return { measured, gain, reached, filter: chain(gain) };
};

// ffmpeg arguments: frames = a %06d.jpg pattern, or '-' for JPEGs piped on stdin in order; wav = score.wav or null; af = an audio filter or null.
const ffmpegArgs = (s, { frames, wav, out, af }) => {
  const input = [...(frames === '-' ? ['-f', 'image2pipe', '-c:v', 'mjpeg'] : s.first ? ['-start_number', String(s.first * s.S)] : []), '-framerate', String(s.fps * s.S), '-i', frames];
  const audio = wav ? ['-c:a', 'aac', '-b:a', '256k', ...(af ? ['-af', af] : [])] : [];
  const tail = ['-r', String(s.fps), '-c:v', 'libx264', '-preset', s.preset, '-crf', s.crf, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-t', String(s.duration), '-movflags', '+faststart', out];
  if (!s.intro && !s.outro) return ['-y', '-loglevel', 'error', ...input, ...(wav ? ['-i', wav, ...audio] : []), '-vf', videoFilter(s), ...tail];
  // Each clip is cut from its trim point, scaled to the video's size, converted to its frame rate, held on its last frame if it runs short and
  // cut to exactly the frames it covers; then intro, page and outro are joined.  The clips' own audio is not used.
  let nextInput = wav ? 2 : 1;
  const clipChain = (c, count) => `[${nextInput++}:v]trim=start=${c.trim},setpts=PTS-STARTPTS,scale=${s.width}:${s.height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,`
    + `fps=${s.fps},format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=${(count / s.fps + 1).toFixed(3)},trim=end_frame=${count}`;
  const graph = [], seg = [];
  if (s.intro) { graph.push(`${clipChain(s.intro, s.first)}[intro]`); seg.push('[intro]'); }
  graph.push(`[0:v]${videoFilter(s)},setsar=1[page]`); seg.push('[page]');
  if (s.outro) { graph.push(`${clipChain(s.outro, s.frames - s.last)}[outro]`); seg.push('[outro]'); }
  graph.push(`${seg.join('')}concat=n=${seg.length}:v=1:a=0[v]`);
  return ['-y', '-loglevel', 'error', ...input, ...(wav ? ['-i', wav] : []), ...[s.intro, s.outro].filter(Boolean).flatMap(c => ['-i', c.file]),
    '-filter_complex', graph.join(';'), '-map', '[v]', ...(wav ? ['-map', '1:a', ...audio] : []), ...tail];
};

// One line for the console after loudness() has run.
const describe = (s, L) => `loudness: score ${L.measured.toFixed(1)} LUFS, gain ${L.gain >= 0 ? '+' : ''}${L.gain.toFixed(1)} dB, peaks held at ${s.peak} dBFS -> ${L.reached.toFixed(1)} LUFS (target ${s.loudness})`;

module.exports = { settings, ffmpegArgs, loudness, describe };
