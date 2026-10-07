/* Pioneer demo runtime — builds every engine once the fonts and screenshots are ready, then renders exactly
   the time HyperFrames seeks to (hf-seek; the first seeks wait for setup via waitUntil). No clocks, no rAF. */
(function () {
  const PE = window.PE;
  const CFG = JSON.parse(document.getElementById('pioneer-config').textContent);
  const W = PE.W;
  const H = PE.H;
  const C = {
    pale: '#eceef2', pale2: '#dfe2ea', ink: '#0e0f13', ink2: '#1b2030', dusk: '#2f3758', dusk2: '#283050',
    orange: '#f08a24', orange2: '#e47d18', water: '#2f7fd1', green: '#2f8f5b', green2: '#287d4f', mint: '#7fd8a4', grey: '#8b8f9b',
  };
  const FAMILY = '"Geist", sans-serif';
  /* silver preset pushed toward readable chrome: denser stripe cycles + stronger edge contour so the bands
     visibly curve around strokes, wider dispersion for the rainbow fringe, crisper edges, more liquid */
  const METAL_PARAMS = { repetition: 2.4, contour: 0.55, shiftRed: 0.6, shiftBlue: 0.6, softness: 0.03, distortion: 0.15 };
  const $ = (id) => document.getElementById(id);
  const engines = {};
  const renderers = {};
  let ready = false;
  let lastT = 0;

  const FONTS = ['800 320px Geist', '600 197px Geist', '500 106px Geist', '500 200px Geist', '600 71px Geist', '600 30px Geist', '400 16px Geist', '400 14px "Fragment Mono"', '500 230px "Instrument Sans"'];
  const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(f))).then(() => document.fonts.ready);
  const imgsReady = Promise.all([...document.querySelectorAll('#assets img')].map((img) => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode()).catch(() => {})));

  const frame = (paint) => {
    const c = PE.canvas(W, H);
    paint(c.getContext('2d'));
    return c;
  };
  const mark = (g, x, y, size, color) => {
    g.save();
    g.translate(x, y);
    g.scale(size / 100, size / 100);
    g.fillStyle = color;
    g.fill(new Path2D(CFG.mark), 'evenodd');
    g.restore();
  };

  /** a real app screenshot on the checker grid, with plain, honest labels */
  function shot(img, crop, cells, ground, frameColor, tags) {
    return frame((g) => {
      PE.scene.checker(g, ground[0], ground[1]);
      const r = PE.scene.cells(...cells);
      PE.scene.image(g, img, crop, r);
      PE.scene.frame(g, r, frameColor, 4);
      for (const t of tags) {
        const x = t.align === 'right' ? r[0] + r[2] - 28 : r[0] + 28;
        const y = t.bottom ? r[1] + r[3] - 28 - (t.h ?? 60) : r[1] + 28;
        PE.scene.tag(g, t.text, x, y, t);
      }
    });
  }

  /** metal logo + soft silhouette halo; the halo keeps the dark chrome bands readable on dark grounds */
  function metalLayer(img, width, pad) {
    const metal = new PE.MetalLogo(img, { width, pad, preset: 'silver', params: METAL_PARAMS });
    const mw = metal.width;
    const mh = metal.height;
    const sil = PE.canvas(mw, mh);
    const sg = sil.getContext('2d');
    const sd = sg.createImageData(mw, mh);
    for (let i = 0; i < mw * mh; i++) {
      sd.data[i * 4] = sd.data[i * 4 + 1] = sd.data[i * 4 + 2] = 255;
      sd.data[i * 4 + 3] = Math.round(metal.cover[i] * 255);
    }
    sg.putImageData(sd, 0, 0);
    const GP = 60;
    const glow = PE.canvas(mw + GP * 2, mh + GP * 2);
    const gg = glow.getContext('2d');
    gg.filter = 'blur(22px)';
    gg.globalAlpha = 0.5;
    gg.drawImage(sil, GP, GP);
    gg.filter = 'blur(5px)';
    gg.globalAlpha = 0.55;
    gg.drawImage(sil, GP, GP);
    gg.filter = 'none';
    return { metal, glow, GP };
  }

  /** brand panel: ink card on the checker, and the Pioneer SVG in liquid metal — live per frame */
  function brand() {
    const bg = frame((g) => {
      PE.scene.checker(g, C.pale, C.pale2);
      const [x, y, w, h] = PE.scene.cells(2, 2, 13, 6);
      g.fillStyle = C.ink;
      g.fillRect(x, y, w, h);
    });
    const cv = frame(() => {});
    const layer = metalLayer($('img-logo'), 1120, 26);
    const [bx, by, bw, bh] = PE.scene.cells(2, 2, 13, 6);
    const paint = (lt) => {
      const g = cv.getContext('2d');
      g.drawImage(bg, 0, 0);
      const mw = layer.metal.width;
      const mh = layer.metal.height;
      const mx = bx + bw / 2 - mw / 2;
      const my = by + bh / 2 - mh / 2;
      g.globalAlpha = 0.32;
      g.drawImage(layer.glow, mx - layer.GP, my - layer.GP);
      g.globalAlpha = 1;
      g.drawImage(layer.metal.render(0.6 + lt), mx, my);
    };
    return { canvas: cv, paint };
  }

  function agentsScene() {
    return frame((g) => {
      PE.scene.checker(g, C.dusk, C.dusk2);
      const [x, y, w, h] = PE.scene.cells(1, 3, 14, 5);
      g.fillStyle = C.ink;
      g.fillRect(x, y, w, h);
      const names = ['Watch', 'Diagnose', 'Plan', 'Patch', 'Dispatch', 'Verify'];
      const col = w / names.length;
      const dotY = y + 112;
      g.fillStyle = '#3a4060';
      g.fillRect(x + col / 2, dotY - 2, w - col, 4);
      g.font = '600 62px Geist';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      names.forEach((n, i) => {
        const cx = x + col * (i + 0.5);
        g.fillStyle = C.orange;
        g.beginPath();
        g.arc(cx, dotY, 14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = C.pale;
        g.fillText(n, cx, y + 248);
      });
      g.textAlign = 'left';
    });
  }

  function init() {
    const seg = Object.fromEntries(CFG.segs.map((s) => [s.id, s]));
    const img = (id) => $(`img-${id}`);

    engines.wild = new PE.WildType($('cv-wild'), { words: ['intelligence'], accents: [C.orange], bg: C.ink, ink: C.pale, family: FAMILY, weight: 800, restFrac: 0.6 });
    engines.shutter = new PE.ShutterType($('cv-shutter'), { family: FAMILY, weight: 500, paper: C.pale, sky: C.water, phraseOne: ['Cities', 'still', 'break'], phraseTwo: ['under', 'ground'] });

    const flood = frame((g) => engines.shutter.renderTo(g, 67.99));
    const city = shot(img('city'), [0, 0, 1, 1], [1, 1, 14, 7], [C.pale, C.pale2], C.ink, [{ text: 'Downtown Abu Dhabi · real streets and buildings', dot: C.green }]);
    const pipes = shot(img('valves'), [0.1403, 0.2404, 0.6097, 0.6293], [2, 1, 13, 7], [C.ink, C.ink2], C.pale, [{ text: 'Pipes under the streets · simulated network', dot: C.water }]);
    const leak = shot(img('leak'), [0.1435, 0.2041, 0.6091, 0.6315], [2, 1, 13, 7], [C.orange, C.orange2], C.ink, [
      { text: 'Water main under Khalifa St · could burst in about 2 days', dot: C.orange },
      { text: 'Demo incident on real streets', align: 'right', bottom: true, size: 24, h: 48, padX: 18, bg: 'rgba(14,15,19,0.86)' },
    ]);
    const brandPanel = brand();
    engines.conv1 = new PE.Conveyor($('cv-conv1'), { scenes: [flood, brandPanel.canvas, city, pipes, leak, agentsScene()], pulses: seg.conv1.pulses });

    engines.warp = new PE.WarpType($('cv-warp'), {
      family: FAMILY, weight: 500, ground: C.dusk, ink: C.pale,
      phrases: [['Watch', 'hears trouble'], ['Diagnose', 'finds causes'], ['Plan', 'weighs', 'options'], ['Patch', 'turns valves'], ['Dispatch', 'sends crews'], ['Verify', 'checks work']],
    });

    engines.lights = new PE.Lights($('cv-lights'), {
      family: 'Geist', mono: '"Fragment Mono"', scale: 3.2,
      variants: [
        { kind: 'block', radius: 16, pad: [14, 20, 14, 20], cw: 268, ch: 36, steps: [{ label: 'Spot', state: 'done' }, { label: 'Compare', state: 'live' }, { label: 'Close', state: 'next' }] },
        { kind: 'progress', radius: 15, pad: [14, 20, 14, 20], cw: 246, ch: 16, text: 'Closing valves', trail: '2 of 3' },
        { kind: 'terminal', radius: 16, pad: [14, 20, 14, 20], cw: 242, ch: 36, dark: true, cmd: 'reroute water', out: 'flowing · nobody cut off' },
      ],
    });

    engines.stampA = new PE.StampType($('cv-stampA'), {
      family: FAMILY,
      worlds: [
        { bg: C.pale, bar: C.ink, ink: C.pale, lines: ['You hold', 'the limits.', 'Big calls', 'wait for you.'], park: seg.stampA.parks[0] },
        { bg: C.dusk, bar: C.orange, ink: C.ink, lines: ['Ask them', 'why.', 'They answer,', 'even in Arabic.'], park: seg.stampA.parks[1] },
      ],
    });

    const drive = shot(img('drive'), [0.1435, 0.2381, 0.8565, 0.7574], [1, 1, 14, 7], [C.pale, C.pale2], C.ink, [{ text: 'Crew 07 · driving real streets to the site', dot: C.orange }]);
    const fixed = shot(img('fixed'), [0, 0, 1, 1], [1, 1, 14, 7], [C.green, C.green2], C.ink, [{ text: 'Fixed · everything running normally', dot: C.mint }]);
    const dusk = frame((g) => PE.scene.checker(g, C.dusk, C.dusk2));
    engines.conv2 = new PE.Conveyor($('cv-conv2'), { scenes: [dusk, drive, fixed], pulses: seg.conv2.pulses });

    engines.stampB = new PE.StampType($('cv-stampB'), {
      family: FAMILY,
      worlds: [
        { bg: C.ink, bar: C.mint, ink: C.ink, lines: ['12,400', 'people', 'kept their', 'water.'], park: seg.stampB.parks[0] },
        { bg: C.orange, bar: C.ink, ink: C.orange, lines: ['AED 5.94M', 'saved by', 'fixing it', 'early.'], park: seg.stampB.parks[1] },
      ],
    });

    engines.flip = new PE.FlipType($('cv-flip'), { family: FAMILY, weight: 600, words: ['Pioneer', 'Watches', 'Decides', 'Repairs'], ground: C.ink, ink: C.pale, seed: 2026 });
    const fl = seg.flip;
    const flipRate = engines.flip.lastLanding() / (fl.tLand - fl.tStart);

    engines.showcase = showcase($('cv-showcase'), img('logo'));

    renderers.wild = (lt) => engines.wild.renderAt(lt, seg.wild.rate);
    renderers.shutter = (lt) => engines.shutter.render(PE.pw(seg.shutter.fmap, lt));
    renderers.conv1 = (lt) => {
      brandPanel.paint(lt);
      engines.conv1.renderAt(lt);
    };
    renderers.warp = (lt) => engines.warp.render(PE.pw(seg.warp.kmap, lt));
    renderers.lights = (lt) => engines.lights.renderAt(lt);
    renderers.stampA = (lt) => engines.stampA.renderAt(lt);
    renderers.conv2 = (lt) => engines.conv2.renderAt(lt);
    renderers.stampB = (lt) => engines.stampB.renderAt(lt);
    renderers.flip = (lt) => engines.flip.render(lt < fl.tStart ? -1 : Math.floor((lt - fl.tStart) * flipRate));
    renderers.showcase = (lt) => engines.showcase(lt);
    ready = true;
  }

  /** Logo showcase: the Pioneer SVG in liquid metal (Paper's liquidMetal, metal-fx silver), high contrast:
      near-black ground, a dusk lift and a soft silhouette glow so the dark chrome bands never sink into the
      ground; the metal pours in from the outline to the spine of each stroke, then the tagline flips in. */
  function showcase(canvas, logo) {
    const ctx = canvas.getContext('2d');
    const { metal, glow, GP } = metalLayer(logo, 1360, 30);
    const mw = metal.width;
    const mh = metal.height;
    const mx = Math.round(W / 2 - mw / 2);
    const my = Math.round(470 - mh / 2);
    const N = mw * mh;

    const mask = PE.canvas(mw, mh);
    const mg = mask.getContext('2d');
    const md = mg.createImageData(mw, mh);
    const layer = PE.canvas(mw, mh);
    const lg = layer.getContext('2d');

    const lines = [
      { text: 'The city that fixes itself first.', font: `500 50px ${FAMILY}`, y: 700, color: '#d9dce4', start: 0.95, stagger: 0.018 },
      { text: 'Real Abu Dhabi streets · AI agents you stay in charge of', font: `500 26px ${FAMILY}`, y: 1012, color: '#8b8f9b', start: 1.5, stagger: 0.01 },
    ];
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fontKerning = 'normal';
      const total = ctx.measureText(l.text).width;
      const x0 = W / 2 - total / 2;
      l.pens = [...l.text].map((ch, i) => x0 + ctx.measureText(l.text.slice(0, i + 1)).width - ctx.measureText(ch).width);
    }
    const LOWER = 'abcdefghijklmnopqrstuvwxyz';
    const smooth = (a, b, x) => {
      const t = PE.clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };

    return (lt) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#08090c';
      ctx.fillRect(0, 0, W, H);
      const lift = ctx.createRadialGradient(W / 2, 470, 40, W / 2, 470, 980);
      lift.addColorStop(0, 'rgba(47,55,88,0.62)');
      lift.addColorStop(0.55, 'rgba(47,55,88,0.16)');
      lift.addColorStop(1, 'rgba(47,55,88,0)');
      ctx.fillStyle = lift;
      ctx.fillRect(0, 0, W, H);

      const k = smooth(0.05, 1.0, lt);
      ctx.globalAlpha = 0.34 * smooth(0.25, 1.1, lt);
      ctx.drawImage(glow, mx - GP, my - GP);
      ctx.globalAlpha = 1;

      const src = metal.render(0.6 + lt);
      if (k >= 0.999) {
        ctx.drawImage(src, mx, my);
      } else if (k > 0.001) {
        const front = k * 1.2;
        for (let i = 0; i < N; i++) md.data[i * 4 + 3] = Math.round(255 * metal.cover[i] * PE.clamp((front - metal.depth[i]) / 0.18, 0, 1));
        mg.putImageData(md, 0, 0);
        lg.globalCompositeOperation = 'copy';
        lg.drawImage(src, 0, 0);
        lg.globalCompositeOperation = 'destination-in';
        lg.drawImage(mask, 0, 0);
        lg.globalCompositeOperation = 'source-over';
        ctx.drawImage(layer, mx, my);
      }

      ctx.textBaseline = 'alphabetic';
      ctx.fontKerning = 'none';
      lines.forEach((l, li) => {
        ctx.font = l.font;
        ctx.fillStyle = l.color;
        const n = l.text.length;
        const mid = (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const ch = l.text[i];
          if (ch === ' ') continue;
          const f = Math.floor((lt - l.start - Math.abs(i - mid) * l.stagger) * 30);
          if (f < 0) continue;
          let g = ch;
          if (f < 4 && /[a-zA-Z]/.test(ch)) {
            g = LOWER[PE.hash(i + 53 * li, Math.floor(f / 2) + 3) % 26];
            if (ch !== ch.toLowerCase()) g = g.toUpperCase();
          }
          ctx.fillText(g, l.pens[i], l.y);
        }
      });
    };
  }

  function renderAt(t) {
    for (const s of CFG.segs) {
      if (t >= s.start - 1e-4 && t <= s.start + s.len + 1e-4) renderers[s.id](Math.max(0, Math.min(s.len, t - s.start)));
    }
  }

  const readyP = Promise.all([fontsReady, imgsReady]).then(() => {
    try {
      init();
    } catch (err) {
      console.error('pioneer engines failed to start:', err && err.stack ? err.stack : err);
      throw err;
    }
    renderAt(window.__hfThreeTime || lastT || 0);
  });

  window.addEventListener('hf-seek', (e) => {
    const t = Math.max(0, Number(e.detail && e.detail.time) || 0);
    lastT = t;
    if (ready) renderAt(t);
    else if (e.detail && typeof e.detail.waitUntil === 'function') e.detail.waitUntil(readyP.then(() => renderAt(t)));
  });

  window.__pe = { renderAt, isReady: () => ready, readyP, engines, cfg: CFG };
})();
