/* encode.js - the ffmpeg command that turns sub-frames (+ score.wav) into the mp4.  Used by tools/build.js.
   Encoder settings: CRF / PRESET in the environment win over "render": { "crf", "preset" } in cues.json, which win over 18 / slow. */
const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];

// Everything an encode needs from cues.json; throws with a readable message on a bad crf or preset.
const settings = cues => {
  const R = cues.render || {};
  const s = { fps: cues.fps || 60, duration: cues.duration, S: cues.subframes || 4, crf: String(process.env.CRF || (R.crf ?? 18)), preset: process.env.PRESET || R.preset || 'slow' };
  if (!(s.crf !== '' && Number(s.crf) >= 0 && Number(s.crf) <= 51)) throw new Error(`crf must be a number from 0 to 51, not ${JSON.stringify(s.crf)}`);
  if (!PRESETS.includes(s.preset)) throw new Error(`preset must be one of ${PRESETS.join(' ')}, not ${JSON.stringify(s.preset)}`);
  return s;
};

// The S sub-frames of each frame are averaged with tmix (that average IS the motion blur).  tmix averages the TRAILING window, so the frame kept
// from each group is the last one: n%S == S-1.  JPEG frames are full range, so they are converted to TV range (yuv420p, bt709) - without this
// players show a yuvj420p file with washed-out or crushed colours.
const videoFilter = s => {
  const vf = 'scale=in_range=full:out_range=tv:flags=accurate_rnd+full_chroma_int:out_color_matrix=bt709,format=yuv420p';
  return s.S > 1 ? `tmix=frames=${s.S},select='eq(mod(n,${s.S}),${s.S - 1})',setpts=N/(${s.fps}*TB),${vf}` : vf;
};

// ffmpeg arguments: frames = a %06d.jpg pattern, or '-' for JPEGs piped on stdin in order; wav = score.wav or null; out = the mp4 path.
const ffmpegArgs = (s, { frames, wav, out }) => ['-y', '-loglevel', 'error', ...(frames === '-' ? ['-f', 'image2pipe', '-c:v', 'mjpeg'] : []), '-framerate', String(s.fps * s.S), '-i', frames,
  ...(wav ? ['-i', wav, '-c:a', 'aac', '-b:a', '256k'] : []),
  '-vf', videoFilter(s), '-r', String(s.fps), '-c:v', 'libx264', '-preset', s.preset, '-crf', s.crf, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-t', String(s.duration), '-movflags', '+faststart', out];

module.exports = { settings, ffmpegArgs };
