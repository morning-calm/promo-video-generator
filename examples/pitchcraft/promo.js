/* Pitchcraft promo: a 15 second motion piece, built as a pure function of time.
   seek(t) puts every element where it should be at second t (no timers, no CSS animation), so the renderer (tools/render.js) can step through
   time at any frame rate and blend sub-frames for true motion blur. The pictures are the real app: slides rendered by Pitchcraft and the real editor
   (capture-assets.js). Timings live in cues.json, which sound.py reads too, so picture and sound stay locked together. */
(async function () {
  'use strict';
  const C = await (await fetch('cues.json')).json(), RC = await (await fetch('assets/editor.json')).json();
  const V = document.getElementById('v'), bg = document.getElementById('bg'), g = bg.getContext('2d'), W = 1920, H = 1080;

  /* ── toolkit: maths, dom helpers and kinetic type come from ../../lib/motion.js ── */
  const { clamp, P, lerp, eo3, eo4, eoE, ei3, eio3, eio4, eoB, spring, hex, mixc, mk, put, kinetic, kUpdate } = PV;
  const rnd = PV.rng(20261002);
  const world = PV.createWorld(V, bg);

  /* ── project-specific pieces ── */
  const img = (src, css) => `<img src="assets/${src}" style="display:block;${css || ''}" draggable="false">`;
  const STAR = 'M0 -1 C0.1 -0.3 0.3 -0.1 1 0 C0.3 0.1 0.1 0.3 0 1 C-0.1 0.3 -0.3 0.1 -1 0 C-0.3 -0.1 -0.1 -0.3 0 -1Z';
  const starSvg = (sz, id) => `<svg width="${sz}" height="${sz}" viewBox="-1 -1 2 2"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c9"/><stop offset=".5" stop-color="#ffd36e"/><stop offset="1" stop-color="#ff9a5c"/></linearGradient></defs><path d="${STAR}" fill="url(#${id})"/></svg>`;
  const LOGO = `<svg width="100%" height="100%" viewBox="0 0 32 32"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b3bff"/><stop offset=".55" stop-color="#8a4dff"/><stop offset="1" stop-color="#ff6b57"/></linearGradient></defs><rect x="1.5" y="1.5" width="29" height="29" rx="9.5" fill="url(#lg)"/><rect x="14.5" y="8" width="11.5" height="9" rx="2.4" fill="#fff" opacity=".28" transform="rotate(9 20 12.5)"/><path d="M10 25.5V8.2c0-.7.6-1.3 1.3-1.3h6.9a5.5 5.5 0 0 1 0 11H13" fill="none" stroke="#fff" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.6 9.7l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#ffd36e"/></svg>`;
  const GRAD_CORAL = 'linear-gradient(135deg,#ff8f7d,#ffd36e)', GRAD_VIOLET = 'linear-gradient(135deg,#9d8cff,#ff8f7d)';

  /* ── background: drifting colour, a dot grid that ripples, vignette and grain ── */
  const PAL = [[0, ['#4b3bff', '#8a4dff', '#241a7a']], [1.0, ['#5b4bff', '#ff6b57', '#3a1d8a']], [5.0, ['#3f4fff', '#8a4dff', '#1b64d6']], [9.0, ['#8a4dff', '#ff6b57', '#ff9a4d']], [12.5, ['#4b3bff', '#ff6b57', '#8a4dff']]];
  const palAt = t => { let i = 0; for (let j = 0; j < PAL.length; j++) if (t >= PAL[j][0]) i = j; const cur = PAL[i][1], nxt = PAL[i + 1], k = nxt ? eio3(P(t, nxt[0] - 0.7, nxt[0])) : 0; return cur.map((c, n) => nxt ? mixc(c, nxt[1][n], k) : mixc(c, c, 0)); };
  const WAVES = [[0.32, 960, 540, 1500, 1.0], [C.burst, 1220, 740, 1900, 1.1], [C.whip1 + 0.15, 960, 540, 2400, 0.9], [C.themeClick, 880, 259, 1200, 0.9], [C.themeClick + C.themeStep, 880, 259, 1200, 0.8], [C.themeClick + 2 * C.themeStep, 880, 259, 1200, 0.8], [C.themeClick + 3 * C.themeStep, 880, 259, 1200, 0.8], [C.presentIn, 960, 540, 2000, 0.9], [C.push, 960, 540, 2000, 0.8], [C.tiles, 960, 480, 1800, 0.9], [C.finale, 960, 540, 2600, 1.8]];
  const blobs = [[0, 0.00, 0.31, 520, 260, 0.9], [1, 2.10, 0.23, 640, 300, 0.8], [2, 4.20, 0.37, 500, 340, 0.7], [0, 5.40, 0.19, 700, 220, 0.6]];
  function drawBg(t) {
    const pal = palAt(t), inten = lerp(0.18, 1, eo3(P(t, 0.15, 1.2))) * (1 + 0.8 * Math.exp(-Math.max(0, t - C.finale) * 3) * (t >= C.finale ? 1 : 0));
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#07051a'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    blobs.forEach(([ci, ph, sp, ax, ay, str]) => {
      const x = W / 2 + Math.cos(t * sp * 2 + ph) * ax * 1.6, y = H / 2 + Math.sin(t * sp * 2.3 + ph * 1.3) * ay * 1.4, r = 820, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, pal[ci]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.34 * str * inten; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    });
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // dot grid with ripples
    const gap = 48, ox = (W % gap) / 2, oy = (H % gap) / 2, appear = eo3(P(t, 0.1, 0.9));
    for (let y = oy; y < H; y += gap) for (let x = ox; x < W; x += gap) {
      let w = 0; for (let k = 0; k < WAVES.length; k++) { const [t0, wx, wy, spd, amp] = WAVES[k], dt = t - t0; if (dt < 0 || dt > 2.2) continue; const d = Math.hypot(x - wx, y - wy) - spd * dt, e = Math.exp(-(d * d) / 9000) * Math.exp(-dt * 1.5); w += amp * e; }
      const r = (1.3 + 3.2 * Math.min(w, 1.6)) * appear, a = (0.16 + 0.55 * Math.min(w, 1)) * appear; if (r < .2) continue;
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
  }
  // top overlay: vignette, grain, flash
  const fx = document.createElement('canvas'); fx.width = W; fx.height = H; fx.style.cssText = 'position:absolute;inset:0;pointer-events:none;'; V.appendChild(fx); const fg = fx.getContext('2d');
  const noise = document.createElement('canvas'); noise.width = noise.height = 256; { const n = noise.getContext('2d'), id = n.createImageData(256, 256); for (let i = 0; i < id.data.length; i += 4) { const v = rnd() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } n.putImageData(id, 0, 0); }
  function drawFx(t) {
    fg.clearRect(0, 0, W, H);
    const vg = fg.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,16,.62)'); fg.fillStyle = vg; fg.fillRect(0, 0, W, H);
    const f = Math.floor(t * 60) % 17; fg.globalAlpha = 0.045; fg.globalCompositeOperation = 'overlay'; for (let y = -256 + f * 9; y < H; y += 256) for (let x = -256 + f * 5; x < W; x += 256) fg.drawImage(noise, x, y);
    fg.globalAlpha = 1; fg.globalCompositeOperation = 'source-over';
    const fl = (t >= C.finale ? Math.exp(-(t - C.finale) * 7.5) : 0) * 0.95 + (t >= C.burst && t < C.burst + 0.4 ? Math.exp(-(t - C.burst) * 14) * 0.35 : 0) + (t >= C.presentIn - 0.05 && t < C.presentIn + 0.3 ? Math.exp(-(t - C.presentIn) * 14) * 0.25 : 0);
    if (fl > 0.01) { const gr = fg.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 1100); gr.addColorStop(0, `rgba(255,248,235,${fl.toFixed(3)})`); gr.addColorStop(0.5, `rgba(190,170,255,${(fl * 0.55).toFixed(3)})`); gr.addColorStop(1, 'rgba(120,90,255,0)'); fg.fillStyle = gr; fg.fillRect(0, 0, W, H); }
  }

  /* ── SCENE 0: the spark ── */
  const sparkGlow = mk('', 'left:-450px;top:-450px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(255,211,110,.55),rgba(255,140,90,.18) 40%,rgba(0,0,0,0) 68%);');
  const star = mk(starSvg(220, 'sg1'), 'left:-110px;top:-110px;width:220px;height:220px;filter:drop-shadow(0 0 40px rgba(255,200,100,.9));');
  const rings = [0, 1].map(() => mk('', 'left:-300px;top:-300px;width:600px;height:600px;border-radius:50%;border:5px solid rgba(255,225,150,.9);'));
  const sparks = Array.from({ length: 36 }, () => ({ a: rnd() * 6.2832, v: 360 + rnd() * 900, s: 5 + rnd() * 12, l: 0.7 + rnd() * 0.7, c: ['#ffd36e', '#ff8f7d', '#ffffff', '#b9a8ff'][Math.floor(rnd() * 4)], e: null }));
  sparks.forEach(p => { p.e = mk('', `left:0;top:0;width:${p.s}px;height:${p.s}px;margin:${-p.s / 2}px;border-radius:50%;background:${p.c};box-shadow:0 0 ${p.s * 2}px ${p.c};`); });
  const CARD = { x: 620, y: 650, w: 1200, h: 170 }, ICON = { x: CARD.x + 86, y: CARD.y + CARD.h / 2 };
  function scene0(t) {
    const t0 = C.spark, grow = spring(t, t0, 2.0, 7), travel = eio4(P(t, 1.22, 1.78)), gone = t > 1.82;
    const sc = lerp(grow * 1.15, 0.36, travel), x = lerp(960, ICON.x, travel), y = lerp(540, ICON.y, travel);
    put(star, { x, y, s: sc, r: (1 - grow) * -90 + travel * 90, o: t < t0 || gone ? 0 : 1 });
    put(sparkGlow, { x: 960, y: 540, s: lerp(0.2, 1.3, eo3(P(t, t0, t0 + 0.6))) * (1 - 0.0 * travel), o: (t < t0 ? 0 : (1 - P(t, 1.0, 1.4))) * 0.9 });
    rings.forEach((r, i) => { const p = P(t, t0 + 0.02 + i * 0.12, t0 + 0.9 + i * 0.12); put(r, { x: 960, y: 540, s: lerp(0.1, 2.6 + i * 0.7, eo4(p)), o: p > 0 && p < 1 ? (1 - p) * 0.9 : 0 }); });
    sparks.forEach(p => { const dt = t - t0; const d = dt > 0 ? p.v * (1 - Math.exp(-3.2 * dt)) / 3.2 : 0; put(p.e, { x: 960 + Math.cos(p.a) * d, y: 540 + Math.sin(p.a) * d, s: 1 - clamp(dt / p.l), o: dt > 0 && dt < p.l ? 1 : 0 }); });
  }

  /* ── SCENE 1: Describe it. ── */
  const k1a = kinetic('Describe', 'left:104px;top:88px;font-size:268px;padding:.07em .02em;'), k1b = kinetic('it.', 'left:104px;top:336px;font-size:268px;padding:.07em .02em;', GRAD_CORAL);
  const card = mk(`<div style="position:absolute;left:30px;top:${CARD.h / 2 - 48}px;width:112px;height:96px;"></div>
    <div class="mono" id="typed" style="position:absolute;left:150px;top:0;height:${CARD.h}px;display:flex;align-items:center;font-family:Inter;font-weight:500;font-size:43px;letter-spacing:-.01em;white-space:nowrap;"><span id="typedT"></span><span id="caret" style="display:inline-block;width:4px;height:52px;margin-left:5px;background:#ffd36e;border-radius:2px;"></span></div>
    <div id="enter" style="position:absolute;right:34px;top:${CARD.h / 2 - 54}px;width:108px;height:108px;border-radius:32px;background:linear-gradient(135deg,#5b4bff,#ff6b57);display:grid;place-items:center;box-shadow:0 12px 30px -8px rgba(255,107,87,.8), inset 0 2px 0 rgba(255,255,255,.4);"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5v6a3 3 0 0 1-3 3H5"/><path d="M9 10l-4 4 4 4"/></svg></div>`, `left:${CARD.x}px;top:${CARD.y}px;width:${CARD.w}px;height:${CARD.h}px;border-radius:52px;`, world, 'abs glass');
  const cardIcon = mk(starSvg(78, 'sg2'), `left:${ICON.x - 39}px;top:${ICON.y - 39}px;width:78px;height:78px;filter:drop-shadow(0 0 16px rgba(255,200,100,.7));`);
  const typedT = card.querySelector('#typedT'), caret = card.querySelector('#caret'), enterBtn = card.querySelector('#enter');
  const ripple = mk('', 'left:-80px;top:-80px;width:160px;height:160px;border-radius:50%;border:4px solid rgba(255,255,255,.9);');
  function scene1(t) {
    kUpdate(k1a, t, C.titleIn1, C.titleOut1); kUpdate(k1b, t, C.titleIn1 + 0.22, C.titleOut1 + 0.06);
    const a = spring(t, C.cardIn, 2.0, 7.5), exit = ei3(P(t, C.burst + 0.05, C.burst + 0.5)), press = P(t, C.enter, C.enter + 0.07) * (1 - P(t, C.enter + 0.07, C.enter + 0.2));
    put(card, { x: 0, y: (1 - a) * 90 + exit * 60, s: (0.82 + 0.18 * Math.min(a, 1.06)) * (1 - 0.04 * press) * (1 - 0.1 * exit), o: t < C.cardIn ? 0 : (1 - exit) });
    const n = Math.floor(C.typeText.length * P(t, C.typeStart, C.typeEnd) + 0.0001);
    typedT.textContent = C.typeText.slice(0, n); caret.style.opacity = (t < C.typeEnd + 0.2 || Math.floor(t * 2.4) % 2 === 0) ? 1 : 0;
    if (n === 0 && t > C.cardIn + 0.1) { typedT.textContent = ''; }
    const pr = P(t, C.enter, C.enter + 0.4); enterBtn.style.transform = `scale(${(1 - 0.12 * press).toFixed(3)})`; enterBtn.style.filter = `brightness(${(1 + 0.6 * press).toFixed(2)})`;
    put(cardIcon, { x: 0, y: (1 - a) * 90 + exit * 60, s: (1 - 0.1 * exit), o: t < 1.78 ? 0 : (1 - exit), r: Math.sin(t * 2) * 4 });
    put(ripple, { x: CARD.x + CARD.w - 34 - 54, y: CARD.y + CARD.h / 2, s: lerp(0.4, 3.4, eo3(pr)), o: pr > 0 && pr < 1 ? (1 - pr) * 0.9 : 0 });
  }

  /* the slides burst into a carousel */
  const ASL = ['a', 'b', 'c', 'd', 'e', 'f'];
  const persp = mk('', 'left:0;top:0;width:1920px;height:1080px;perspective:2100px;perspective-origin:50% 50%;');
  const rot = mk('', 'left:0;top:0;width:0;height:0;transform-style:preserve-3d;', persp);
  const cards3 = ASL.map(n => { const c = mk(img(`slide-${n}.png`) + '<div class="dim" style="position:absolute;inset:0;background:#05031a;"></div><div class="gloss" style="position:absolute;inset:0;background:linear-gradient(105deg,rgba(255,255,255,0) 35%,rgba(255,255,255,.55) 50%,rgba(255,255,255,0) 65%);transform:translateX(-120%);"></div>', '', rot, 'card3d'); return { c, dim: c.querySelector('.dim'), gloss: c.querySelector('.gloss') }; });
  function carousel(t) {
    const t0 = C.burst, vis = t > t0 - 0.02 && t < C.whip1 + 0.4; if (!vis) { persp.style.visibility = 'hidden'; return; } persp.style.visibility = 'visible';
    const R = 960 * eoB(P(t, t0, t0 + 0.95), 1.5), spin = lerp(-230, 0, eoE(P(t, t0, t0 + 1.75))) - 5 * Math.max(0, t - 4.4), sc = lerp(0.18, 1, eo4(P(t, t0, t0 + 0.8))) * lerp(1, 1.22, ei3(P(t, C.whip1, C.whip1 + 0.3)));
    rot.style.transform = `translate3d(960px,${(540 + Math.sin(t * 1.6) * 6).toFixed(1)}px,${(-R * sc).toFixed(1)}px) rotateY(${spin.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    cards3.forEach((o, i) => {
      o.c.style.transform = `rotateY(${i * 60}deg) translateZ(${R.toFixed(1)}px)`;
      const eff = (((i * 60 + spin) % 360) + 540) % 360 - 180; o.dim.style.opacity = (clamp(Math.abs(eff) / 100) * 0.62).toFixed(3);
      const gp = P(t, 4.28 + i * 0.05, 4.78 + i * 0.05); o.gloss.style.transform = `translateX(${lerp(-120, 120, eio3(gp)).toFixed(1)}%)`;
    });
    persp.style.opacity = 1 - P(t, C.whip1 + 0.2, C.whip1 + 0.36);
  }

  /* the whip wipe between scenes */
  const wipeA = mk('', 'left:-1100px;top:-200px;width:2200px;height:1480px;background:linear-gradient(100deg,#2b1c8f 0%,#5b4bff 40%,#ff6b57 100%);transform:skewX(-14deg);');
  const wipeB = mk('', 'left:-1100px;top:-200px;width:1500px;height:1480px;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.55));transform:skewX(-14deg);');
  const wipeC = mk('', 'left:-1100px;top:-200px;width:700px;height:1480px;background:linear-gradient(100deg,rgba(255,211,110,0),rgba(255,211,110,.65));transform:skewX(-14deg);');
  function wipe(t) {
    const p = eio4(P(t, C.whip1, C.whip1 + 0.5)), on = t >= C.whip1 && t <= C.whip1 + 0.52;
    [[wipeA, 0], [wipeB, -300], [wipeC, -700]].forEach(([e, off]) => { if (!on) { e.style.visibility = 'hidden'; return; } e.style.visibility = 'visible'; e.style.transform = `translate3d(${lerp(-1900, 3000, p) + off}px,0,0) skewX(-14deg)`; });
  }

  /* ── SCENE 2: Edit it. ── */
  const K = 1700 / 1920, WIN = { x: 110, y: 170, w: 1700, h: 956 }, TH = ['studio', 'editorial', 'contrast', 'brutal', 'aurora'], TN = ['Studio', 'Editorial', 'Contrast', 'Brutalist', 'Aurora'];
  const px = (x, y) => [WIN.x + x * K, WIN.y + y * K];
  const cam = mk('', 'left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;perspective:2600px;perspective-origin:50% 40%;');
  const winW = mk('', `left:${WIN.x}px;top:${WIN.y}px;width:${WIN.w}px;height:${WIN.h}px;transform-origin:50% 50%;transform-style:preserve-3d;`, cam);
  const winIn = mk('', `left:0;top:0;width:${WIN.w}px;height:${WIN.h}px;border-radius:24px;overflow:hidden;background:#222;box-shadow:0 70px 140px -20px rgba(0,0,0,.7),0 0 0 2px rgba(255,255,255,.22),0 0 120px rgba(120,90,255,.45);`, winW);
  const layers = TH.map((th, i) => mk(img(`editor-${th}.png`, `width:${WIN.w}px;height:${WIN.h}px;`), `left:0;top:0;width:${WIN.w}px;height:${WIN.h}px;`, winIn));
  const [cx0, cy0] = px(RC.theme.x + RC.theme.w / 2, RC.theme.y + RC.theme.h / 2), CUR_REVEAL = [cx0 - WIN.x, cy0 - WIN.y];
  const hl = RC.headline, [hx, hy] = px(hl.x, hl.y), HLR = { x: hx - 12, y: hy - 8, w: hl.w * K + 24, h: hl.h * K + 16 }, HCENTER = [HLR.x + HLR.w * 0.42, HLR.y + HLR.h * 0.5];
  const k2a = kinetic('Edit', 'left:118px;top:-34px;font-size:176px;padding:.07em .02em;'), k2b = kinetic('it.', 'left:640px;top:-34px;font-size:176px;padding:.07em .02em;', GRAD_VIOLET);
  const sel = mk(`<div style="position:absolute;inset:0;border:4px solid #7a6bff;border-radius:6px;box-shadow:0 0 0 1px rgba(255,255,255,.7), 0 0 40px rgba(122,107,255,.7);"></div>` +
    [[0, 0], [50, 0], [100, 0], [0, 50], [100, 50], [0, 100], [50, 100], [100, 100]].map(([a, b]) => `<i style="position:absolute;left:${a}%;top:${b}%;width:20px;height:20px;margin:-10px;background:#fff;border:4px solid #7a6bff;border-radius:6px;"></i>`).join('') +
    `<div style="position:absolute;left:-4px;top:-48px;padding:6px 16px;border-radius:12px 12px 12px 0;background:#7a6bff;font-weight:700;font-size:25px;white-space:nowrap;">Headline · click to type</div>`, `left:${HLR.x}px;top:${HLR.y}px;width:${HLR.w}px;height:${HLR.h}px;`);
  const pill = mk(TN.map((n, i) => `<div class="tn" style="position:absolute;left:0;right:0;top:0;height:64px;display:grid;place-items:center;font-weight:800;font-size:34px;letter-spacing:-.01em;">${n}</div>`).join(''), `left:${cx0 - 150}px;top:${cy0 + 54}px;width:300px;height:64px;border-radius:32px;overflow:hidden;`, world, 'abs glass');
  const tns = Array.from(pill.querySelectorAll('.tn'));
  const CHIPS = [['5', 'themes', 150, 5], ['23', 'layouts', 770, 23], ['50+', 'fonts', 1390, 50]].map(([v, l, x, n], i) => ({ n, v, e: mk(`<b>${v}</b><span>${l}</span>`, `left:${x}px;top:930px;`, world, 'abs chip glass') }));
  const cur = mk(`<svg width="64" height="64" viewBox="0 0 24 24"><path d="M5 3l14 8-6.2 1.7L10 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`, 'left:-8px;top:-6px;width:64px;height:64px;filter:drop-shadow(0 8px 10px rgba(0,0,0,.45));');
  const clickRings = [0, 1].map(() => mk('', 'left:-70px;top:-70px;width:140px;height:140px;border-radius:50%;border:5px solid rgba(255,255,255,.95);'));
  const CUR_KEYS = [[5.45, 1790, 1010], [C.cursorClick, HCENTER[0], HCENTER[1]], [6.42, HCENTER[0] + 30, HCENTER[1] + 6], [C.themeClick, cx0, cy0], [7.75, cx0 + 40, cy0 + 20], [8.45, 1360, 760], [8.9, 1500, 900]];
  function curPos(t) { for (let i = 0; i < CUR_KEYS.length - 1; i++) { const a = CUR_KEYS[i], b = CUR_KEYS[i + 1]; if (t >= a[0] && t <= b[0]) { const k = eio3(P(t, a[0], b[0])); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; } } return t < CUR_KEYS[0][0] ? [CUR_KEYS[0][1], CUR_KEYS[0][2]] : [CUR_KEYS.at(-1)[1], CUR_KEYS.at(-1)[2]]; }
  const STAGE = { x: WIN.x + RC.stage.x * K, y: WIN.y + RC.stage.y * K, w: RC.stage.w * K, h: RC.stage.h * K };
  function scene2(t) {
    const live = t >= C.editIn && t < C.presentIn + 0.05;
    [k2a, k2b].forEach(k => { if (!live) k.line.style.visibility = 'hidden'; });
    cam.style.display = live ? '' : 'none'; if (!live) { [sel, pill, cur, ...CHIPS.map(c => c.e), ...clickRings].forEach(e => { e.style.visibility = 'hidden'; }); return; }
    // camera push into the stage at the end
    const zp = eio3(P(t, C.zoom, C.zoom + 0.72)), s = lerp(1, 1920 / STAGE.w, zp), scx = STAGE.x + STAGE.w / 2, scy = STAGE.y + STAGE.h / 2;
    const camx = lerp(0, 960 - s * scx, zp), camy = lerp(0, 540 - s * scy, zp);
    cam.style.transform = `translate3d(${camx.toFixed(2)}px,${camy.toFixed(2)}px,0) scale(${s.toFixed(4)})`;
    // window entrance
    const e = spring(t, C.winIn, 1.6, 6.0), e2 = eo4(P(t, C.winIn, C.winIn + 0.7));
    winW.style.opacity = clamp(P(t, C.winIn - 0.02, C.winIn + 0.18)); winW.style.transform = `translate3d(0,${((1 - e) * 360).toFixed(1)}px,${((1 - e) * -500).toFixed(1)}px) rotateX(${((1 - e) * 36).toFixed(2)}deg) rotateY(${((1 - e2) * -22).toFixed(2)}deg) scale(${lerp(0.82, 1, Math.min(e, 1.04)).toFixed(4)})`;
    // theme cycle: circular reveals from the cursor
    layers.forEach((l, i) => {
      if (i === 0) return; const st = C.themeClick + (i - 1) * C.themeStep, p = eo3(P(t, st, st + 0.5));
      l.style.visibility = p > 0 ? 'visible' : 'hidden'; l.style.clipPath = `circle(${(p * 2600).toFixed(1)}px at ${CUR_REVEAL[0].toFixed(1)}px ${CUR_REVEAL[1].toFixed(1)}px)`;
    });
    kUpdate(k2a, t, C.editIn + 0.05, 0, 0.04); kUpdate(k2b, t, C.editIn + 0.2, 0, 0.04);
    const fadeOut = 1 - P(t, C.zoom - 0.05, C.zoom + 0.25); k2a.line.style.opacity = k2b.line.style.opacity = fadeOut;
    // selection box
    const sp = spring(t, 6.15, 2.4, 9), sOut = P(t, 6.42, 6.58);
    put(sel, { x: 0, y: 0, s: lerp(0.94, 1, Math.min(sp, 1.08)), o: (t < 6.15 ? 0 : 1 - sOut) });
    // theme name pill
    const step = clamp(Math.floor((t - C.themeClick) / C.themeStep + 0.18) + 1, 0, 4);
    tns.forEach((el, i) => { const lastChange = i === 0 ? -1 : C.themeClick + (i - 1) * C.themeStep, pp = i === 0 ? 1 : eo4(P(t, lastChange, lastChange + 0.26)); const off = (i < step ? -1 : i === step ? 0 : 1); let y; if (i === step) y = (1 - pp) * 64; else if (i < step) y = (i === step - 1 ? -pp * 64 : -64); else y = 64; el.style.transform = `translateY(${y.toFixed(1)}px)`; });
    const pin = P(t, C.themeClick - 0.15, C.themeClick + 0.1), pout = P(t, C.zoom - 0.1, C.zoom + 0.1);
    put(pill, { x: 0, y: 0, s: lerp(0.8, 1, eo3(pin)), o: pin * (1 - pout) });
    // chips with counters
    CHIPS.forEach((c, i) => { const a = spring(t, C.chips + i * 0.14, 2.2, 7), o = (t < C.chips + i * 0.14 ? 0 : 1) * (1 - P(t, C.zoom - 0.1, C.zoom + 0.1)); put(c.e, { x: 0, y: (1 - a) * 80, s: lerp(0.7, 1, Math.min(a, 1.08)), o }); const num = Math.round(c.n * eo3(P(t, C.chips + i * 0.14, C.chips + i * 0.14 + 0.32))); c.e.firstChild.textContent = c.v.endsWith('+') ? num + '+' : String(num); });
    // cursor and click rings
    const [cxp, cyp] = curPos(t); put(cur, { x: cxp, y: cyp, s: 1 - 0.12 * (Math.max(0, 1 - Math.abs(t - C.cursorClick) * 18) + Math.max(0, 1 - Math.abs(t - C.themeClick) * 18)), o: (t < 5.45 ? 0 : 1) * (1 - P(t, 8.8, 9.0)) * (1 - pout * 0) });
    [[C.cursorClick, HCENTER], [C.themeClick, [cx0, cy0]]].forEach(([ct, pos], i) => { const p = P(t, ct, ct + 0.45); put(clickRings[i], { x: pos[0], y: pos[1], s: lerp(0.3, 1.5, eo3(p)), o: p > 0 && p < 1 ? (1 - p) : 0 }); });
  }

  /* ── SCENE 3: Present it. ── */
  const s3 = mk('', 'left:0;top:0;width:1920px;height:1080px;transform-origin:960px 540px;');
  const pres = mk('', 'left:0;top:0;width:1920px;height:1080px;overflow:hidden;', s3);
  const full = mk(img('slide-a.png', 'width:1920px;height:1080px;'), 'left:0;top:0;width:1920px;height:1080px;', pres);
  const nxt = mk(img('slide-c.png', 'width:1920px;height:1080px;'), 'left:0;top:0;width:1920px;height:1080px;', pres);
  const presGlow = mk('', 'left:-700px;top:-420px;width:1400px;height:840px;border-radius:60px;box-shadow:0 0 160px 20px rgba(138,77,255,.55);', s3);
  const key = mk('<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>', 'left:-80px;top:-70px;width:160px;height:140px;border-radius:34px;display:grid;place-items:center;', s3, 'abs glass');
  const k3a = kinetic('Present', 'left:112px;top:22px;font-size:172px;padding:.07em .02em;', null, s3), k3b = kinetic('it.', 'left:760px;top:22px;font-size:172px;padding:.07em .02em;', GRAD_CORAL, s3);
  const anyw = mk('anywhere.', 'left:1010px;top:36px;font-family:"Instrument Serif",serif;font-style:italic;font-size:176px;line-height:1.05;white-space:nowrap;background:linear-gradient(135deg,#fff,#ffd9a8);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.02em;', s3);
  const ppt = mk(`<svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2.2" fill="rgba(255,255,255,.18)"/><path d="M12 16v4M8 20h8"/><circle cx="9.2" cy="10" r="2.2"/><path d="M13.5 8.5h4M13.5 11.5h3"/></svg>`, 'background:linear-gradient(145deg,#ff9a5c,#e8442f);', s3, 'tile');
  const pdf = mk('<div style="font-family:Bricolage Grotesque;font-weight:800;font-size:92px;letter-spacing:-.04em;text-shadow:0 4px 0 rgba(0,0,0,.18)">PDF</div>', 'background:linear-gradient(145deg,#ff6b8a,#c8164a);', s3, 'tile');
  const lblP = mk('PowerPoint', '', s3, 'abs lbl'), lblD = mk('PDF', '', s3, 'abs lbl');
  const URLP = { y: 880, w: 1240, h: 128 };
  const urlPill = mk(`<div style="position:absolute;left:26px;top:${URLP.h / 2 - 38}px;width:76px;height:76px;border-radius:24px;background:linear-gradient(135deg,#5b4bff,#ff6b57);display:grid;place-items:center;"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
    <div class="mono" style="position:absolute;left:130px;top:0;height:${URLP.h}px;display:flex;align-items:center;font-size:36px;font-weight:500;white-space:nowrap;letter-spacing:-.02em;"><span id="urlA"></span><span id="urlB" style="color:#ff9a8a"></span><span id="ucaret" style="display:inline-block;width:4px;height:44px;margin-left:4px;background:#ffd36e;border-radius:2px;"></span></div>`, `left:${960 - URLP.w / 2}px;top:${URLP.y - URLP.h / 2}px;width:${URLP.w}px;height:${URLP.h}px;border-radius:64px;transform-origin:50% 50%;`, s3, 'abs glass');
  const urlA = urlPill.querySelector('#urlA'), urlB = urlPill.querySelector('#urlB'), ucaret = urlPill.querySelector('#ucaret');
  const lock = mk(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7dffb2" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.4"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>Nothing uploaded. Nothing stored.</span>`, 'left:700px;top:960px;height:78px;padding:0 34px;border-radius:39px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:34px;white-space:nowrap;', s3, 'abs glass');
  const wires = mk(`<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><defs><linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#ffd36e"/><stop offset="1" stop-color="#ff6b57"/></linearGradient></defs>
    <path id="w1" d="M590 470 C500 470 470 500 410 500" fill="none" stroke="url(#wg)" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 12"/><path id="w2" d="M1330 470 C1420 470 1450 500 1510 500" fill="none" stroke="url(#wg)" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 12"/><path id="w3" d="M960 690 L960 815" fill="none" stroke="url(#wg)" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 12"/></svg>`, 'left:0;top:0;', s3);
  const wPaths = ['w1', 'w2', 'w3'].map(id => wires.querySelector('#' + id));
  const PC_ = { x: 960, y: 470, s: 0.395 };
  function scene3(t) {
    const live = t >= C.presentIn - 0.3 && t < C.finale; s3.style.display = live ? '' : 'none'; if (!live) return;
    const col = eio3(P(t, C.collapse, C.finale - 0.02)), cs = lerp(1, 0.02, ei3(P(t, C.collapse, C.finale - 0.02)));
    s3.style.opacity = t < C.presentIn ? P(t, C.presentIn - 0.3, C.presentIn) : (1 - ei3(P(t, C.collapse + 0.15, C.finale - 0.02))); s3.style.transform = `rotate(${(-col * 14).toFixed(2)}deg) scale(${cs.toFixed(4)})`;
    // full-screen slide, then the push to the next one, then the shrink into a card
    const kb = 1 + 0.035 * P(t, C.presentIn, C.push + 0.4), pp = eio4(P(t, C.push, C.push + 0.48));
    put(full, { x: lerp(0, -380, pp), y: 0, s: kb * lerp(1, 0.9, pp), o: 1 - P(t, C.push + 0.3, C.push + 0.48) });
    put(nxt, { x: lerp(1920, 0, pp), y: 0, s: lerp(1.0, 1, pp), o: 1 });
    nxt.style.visibility = t < C.push ? 'hidden' : 'visible';
    const sp = eio4(P(t, C.shrink, C.shrink + 0.62)), sc = lerp(1, PC_.s, sp), rad = lerp(0, 70, sp) / sc;
    pres.style.transform = `translate3d(${lerp(0, PC_.x - 960, sp).toFixed(2)}px,${lerp(0, PC_.y - 540, sp).toFixed(2)}px,0) scale(${sc.toFixed(4)})`;
    pres.style.clipPath = `inset(0 round ${rad.toFixed(1)}px)`; pres.style.boxShadow = 'none';
    put(presGlow, { x: 960 + lerp(0, PC_.x - 960, sp), y: 540 + lerp(0, PC_.y - 540, sp), s: lerp(1.4, 0.55, sp) * 1, o: sp * 0.9 });
    // the key that starts the push
    const kp = P(t, C.key, C.key + 0.08) * (1 - P(t, C.key + 0.08, C.key + 0.22)), ka = spring(t, C.key - 0.3, 2.2, 8);
    put(key, { x: 1730, y: 940 + kp * 8, s: lerp(0.7, 1, Math.min(ka, 1.06)) * (1 - 0.1 * kp), o: (t < C.key - 0.3 ? 0 : 1) * (1 - P(t, C.push + 0.35, C.push + 0.55)) });
    // title
    kUpdate(k3a, t, C.shrink + 0.02, 0, 0.04); kUpdate(k3b, t, C.shrink + 0.2, 0, 0.04);
    const ap = eo4(P(t, C.shrink + 0.45, C.shrink + 0.95)); put(anyw, { x: 0, y: (1 - ap) * 60, o: ap }); anyw.style.filter = `blur(${((1 - ap) * 14).toFixed(1)}px)`;
    // formats
    const ta = spring(t, C.tiles, 2.0, 6.5), tb = spring(t, C.tiles + 0.14, 2.0, 6.5);
    put(ppt, { x: 270 - 135, y: 500 - 135 + (1 - ta) * 120, s: lerp(0.3, 1, Math.min(ta, 1.1)), r: (1 - ta) * -25, o: t < C.tiles ? 0 : 1 });
    put(pdf, { x: 1650 - 135, y: 500 - 135 + (1 - tb) * 120, s: lerp(0.3, 1, Math.min(tb, 1.1)), r: (1 - tb) * 25, o: t < C.tiles + 0.14 ? 0 : 1 });
    put(lblP, { x: 270 - 200, y: 660, o: eo3(P(t, C.tiles + 0.25, C.tiles + 0.55)) }); put(lblD, { x: 1650 - 200, y: 660, o: eo3(P(t, C.tiles + 0.4, C.tiles + 0.7)) });
    wPaths.forEach((p, i) => { const L = p.getTotalLength(), st = C.tiles + 0.05 + i * 0.16, d = eo3(P(t, st, st + 0.45)); p.style.strokeDasharray = d < 1 ? `${(L * d).toFixed(1)} ${L}` : '14 12'; p.style.strokeDashoffset = d < 1 ? 0 : (-(t * 90)).toFixed(1); p.style.opacity = d > 0 ? 0.95 : 0; });
    // link bar and the typed address
    const ua = spring(t, C.tiles + 0.28, 1.9, 7), wd = lerp(128, URLP.w, eo4(P(t, C.tiles + 0.3, C.tiles + 0.85)));
    urlPill.style.width = wd + 'px'; urlPill.style.left = (960 - wd / 2) + 'px';
    put(urlPill, { x: 0, y: (1 - ua) * 90, s: 1, o: t < C.tiles + 0.28 ? 0 : 1 }); urlPill.querySelector('.mono').style.opacity = P(t, C.tiles + 0.7, C.tiles + 0.9);
    const n = Math.floor(C.urlText.length * P(t, C.urlStart, C.urlEnd) + 0.0001), full_ = C.urlText.slice(0, n), hi = C.urlText.indexOf('#');
    urlA.textContent = hi >= 0 ? full_.slice(0, hi) : full_; urlB.textContent = hi >= 0 && n > hi ? full_.slice(hi) : ''; ucaret.style.opacity = (t < C.urlEnd + 0.15 || Math.floor(t * 2.4) % 2 === 0) ? 1 : 0;
    const la = spring(t, C.lock, 2.2, 7); lock.style.left = (960 - lock.offsetWidth / 2) + 'px'; put(lock, { x: 0, y: (1 - la) * 50, s: lerp(0.8, 1, Math.min(la, 1.08)), o: t < C.lock ? 0 : 1 });
  }

  /* ── SCENE 4: the finale ── */
  const fGlow = mk('', 'left:-700px;top:-700px;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(circle,rgba(138,77,255,.55),rgba(255,107,87,.22) 40%,rgba(0,0,0,0) 68%);');
  const logo = mk(LOGO, 'left:-125px;top:-125px;width:250px;height:250px;filter:drop-shadow(0 30px 50px rgba(75,59,255,.65));');
  const logoGloss = mk('', 'left:0;top:0;width:250px;height:250px;', logo); logoGloss.style.cssText += 'background:linear-gradient(110deg,rgba(255,255,255,0) 40%,rgba(255,255,255,.7) 50%,rgba(255,255,255,0) 60%);transform:translateX(-130%);mix-blend-mode:overlay;border-radius:60px;';
  const wm = kinetic('Pitchcraft', 'left:0;top:0;font-size:178px;padding:.08em .03em;');
  const tag = ['Presentations,', 'crafted.'].map((w, i) => mk(w, `left:0;top:0;font-family:"Instrument Serif",serif;font-style:italic;font-size:92px;white-space:nowrap;letter-spacing:-.01em;${i ? 'background:linear-gradient(135deg,#ffe9a8,#ff9a8a);-webkit-background-clip:text;background-clip:text;color:transparent;' : 'color:#f1ecff;'}`));
  const urlBtn = mk(`<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg><span>visser23.github.io/pitchcraft</span><i style="display:grid;place-items:center;width:52px;height:52px;border-radius:26px;background:linear-gradient(135deg,#5b4bff,#ff6b57);margin-right:-12px;margin-left:8px;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></i>`, 'left:0;top:0;height:84px;padding:0 26px 0 32px;border-radius:42px;display:flex;align-items:center;gap:18px;font-size:38px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;', world, 'abs glass');
  const fParts = Array.from({ length: 90 }, () => { const s = 5 + rnd() * 16, c = ['#ffd36e', '#ff8f7d', '#ffffff', '#b9a8ff', '#7a6bff'][Math.floor(rnd() * 5)], sh = rnd() < 0.4; return { a: rnd() * 6.2832, v: 500 + rnd() * 1500, s, l: 0.9 + rnd() * 1.0, c, sh, e: mk(sh ? starSvg(s * 2.4, 'p' + Math.floor(rnd() * 1e6)) : '', sh ? '' : `width:${s}px;height:${s}px;margin:${-s / 2}px;border-radius:50%;background:${c};box-shadow:0 0 ${s * 2}px ${c};`) }; });
  const twinkles = [[250, 190, 0.0, 34], [1680, 250, 0.4, 26], [330, 880, 0.8, 22], [1600, 850, 0.2, 38], [880, 120, 0.6, 20]].map(([x, y, ph, sz], i) => ({ x, y, ph, e: mk(starSvg(sz * 2, 'tw' + i), 'filter:drop-shadow(0 0 14px rgba(255,211,110,.9));') }));
  let wmW = 0, tagW = [0, 0], urlW = 0;
  function measure() { wmW = wm.ch.reduce((a, s) => a + s.getBoundingClientRect().width, 0); tagW = tag.map(e => e.getBoundingClientRect().width); urlW = urlBtn.getBoundingClientRect().width; }
  function scene4(t) {
    const live = t >= C.finale - 0.02; const F = C.finale;
    if (!live) { [fGlow, logo, urlBtn, ...tag, ...fParts.map(p => p.e), ...twinkles.map(p => p.e)].forEach(e => { e.style.visibility = 'hidden'; }); wm.line.style.visibility = 'hidden'; return; }
    const lw = 250 + 54 + wmW, logoX0 = 960, logoX1 = 960 - lw / 2 + 125, wmX = 960 - lw / 2 + 250 + 54;
    const sp = spring(t, F, 1.7, 5.2), mv = eio4(P(t, C.wordmark - 0.1, C.wordmark + 0.5)), bob = Math.sin((t - F) * 1.9) * 5 * P(t, F + 1, F + 1.6);
    put(fGlow, { x: lerp(960, 960, 0), y: 540 - 70, s: lerp(0.3, 1, eo3(P(t, F, F + 0.8))) * (1 + 0.04 * Math.sin((t - F) * 2.4)), o: eo3(P(t, F, F + 0.5)) });
    put(logo, { x: lerp(logoX0, logoX1, mv), y: 400 + bob + lerp(140, 0, mv) * 0 - lerp(0, 0, mv), s: Math.max(0, sp) * lerp(1.15, 1, mv), r: -34 * (1 - eo3(P(t, F, F + 0.9))), o: 1 });
    logoGloss.style.transform = `translateX(${lerp(-130, 130, eio3(P(t, F + 0.5, F + 1.1))).toFixed(1)}%)`;
    wm.line.style.left = wmX + 'px'; wm.line.style.top = (400 - 118) + 'px'; kUpdate(wm, t, C.wordmark, 0, 0.045);
    const tx0 = 960 - (tagW[0] + tagW[1] + 28) / 2;
    tag.forEach((e, i) => { const st = C.tagline + i * 0.28, a = eo4(P(t, st, st + 0.6)); put(e, { x: tx0 + (i ? tagW[0] + 28 : 0), y: 600 + (1 - a) * 40, o: a }); e.style.filter = `blur(${((1 - a) * 16).toFixed(1)}px)`; });
    const ua = spring(t, C.urlPill, 2.0, 7); put(urlBtn, { x: 960 - urlW / 2, y: 800 + (1 - ua) * 70, s: lerp(0.7, 1, Math.min(ua, 1.08)), o: t < C.urlPill ? 0 : 1 });
    fParts.forEach(p => { const dt = t - F - 0.02, d = dt > 0 ? p.v * (1 - Math.exp(-2.6 * dt)) / 2.6 : 0, a = 1 - clamp(dt / p.l); put(p.e, { x: 960 + Math.cos(p.a) * d - (p.sh ? p.s * 1.2 : 0), y: 440 + Math.sin(p.a) * d * 0.8 - (p.sh ? p.s * 1.2 : 0), s: a, r: dt * (p.sh ? 120 : 0), o: dt > 0 && dt < p.l ? 1 : 0 }); });
    twinkles.forEach(p => { const a = P(t, C.tagline + p.ph, C.tagline + p.ph + 0.4), tw = 0.5 + 0.5 * Math.sin((t - F) * 3 + p.ph * 6); put(p.e, { x: p.x - 0, y: p.y, s: a * (0.7 + 0.5 * tw), r: (t - F) * 20, o: a * (0.4 + 0.6 * tw) }); });
  }

  /* ── master ── */
  const shakes = [[C.burst, 14], [C.finale, 26], [C.push + 0.05, 6], [C.presentIn, 8]];
  window.seek = function (t) {
    drawBg(t); drawFx(t);
    const sh = PV.shake(t, shakes);
    world.style.transform = `translate3d(${sh.x.toFixed(2)}px,${sh.y.toFixed(2)}px,0)`;
    scene0(t); scene1(t); carousel(t); wipe(t); scene2(t); scene3(t); scene4(t);
  };
  await PV.loaded(['800 100px "Bricolage Grotesque"', '400 80px "Instrument Serif"', 'italic 400 80px "Instrument Serif"', '500 40px "Inter"', '500 36px "JetBrains Mono"']);
  measure(); window.seek(0); PV.ready();
})();
