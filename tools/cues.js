/* cues.js - reads a project's cues.json, applying a named variant from "render": { "variants": { ... } } when asked.
   A variant overrides any top-level key (e.g. width / height) and any render setting; null removes a render setting.
     "render": { "variants": { "vertical": { "width": 1080, "height": 1920, "render": { "page": "vertical.html", "outro": null } } } }
   Its output goes to out/<project>-<variant>/, so the variants of a project never overwrite each other. */
const fs = require('fs'), path = require('path');

// The cues for project (merged with the variant if one is named) and the output name; throws with a readable message.
const loadCues = (project, variant) => {
  const file = path.join(project, 'cues.json');
  if (!fs.existsSync(file)) throw new Error('No cues.json in ' + project);
  const cues = JSON.parse(fs.readFileSync(file, 'utf8')), { variants = {}, ...render } = cues.render || {};
  const name = path.basename(project), base = name;
  if (!variant) return { cues: { ...cues, render }, name, base };
  const v = variants[variant];
  if (!v || typeof v !== 'object') throw new Error(`No variant "${variant}" in cues.json (render.variants has: ${Object.keys(variants).join(', ') || 'none'})`);
  const merged = { ...render, ...(v.render || {}) };
  for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
  return { cues: { ...cues, ...v, render: merged }, name: `${name}-${variant}`, base };
};

// The score.wav a build uses: out/<name>/score.wav, or, for a variant with none of its own, the base cut's out/<project>/score.wav
// (cuts of one film normally share their soundtrack, and sound.py writes it for the base).  Returns { file, shared } or null.
const findScore = (outRoot, name, base) => {
  const own = path.join(outRoot, name, 'score.wav'), shared = path.join(outRoot, base, 'score.wav');
  if (fs.existsSync(own)) return { file: own, shared: false };
  return name !== base && fs.existsSync(shared) ? { file: shared, shared: true } : null;
};

module.exports = { loadCues, findScore };
