/* motion.js - the small toolkit every scene is built from.  Classic script, defines window.PV.  No dependencies.

   The one rule of this repo: a scene is a PURE FUNCTION OF TIME.  window.seek(t) must put every element exactly where it belongs at second t
   (no setTimeout, no requestAnimationFrame, no CSS animation or transition).  tools/render.js then calls seek() for any t it likes, which is what
   makes frames reproducible and lets sub-frames be averaged into real motion blur.

   Contents
     maths     clamp P lerp  easings (eo3 eo4 eoE ei3 eio3 eio4 eoB)  spring  rng  hex mixc
     dom       world mk put img svg helpers
     type      kinetic kUpdate      (per-letter text that rises out of a clipped line)
     fx        shake                (decaying camera shake offsets)
     boot      loaded ready         (wait for fonts + images, then flag window.__ready) */
(function () {
  'use strict';
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  /* P(t, a, b): progress of t through the window [a, b], clamped to 0..1.  The workhorse: every animation is easing(P(t, start, end)). */
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;

  /* easings take 0..1 and return 0..1 (eoB and spring overshoot).  eo = ease out (arrive softly), ei = ease in (leave), eio = both. */
  const eo3 = x => 1 - Math.pow(1 - x, 3), eo4 = x => 1 - Math.pow(1 - x, 4), eoE = x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x), ei3 = x => x * x * x;
  const eio3 = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, eio4 = x => x < .5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
  const eoB = (x, s = 1.9) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);   // ease out with back-overshoot
  /* spring(t, start, freq, damping): 0 before start, then a damped oscillation settling on 1.  freq ~ 2 bouncy, damping ~ 6 settles in ~0.6 s. */
  const spring = (t, a, f = 2.2, z = 6.5) => { const d = t - a; return d <= 0 ? 0 : 1 - Math.exp(-z * d) * Math.cos(2 * Math.PI * f * d); };

  /* seeded random (mulberry32): always create it once at the top, never call Math.random() - frames must be identical on every render */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, k) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(lerp(x[0], y[0], k))},${Math.round(lerp(x[1], y[1], k))},${Math.round(lerp(x[2], y[2], k))})`; };

  /* ── dom ── */
  const PV = { world: null };

  /* PV.createWorld(stageEl, canvasEl?): one absolutely positioned layer that holds the whole picture (so the camera / shake can move it as one).
     Elements made with PV.mk() are added to it by default. */
  function createWorld(stage, canvas, w = 1920, h = 1080) {
    const world = document.createElement('div'); world.className = 'abs'; world.style.cssText = `left:0;top:0;width:${w}px;height:${h}px;`;
    stage.appendChild(world); if (canvas) world.appendChild(canvas); PV.world = world; return world;
  }
  /* mk(html, css, parent?, className?): make an absolutely positioned div.  Position things at left/top once, then animate with put(). */
  const mk = (html, css, parent, cls = 'abs') => { const e = document.createElement('div'); e.className = cls; if (css) e.style.cssText = css; if (html) e.innerHTML = html; (parent || PV.world).appendChild(e); return e; };
  /* put(el, {x,y,z, rx,ry,r, s|sx,sy, o}): the ONLY way elements should be moved.  Sets transform + opacity; hides at o~0 so nothing leaks.
     Gotcha: if a parent is hidden with visibility:hidden, a child with visibility:visible shows through - hide whole scenes with display:none. */
  const put = (e, o) => {
    o = o || {}; const op = o.o === undefined ? 1 : o.o;
    if (op <= 0.002) { e.style.visibility = 'hidden'; return; } e.style.visibility = 'visible'; e.style.opacity = op;
    const s = o.s === undefined ? 1 : o.s;
    e.style.transform = `translate3d(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px,${(o.z || 0).toFixed(2)}px) rotateX(${o.rx || 0}deg) rotateY(${o.ry || 0}deg) rotate(${o.r || 0}deg) scale(${(o.sx === undefined ? s : o.sx).toFixed(4)},${(o.sy === undefined ? s : o.sy).toFixed(4)})`;
  };
  /* show(el, bool): toggle a whole scene container (display:none, which really removes it) */
  const show = (e, on) => { e.style.display = on ? '' : 'none'; return on; };
  const img = (src, css) => `<img src="${src}" style="display:block;${css || ''}" draggable="false">`;

  /* ── kinetic type ──
     kinetic('Describe', 'left:100px;top:40px;font-size:170px;', gradientCssOrNull, parentOrNull) builds a clipped line with one span per letter.
     kUpdate(k, t, tin, tout, gap): letters rise and un-rotate one after another from tin (gap seconds apart); if tout is truthy they drop out from tout.
     The line needs class "line" (overflow:hidden; white-space:nowrap; line-height ~1) in the project's CSS: lib/motion.css has one. */
  function kinetic(text, css, grad, parent) {
    const line = mk('', css, parent, 'line'), ch = [];
    Array.from(text).forEach(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c === ' ' ? '\u00a0' : c; if (grad) { s.style.background = grad; s.style.webkitBackgroundClip = 'text'; s.style.backgroundClip = 'text'; s.style.color = 'transparent'; } line.appendChild(s); ch.push(s); });
    return { line, ch };
  }
  function kUpdate(k, t, tin, tout, gap = 0.035) {
    let any = false;
    k.ch.forEach((s, i) => {
      const a = eo4(P(t, tin + i * gap, tin + i * gap + 0.55)), b = tout ? ei3(P(t, tout + i * 0.02, tout + i * 0.02 + 0.32)) : 0;
      const y = (1 - a) * 118 - b * 118, o = a > 0 && b < 1 ? 1 : 0; if (o) any = true;
      s.style.transform = `translate3d(0,${y.toFixed(2)}%,0) rotate(${((1 - a) * 9).toFixed(2)}deg)`; s.style.opacity = o;
    });
    k.line.style.visibility = any ? 'visible' : 'hidden';
  }

  /* shake(t, [[time, amplitudePx], ...]) -> {x, y}: damped camera shake after each impact.  Apply with world.style.transform = translate3d(x,y,0). */
  function shake(t, hits) {
    let x = 0, y = 0;
    hits.forEach(([t0, amp]) => { const d = t - t0; if (d > 0 && d < 0.6) { const e = Math.exp(-d * 9); x += Math.sin(d * 70) * amp * e; y += Math.cos(d * 58) * amp * e * 0.8; } });
    return { x, y };
  }

  /* loaded(fontSpecs?): await fonts + images (call before measuring text or taking the first frame).
     ready(): flag the page for the renderer.  End every scene file with:
         await PV.loaded(['800 100px "My Font"']); window.seek(0); PV.ready(); */
  async function loaded(fontSpecs) {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(i => i.decode ? i.decode().catch(() => 0) : 0));
    if (fontSpecs) await Promise.all(fontSpecs.map(f => document.fonts.load(f, 'Aa')));   // force-load faces that are not on screen at t=0
  }
  const ready = () => { window.__ready = true; };

  Object.assign(PV, { clamp, P, lerp, eo3, eo4, eoE, ei3, eio3, eio4, eoB, spring, rng, hex, mixc, createWorld, mk, put, show, img, kinetic, kUpdate, shake, loaded, ready });
  window.PV = PV;
})();
