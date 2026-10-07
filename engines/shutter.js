/* ShutterType (Arlan vault) — two lines of type seen through a rolling shutter, ported to a seek-driven
   renderer. The whole effect is one post-process: a seeded map of horizontal stripes, each showing the
   scene as it was 0..2.4 frames ago (five taps), clamped at the current phrase's first frame. The words
   and their set widths are props: widths come from the face's own ink proportions across the 539 px span. */
(function () {
  const PE = window.PE;
  const FRAMES = 68;
  const SCENE_W = 600;
  const SCENE_H = 337.5;
  const EASE_SCROLL = [0.8, 0, 0.2, 1];
  const EASE_LIFT = [0.85, 0, 0.15, 1];
  const bez = (t, b) => PE.bezier(t, b[0], b[1], b[2], b[3]);
  const step = (table, i) => table[Math.max(0, Math.min(table.length - 1, Math.floor(i)))];
  const PHASES = [{ name: 'streams', from: 0, to: 28 }, { name: 'addup', from: 29, to: 67 }];
  const wrap = (f) => ((Math.floor(f) % FRAMES) + FRAMES) % FRAMES;
  const phaseAt = (f) => (wrap(f) <= PHASES[0].to ? PHASES[0] : PHASES[1]);
  const SKY_SPANS = [[10, 28], [54, 67]];
  const isSky = (f) => SKY_SPANS.some(([a, b]) => wrap(f) >= a && wrap(f) <= b);

  const STREAMS_CAP = 49;
  const STREAMS_BASELINE = 187;
  const STREAMS_CENTRE = { x: 300, y: 163 };
  const STREAMS_DY = [
    [-11, -12, -13, 8, 14, -14, 34, 22, 14, 8, 4, 2, 2, 0],
    [12, 8, -13, -11, 14, -10, 16, -27, -17, -10, -5, -2, -2, 0],
    [-8, -15, -15, 13, -14, 11, -16, 28, 18, 10, 5, 2, 2, 0],
  ];
  const STREAMS_GAPS = [15, 15];
  const ZOOM_PER_FRAME = 0.0026;
  const ZOOM_ZERO = 13;
  const LIFT_START = 22;
  const LIFT_FRAMES = 10;
  const LIFT_PX = 97;
  const streamsScale = (f) => 1 + ZOOM_PER_FRAME * (Math.max(f, 10) - ZOOM_ZERO);
  const streamsLift = (f) => LIFT_PX * bez((f - LIFT_START) / LIFT_FRAMES, EASE_LIFT);

  const ADDUP_XHEIGHT = 57;
  const ADDUP_PITCH = 126;
  const ADDUP_BASELINE = 129;
  const ADDUP_LAGS = [0, 0.4];
  const ADDUP_GAPS = [33];
  const ADDUP_BEAT = 14;
  const ADDUP_SCROLL_FRAMES = 12;
  const ADDUP_FIRST_SCROLL = 27;
  const addupScroll = (f) => {
    const since = f - ADDUP_FIRST_SCROLL;
    const beats = Math.floor(since / ADDUP_BEAT);
    const within = since - beats * ADDUP_BEAT;
    return ADDUP_PITCH * (beats + bez(within / ADDUP_SCROLL_FRAMES, EASE_SCROLL));
  };

  const STRIPE_MIN = 14;
  const STRIPE_MAX = 60;
  const STRIPE_LAG_MAX = 2.4;
  const STRIPE_TAPS = 5;
  const STRIPE_SEED = 0x51ab7e;
  const lagOfTap = (tap) => (STRIPE_LAG_MAX * tap) / (STRIPE_TAPS - 1);
  function buildStripes(seed) {
    let s = seed >>> 0;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const out = [];
    let y = 0;
    let lastTap = -1;
    while (y < SCENE_H) {
      const h = STRIPE_MIN + rnd() * (STRIPE_MAX - STRIPE_MIN);
      let tap = Math.floor(rnd() * STRIPE_TAPS);
      if (tap === lastTap) tap = (tap + 1 + Math.floor(rnd() * (STRIPE_TAPS - 1))) % STRIPE_TAPS;
      lastTap = tap;
      out.push({ y0: y, y1: Math.min(SCENE_H, y + h), lag: lagOfTap(tap), tap });
      y += h;
    }
    return out;
  }
  const sampleFrame = (f, lag) => Math.max(phaseAt(f).from, f - lag);
  const MEASURE_PX = 200;

  class ShutterType {
    constructor(canvas, o) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.family = o.family;
      this.weight = o.weight ?? 500;
      this.paper = o.paper;
      this.sky = o.sky;
      this.streamsText = o.phraseOne;
      this.addupText = o.phraseTwo;
      this.stripes = buildStripes(STRIPE_SEED);
      this.boxes = new Map();
      this.capPerPx = 0.7;
      this.xPerPx = 0.5;
      const W = canvas.width;
      const H = canvas.height;
      this.taps = [];
      for (let i = 0; i < STRIPE_TAPS; i++) this.taps.push(PE.canvas(W, H));
      this.inner = PE.canvas(W, H);
      this.measure();
      this.streams = this.layout(this.streamsText, STREAMS_GAPS);
      this.addup = this.layout(this.addupText, ADDUP_GAPS);
    }

    font(px) {
      return `${this.weight} ${px}px ${this.family}`;
    }

    measure() {
      const words = new Set(['E', 'x', ...this.streamsText, ...this.addupText]);
      const off = PE.canvas(MEASURE_PX * 8, MEASURE_PX * 3);
      const g = off.getContext('2d', { willReadFrequently: true });
      const ox = MEASURE_PX / 2;
      const oy = MEASURE_PX * 2;
      g.font = this.font(MEASURE_PX);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      for (const word of words) {
        g.clearRect(0, 0, off.width, off.height);
        g.fillText(word, ox, oy);
        const px = g.getImageData(0, 0, off.width, off.height).data;
        let x0 = off.width, x1 = -1, y0 = off.height, y1 = -1;
        for (let y = 0; y < off.height; y++)
          for (let x = 0; x < off.width; x++) {
            if (px[(y * off.width + x) * 4 + 3] < 128) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        if (x1 < 0) continue;
        this.boxes.set(word, { cx: ((x0 + x1 + 1) / 2 - ox) / MEASURE_PX, w: (x1 - x0 + 1) / MEASURE_PX });
        if (word === 'E') this.capPerPx = (y1 - y0 + 1) / MEASURE_PX;
        if (word === 'x') this.xPerPx = (y1 - y0 + 1) / MEASURE_PX;
      }
    }

    /** set widths: the face's own ink proportions spread across the 30..569 span, word spaces fixed */
    layout(words, gaps) {
      const inks = words.map((w) => this.boxes.get(w)?.w ?? 1);
      const inner = 539 - gaps.reduce((a, b) => a + b, 0);
      const sum = inks.reduce((a, b) => a + b, 0);
      let x = 30;
      return words.map((text, i) => {
        const w = (inner * inks[i]) / sum;
        const c = x + w / 2;
        x += w + (gaps[i] ?? 0);
        return { text, x: c, w };
      });
    }

    squeeze(text, w, px) {
      const b = this.boxes.get(text);
      return b && b.w > 0 ? w / (b.w * px) : 1;
    }

    word(ctx, text, px, x, baseline, kx) {
      const b = this.boxes.get(text);
      if (!b) return;
      ctx.save();
      ctx.translate(x, baseline);
      ctx.scale(kx, 1);
      ctx.fillText(text, -b.cx * px, 0);
      ctx.restore();
    }

    scene(layer, f, ink) {
      const ctx = layer.getContext('2d');
      const k = layer.width / SCENE_W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, layer.width, layer.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = ink;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (phaseAt(f).name === 'streams') {
        const px = STREAMS_CAP / this.capPerPx;
        ctx.font = this.font(px);
        this.streams.forEach((w, i) => this.word(ctx, w.text, px, w.x, STREAMS_BASELINE + step(STREAMS_DY[i % 3], f), this.squeeze(w.text, w.w, px)));
      } else {
        const px = ADDUP_XHEIGHT / this.xPerPx;
        ctx.font = this.font(px);
        this.addup.forEach((w, i) => {
          const kx = this.squeeze(w.text, w.w, px);
          const base = ADDUP_BASELINE - (addupScroll(f - ADDUP_LAGS[i % 2]) % ADDUP_PITCH);
          for (let r = -2; r <= 3; r++) this.word(ctx, w.text, px, w.x, base + r * ADDUP_PITCH, kx);
        });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** draw frame f (fractional, 0..68) onto any context of the canvas's size */
    renderTo(ctx, f) {
      const sky = isSky(f);
      const ground = sky ? this.sky : this.paper;
      const ink = sky ? this.paper : this.sky;
      const W = this.canvas.width;
      const H = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < STRIPE_TAPS; i++) this.scene(this.taps[i], sampleFrame(f, lagOfTap(i)), ink);
      const k = W / SCENE_W;
      const ic = this.inner.getContext('2d');
      ic.setTransform(1, 0, 0, 1, 0, 0);
      ic.clearRect(0, 0, W, H);
      for (const s of this.stripes) {
        const y0 = Math.round(s.y0 * k);
        const y1 = Math.min(H, Math.round(s.y1 * k));
        if (y1 <= y0) continue;
        ic.drawImage(this.taps[s.tap], 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (phaseAt(f).name === 'streams') {
        const scale = streamsScale(f);
        const lift = streamsLift(f);
        const cx = STREAMS_CENTRE.x * k;
        const cy = STREAMS_CENTRE.y * k;
        ctx.translate(cx, cy - lift * k);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      }
      ctx.drawImage(this.inner, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    render(f) {
      this.renderTo(this.ctx, Math.min(f, FRAMES - 0.001));
    }
  }

  ShutterType.FRAMES = FRAMES;
  ShutterType.CUT = 29;
  ShutterType.isSky = isSky;
  PE.ShutterType = ShutterType;
})();
