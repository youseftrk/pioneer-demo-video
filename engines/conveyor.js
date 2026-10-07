/* CheckerConveyor (Arlan vault) — nine rows, each a strip [current scene row][next scene row] that slides
   exactly one screen width per pulse. Ported to a seek-driven renderer: pulses are scheduled by the caller
   (dwell lengths follow the narration, the time-warp idea), while the measured whip (26-point table,
   Fritsch-Carlson monotone cubic), the fitted per-row starts and the three pulse durations stay verbatim,
   played at 1.45x. Scenes are pre-painted full frames, so a scene can carry a real product screenshot. */
(function () {
  const PE = window.PE;
  const ROWS = 9;
  const PULSE_RATE = 1.45;
  const PULSE_DUR = [51 / 30, 50 / 30, 42 / 30];
  const ROW_START_FRAME = [
    [36.7, 40.3, 43.92, 47.46, 51.32, 54.9, 58.38, 62.0, 65.6],
    [158.28, 161.54, 165.4, 169.26, 172.52, 176.3, 179.54, 183.4, 187.26],
    [266.4, 269.92, 273.42, 276.96, 280.88, 284.42, 287.92, 291.42, 294.96],
  ];
  const EASE_LUT = [0, 0.0024, 0.0056, 0.0098, 0.0153, 0.0226, 0.0322, 0.0448, 0.0667, 0.087, 0.124, 0.165, 0.233, 0.73, 0.819, 0.867, 0.907, 0.93, 0.946, 0.963, 0.974, 0.981, 0.989, 0.994, 0.998, 1];

  const LUT_N = EASE_LUT.length;
  const TANGENTS = (() => {
    const h = 1 / (LUT_N - 1);
    const d = [];
    for (let i = 0; i < LUT_N - 1; i++) d.push((EASE_LUT[i + 1] - EASE_LUT[i]) / h);
    const m = [d[0]];
    for (let i = 1; i < LUT_N - 1; i++) m.push((d[i - 1] + d[i]) / 2);
    m.push(d[LUT_N - 2]);
    for (let i = 0; i < LUT_N - 1; i++) {
      if (d[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * d[i];
          m[i + 1] = t * b * d[i];
        }
      }
    }
    return m;
  })();

  function ease(k) {
    if (k <= 0) return 0;
    if (k >= 1) return 1;
    const x = k * (LUT_N - 1);
    const i = Math.min(LUT_N - 2, Math.floor(x));
    const t = x - i;
    const h = 1 / (LUT_N - 1);
    const y0 = EASE_LUT[i];
    const y1 = EASE_LUT[i + 1];
    const m0 = TANGENTS[i] * h;
    const m1 = TANGENTS[i + 1] * h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  }

  /** when row r of a pulse starts, and how long it runs, in seconds after the pulse's `at` */
  function rowStart(shape, r, rev) {
    const row = rev ? ROWS - 1 - r : r;
    return (ROW_START_FRAME[shape][row] - ROW_START_FRAME[shape][0]) / 30 / PULSE_RATE;
  }
  const rowDur = (shape) => PULSE_DUR[shape] / PULSE_RATE;

  class Conveyor {
    /** o.scenes: full-frame canvases; o.pulses: [{ at, shape: 0|1|2, dir: 'left'|'right'|'split', rev }] */
    constructor(canvas, o) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scenes = o.scenes;
      this.pulses = o.pulses;
    }

    rowState(r, lt) {
      let scene = 0;
      for (let j = 0; j < this.pulses.length; j++) {
        const p = this.pulses[j];
        const t0 = p.at + rowStart(p.shape, r, p.rev);
        const d = rowDur(p.shape);
        if (lt >= t0 + d) scene = j + 1;
        else if (lt >= t0) return { scene: j, k: (lt - t0) / d, dir: p.dir };
        else break;
      }
      return { scene, k: 0, dir: 'left' };
    }

    renderAt(lt) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const cell = H / ROWS;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let r = 0; r < ROWS; r++) {
        const y0 = Math.round(r * cell);
        const y1 = r === ROWS - 1 ? H : Math.round((r + 1) * cell);
        const h = y1 - y0;
        const { scene, k, dir } = this.rowState(r, lt);
        const a = this.scenes[Math.min(scene, this.scenes.length - 1)];
        if (k <= 0) {
          ctx.drawImage(a, 0, y0, W, h, 0, y0, W, h);
          continue;
        }
        const b = this.scenes[Math.min(scene + 1, this.scenes.length - 1)];
        const rightward = dir === 'right' || (dir === 'split' && r % 2 === 1);
        const off = Math.round(ease(k) * W);
        if (rightward) {
          ctx.drawImage(a, 0, y0, W, h, off, y0, W, h);
          ctx.drawImage(b, 0, y0, W, h, off - W, y0, W, h);
        } else {
          ctx.drawImage(a, 0, y0, W, h, -off, y0, W, h);
          ctx.drawImage(b, 0, y0, W, h, W - off, y0, W, h);
        }
      }
    }
  }

  Conveyor.ROWS = ROWS;
  Conveyor.rowStart = rowStart;
  Conveyor.rowDur = rowDur;
  /** seconds from a pulse's `at` until its last row has landed */
  Conveyor.span = (shape) => rowStart(shape, ROWS - 1, false) + rowDur(shape);
  /** seconds from `at` until the middle row hits the whip (half the travel) */
  Conveyor.peak = (shape) => rowStart(shape, 4, false) + 0.5 * rowDur(shape);
  Conveyor.ease = ease;
  PE.Conveyor = Conveyor;

  /* ---------- scene painters (full 1920x1080 frames on the 9-row grid) ---------- */
  const CELL = 120;
  PE.scene = {
    CELL,
    checker(ctx, a, b) {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < 16; c++) {
          ctx.fillStyle = (r + c) % 2 ? b : a;
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
    },
    /** rect in whole cells, inclusive */
    cells(c0, r0, c1, r1) {
      return [c0 * CELL, r0 * CELL, (c1 - c0 + 1) * CELL, (r1 - r0 + 1) * CELL];
    },
    /** cover-fit a fractional crop [x, y, w, h] of an image into a rect */
    image(ctx, img, crop, rect) {
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      const [fx, fy, fw, fh] = crop ?? [0, 0, 1, 1];
      const sx = fx * nw, sy = fy * nh, sw = fw * nw, sh = fh * nh;
      const [x, y, w, h] = rect;
      const s = Math.max(w / sw, h / sh);
      const cw = w / s;
      const ch = h / s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx + (sw - cw) / 2, sy + (sh - ch) / 2, cw, ch, x, y, w, h);
    },
    frame(ctx, rect, color, width) {
      const [x, y, w, h] = rect;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
    },
    /** square-cornered caption block, cell-aligned feel: ink box, pale text, optional status dot */
    tag(ctx, text, x, y, o = {}) {
      const size = o.size ?? 30;
      ctx.font = `${o.weight ?? 600} ${size}px ${o.family ?? 'Geist'}`;
      ctx.textBaseline = 'middle';
      const padX = o.padX ?? 22;
      const dot = o.dot ? size * 0.42 : 0;
      const tw = ctx.measureText(text).width;
      const w = tw + padX * 2 + (dot ? dot + 14 : 0);
      const h = o.h ?? 60;
      const bx = o.align === 'right' ? x - w : x;
      ctx.fillStyle = o.bg ?? '#0e0f13';
      ctx.fillRect(bx, y, w, h);
      let tx = bx + padX;
      if (dot) {
        ctx.fillStyle = o.dot;
        ctx.beginPath();
        ctx.arc(tx + dot / 2, y + h / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
        tx += dot + 14;
      }
      ctx.fillStyle = o.color ?? '#eceef2';
      ctx.fillText(text, tx, y + h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
      return w;
    },
  };
})();
