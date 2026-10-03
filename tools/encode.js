/* encode.js - the ffmpeg command that turns sub-frames (+ score.wav) into the mp4.  Used by tools/build.js and render.js --mp4.
   Encoder settings: CRF / PRESET in the environment win over "render": { "crf", "preset" } in cues.json, which win over 18 / slow.
   "render": { "loudness": -14, "peak": -2 } levels the score to that integrated loudness (LUFS) and holds sample peaks at "peak" dBFS. */
const { spawnSync } = require('child_process');
const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];

// Everything an encode needs from cues.json; throws with a readable message on a bad setting.
const settings = cues => {
  const R = cues.render || {};
  const s = { fps: cues.fps || 60, duration: cues.duration, S: cues.subframes || 4, crf: String(process.env.CRF || (R.crf ?? 18)), preset: process.env.PRESET || R.preset || 'slow', loudness: R.loudness, peak: R.peak ?? -2 };
  if (!(s.crf !== '' && Number(s.crf) >= 0 && Number(s.crf) <= 51)) throw new Error(`crf must be a number from 0 to 51, not ${JSON.stringify(s.crf)}`);
  if (!PRESETS.includes(s.preset)) throw new Error(`preset must be one of ${PRESETS.join(' ')}, not ${JSON.stringify(s.preset)}`);
  if (s.loudness !== undefined && !(typeof s.loudness === 'number' && s.loudness >= -70 && s.loudness <= 0)) throw new Error(`render.loudness must be a target in LUFS from -70 to 0, not ${JSON.stringify(s.loudness)}`);
  if (s.loudness !== undefined && !(typeof s.peak === 'number' && s.peak >= -24 && s.peak <= 0)) throw new Error(`render.peak must be a ceiling in dBFS from -24 to 0, not ${JSON.stringify(s.peak)}`);
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
// Returns null without render.loudness or a score.
const ATTACK_MS = 2;
const loudness = (s, wav) => {
  if (s.loudness === undefined || !wav) return null;
  const rate = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).stdout.trim());
  if (!(rate > 0)) throw new Error(`could not read the sample rate of ${wav}`);
  const delay = Math.floor(rate * ATTACK_MS / 1000) - 1;
  const measure = af => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', `${af ? af + ',' : ''}atrim=end=${s.duration},loudnorm=I=-24:TP=-2:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
    const m = (r.stderr || '').match(/\{[^{}]*"input_i"[^{}]*\}/); return m ? parseFloat(JSON.parse(m[0]).input_i) : NaN;
  };
  const chain = g => `volume=${g.toFixed(2)}dB,alimiter=limit=${Math.pow(10, s.peak / 20).toFixed(5)}:attack=${ATTACK_MS}:release=80:level=false,atrim=start_sample=${delay},asetpts=PTS-STARTPTS`;
  const measured = measure(null);
  if (!Number.isFinite(measured)) throw new Error(`could not measure the loudness of ${wav} (is it silent?)`);
  let gain = s.loudness - measured, reached = measure(chain(gain));
  for (let k = 0; k < 4 && Math.abs(s.loudness - reached) > 0.1; k++) { gain += s.loudness - reached; reached = measure(chain(gain)); }
  return { measured, gain, reached, filter: chain(gain) };
};

// ffmpeg arguments: frames = a %06d.jpg pattern, or '-' for JPEGs piped on stdin in order; wav = score.wav or null; af = an audio filter or null.
const ffmpegArgs = (s, { frames, wav, out, af }) => ['-y', '-loglevel', 'error', ...(frames === '-' ? ['-f', 'image2pipe', '-c:v', 'mjpeg'] : []), '-framerate', String(s.fps * s.S), '-i', frames,
  ...(wav ? ['-i', wav, '-c:a', 'aac', '-b:a', '256k', ...(af ? ['-af', af] : [])] : []),
  '-vf', videoFilter(s), '-r', String(s.fps), '-c:v', 'libx264', '-preset', s.preset, '-crf', s.crf, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-t', String(s.duration), '-movflags', '+faststart', out];

// One line for the console after loudness() has run.
const describe = (s, L) => `loudness: score ${L.measured.toFixed(1)} LUFS, gain ${L.gain >= 0 ? '+' : ''}${L.gain.toFixed(1)} dB, peaks held at ${s.peak} dBFS -> ${L.reached.toFixed(1)} LUFS (target ${s.loudness})`;

module.exports = { settings, ffmpegArgs, loudness, describe };
