/* Starter scene.  Read it top to bottom - it uses every pattern you need:
     1. a background painted on a canvas as a function of t
     2. kinetic type (letters rise one by one)
     3. a glass card that springs in, then reacts to an impact ("hit")
     4. a particle burst + camera shake on the hit
     5. a call-to-action pill, then everything leaves
   RULES: never use timers, rAF, CSS animation or Math.random.  Everything is a function of t.  Times come from cues.json (shared with sound.py). */
(async function () {
  'use strict';
  const C = await (await fetch('cues.json')).json();
  const { P, lerp, eo3, eo4, eoB, ei3, eio3, spring, mk, put, kinetic, kUpdate } = PV;
  const V = document.getElementById('v'), bg = document.getElementById('bg'), g = bg.getContext('2d'), W = 1920, H = 1080;
  const world = PV.createWorld(V, bg), rnd = PV.rng(42);

  /* 1 ── background: dark base + three drifting colour blobs that brighten at the hit */
  const BLOBS = [['#5b4bff', 0.0, 0.31], ['#ff6b57', 2.1, 0.23], ['#1b9bd6', 4.2, 0.37]];
  function drawBg(t) {
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#090616'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const boost = 1 + 1.2 * Math.exp(-Math.max(0, t - C.hit) * 3) * (t >= C.hit ? 1 : 0);
    BLOBS.forEach(([col, ph, sp], i) => {
      const x = W / 2 + Math.sin((t + ph) * sp * 6) * 520, y = H / 2 + Math.cos((t + ph) * sp * 5) * 260, r = 620;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.34 * boost * lerp(0.2, 1, eo3(P(t, 0, 1))); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /* 2 ── headline: two kinetic lines (the second with a gradient) */
  const k1 = kinetic('Make something', 'left:150px;top:150px;font-size:150px;padding:.07em .02em;');
  const k2 = kinetic('move.', 'left:150px;top:310px;font-size:150px;padding:.07em .02em;', 'linear-gradient(135deg,#ff8f7d,#ffd36e)');

  /* 3 ── glass card */
  const card = mk('<h3>Everything is a function of time</h3><p>Seek to any second, get the exact same frame.</p>', 'left:150px;top:560px;', world, 'abs glass card');

  /* 4 ── particles: positions are computed from t, never stepped */
  const parts = Array.from({ length: 46 }, () => { const a = rnd() * Math.PI * 2, v = 300 + rnd() * 900; return { e: mk('', `left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:${['#ffd36e', '#ff8f7d', '#9d8cff'][Math.floor(rnd() * 3)]};`), vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 0.5 + rnd() }; });
  const ox = 1260, oy = 700;

  /* 5 ── CTA */
  const cta = mk('Build yours <span style="margin-left:14px">→</span>', `left:${W - 150 - 420}px;top:760px;width:420px;justify-content:center;`, world, 'abs pill');

  window.seek = function (t) {
    drawBg(t);
    const sh = PV.shake(t, [[C.hit, 18]]);                                    // camera shake after the hit
    world.style.transform = `translate3d(${sh.x.toFixed(2)}px,${sh.y.toFixed(2)}px,0)`;
    const out = P(t, C.out, C.out + 0.5);                                      // global exit
    kUpdate(k1, t, C.titleIn, C.out, 0.03); kUpdate(k2, t, C.titleIn + 0.3, C.out + 0.1, 0.05);
    const a = spring(t, C.cardIn, 2.0, 6.5), hit = t > C.hit ? Math.exp(-(t - C.hit) * 7) * Math.sin((t - C.hit) * 40) : 0;
    put(card, { x: (1 - Math.min(a, 1.1)) * -300 + out * -400, y: hit * -16, s: lerp(0.9, 1, Math.min(a, 1.05)) * (1 + hit * 0.03), r: (1 - a) * -4, o: (t < C.cardIn ? 0 : 1) * (1 - out) });
    parts.forEach(p => {
      const d = t - C.hit, life = P(d, 0, 1.4); if (d < 0 || life >= 1) { put(p.e, { o: 0 }); return; }
      const drag = 1 - Math.exp(-d * 2.4);
      put(p.e, { x: ox + p.vx * drag / 2.4, y: oy + p.vy * drag / 2.4 + 120 * d * d, s: p.s * (1 - life), o: 1 - ei3(life) });
    });
    const c = spring(t, C.ctaIn, 2.2, 7);
    put(cta, { y: (1 - c) * 120 + out * 80, s: lerp(0.8, 1, Math.min(c, 1.08)), o: (t < C.ctaIn ? 0 : 1) * (1 - out) });
  };
  await PV.loaded(['800 100px "Bricolage Grotesque"', '500 40px "Inter"', '700 40px "Inter"']);
  window.seek(0); PV.ready();
})();
