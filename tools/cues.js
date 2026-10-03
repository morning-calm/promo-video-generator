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
  const name = path.basename(project);
  if (!variant) return { cues: { ...cues, render }, name };
  const v = variants[variant];
  if (!v || typeof v !== 'object') throw new Error(`No variant "${variant}" in cues.json (render.variants has: ${Object.keys(variants).join(', ') || 'none'})`);
  const merged = { ...render, ...(v.render || {}) };
  for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
  return { cues: { ...cues, ...v, render: merged }, name: `${name}-${variant}` };
};

module.exports = { loadCues };
