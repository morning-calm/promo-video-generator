/* Capture the real Pitchcraft pictures the promo video uses: six slides (as the app renders them) and the editor in each theme.
   This is an EXAMPLE of the "photograph the real product" step: any project can do the same with its own app.
   Run:  PITCHCRAFT_DIR=/path/to/pitchcraft node examples/pitchcraft/capture-assets.js     (default: ../../../pitchcraft next to this repo)
   Needs Chrome (as render.js does).  Output: assets/*.png and editor.json (element rectangles in 1920x1080 CSS px).
   The captured assets are committed, so you only re-run this if the app's look changes. */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.env.PITCHCRAFT_DIR || path.join(__dirname, '..', '..', '..', 'pitchcraft')), OUT = path.join(__dirname, 'assets'), PORT = 4994;
if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.error(`No Pitchcraft checkout at ${ROOT}. Set PITCHCRAFT_DIR=/path/to/pitchcraft (the app: https://visser23.github.io/pitchcraft/).`); process.exit(2); }
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const SLIDES = [   // [file, template, slide index, theme]
  ['a', 'launch', 0, 'aurora'], ['b', 'launch', 2, 'studio'], ['c', 'launch', 3, 'editorial'], ['d', 'launch', 5, 'contrast'], ['e', 'pitch', 3, 'brutal'], ['f', 'launch', 6, 'aurora']];
const THEMES = ['studio', 'editorial', 'contrast', 'brutal', 'aurora'];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((q, r) => { let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader('content-type', MIME[path.extname(p)] || 'application/octet-stream'); r.end(d); } }); }).listen(PORT);
  const b = await chromium.launch({ channel: 'chrome' });
  const open = async (dpr, tpl, theme) => {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr }), pg = await ctx.newPage();
    await pg.addInitScript(() => localStorage.setItem('pitchcraft.consent', JSON.stringify({ v: 1, analytics: false, at: '2026-01-01' })));
    await pg.goto(`http://localhost:${PORT}/?reset=1&template=${tpl}`); await pg.waitForFunction(() => document.documentElement.dataset.ready === '1' && document.documentElement.dataset.fonts === 'ready');
    await pg.evaluate(t => window.Pitchcraft.setTheme(t), theme); await pg.waitForTimeout(500); return { ctx, pg };
  };
  for (const [name, tpl, idx, theme] of SLIDES) {
    const { ctx, pg } = await open(2, tpl, theme);
    await pg.evaluate(i => window.Pitchcraft.goTo(i), idx); await pg.waitForTimeout(400);
    await pg.locator(`#canvas-inner .frame[data-i="${idx}"] .stage`).first().screenshot({ path: path.join(OUT, `slide-${name}.png`) });
    await ctx.close(); console.log('slide', name);
  }
  let rects = {};
  for (const theme of THEMES) {
    const { ctx, pg } = await open(1.5, 'launch', theme);
    await pg.evaluate(() => { window.Pitchcraft.goTo(0); const t = document.querySelector('#toasts'); if (t) t.innerHTML = ''; }); await pg.waitForTimeout(500);
    await pg.screenshot({ path: path.join(OUT, `editor-${theme}.png`) });
    if (!rects.stage) rects = await pg.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      return { stage: r('#canvas-inner .frame[data-i="0"] .stage'), headline: r('#canvas-inner .frame[data-i="0"] [data-path="headline"]'), kicker: r('#canvas-inner .frame[data-i="0"] [data-path="kicker"]'), body: r('#canvas-inner .frame[data-i="0"] [data-path="body"]'), ribbon: r('#ribbon'), theme: r('#rb-theme'), inspector: r('#inspector') || r('.inspector'), thumbs: r('#thumbs'), topbar: r('.topbar'), save: r('.rb[data-act="export"]'), share: r('.rb[data-act="share"]') }; });
    await ctx.close(); console.log('editor', theme);
  }
  fs.writeFileSync(path.join(OUT, 'editor.json'), JSON.stringify(rects, null, 1));
  await b.close(); srv.close(); console.log(JSON.stringify(rects));
})();
