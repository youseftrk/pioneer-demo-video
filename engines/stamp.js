/* StampType (Arlan vault) — four lines on flat highlight bars hop in along breakpoint tracks, park, then
   scatter, stamping their silhouette (rounded bar unioned with fat-stroked glyphs) wherever they just were.
   Stamps live sixteen 20 fps ticks and vanish all at once; they are recomputed from the tracks every frame.
   Ported to a seek-driven renderer: passes are laid end to end (no wrap) and each pass may park for its
   own length so a world stays still for its line of narration. The next pass still starts twelve ticks
   before the last ends, so the colour flood between worlds is the overlap itself; the field cuts hard. */
(function () {
  const PE = window.PE;
  const TICK_S = 0.05;
  const STEP = 2;
  const STAMP_TTL = 16;
  const PARK_IN = 28;
  const PARK_OUT = 76;
  const PASS_END = 93;
  const PASS_OVERLAP = 12;
  const FIELD_SWAP = 5;
  const REF = 600;
  const HEADLINE = 71 / 600;
  const BAR_PAD_X = 10 / 600;
  const BAR_PAD_TOP = 11 / 600;
  const BAR_PAD_BOTTOM = 8 / 600;
  const BAR_RADIUS = 11 / 600;
  const BAR_STROKE = 16 / 600;
  const LINE_RIGHT_MARGIN = 24 / 600;
  const CONDENSE_MIN = 0.72;
  const TRACKS = [
    [[1, 181, -100], [3, 181, 11], [6, 165, 16], [7, 128, 16], [10, 110, 16], [11, 72, 16], [13, 69, 38], [15, 70, 90], [16, 70, 94], [17, 97, 94], [19, 165, 94], [20, 170, 94], [21, 154, 94], [23, 117, 94], [24, 114, 94], [25, 114, 115], [27, 114, 168], [28, 114, 172], [76, 114, 172], [77, 114, 142], [79, 114, 66], [82, 96, 61], [84, 47, 61], [86, 108, 61], [88, 195, 61], [91, 195, -120]],
    [[12, -540, 273], [15, 16, 273], [18, 20, 267], [20, 20, 251], [22, 29, 251], [24, 53, 251], [28, 53, 240], [76, 53, 240], [80, 31, 240], [82, 31, 225], [84, 31, 184], [86, 0, 184], [88, 37, 264], [90, 76, 264], [93, -560, 264]],
    [[8, 640, 375], [11, 97, 375], [14, 90, 365], [15, 90, 343], [18, 85, 341], [19, 72, 341], [22, 71, 332], [24, 71, 308], [28, 49, 308], [76, 49, 308], [80, 49, 297], [84, 49, 319], [87, 49, 266], [88, 49, 264], [90, 88, 263], [93, 660, 263]],
    [[4, 620, 498], [7, 118, 498], [8, 104, 498], [12, 104, 487], [13, 77, 487], [15, 9, 487], [16, 4, 487], [17, 4, 469], [19, 4, 424], [22, 20, 420], [23, 58, 420], [26, 61, 408], [28, 61, 376], [76, 61, 376], [80, 31, 376], [83, 84, 376], [85, 63, 376], [87, 4, 376], [90, 0, 376], [93, -540, 376]],
  ];

  function posAt(track, f) {
    if (f < track[0][0] || f > track[track.length - 1][0]) return null;
    for (let i = 1; i < track.length; i++) {
      if (f <= track[i][0]) {
        const [f0, x0, y0] = track[i - 1];
        const [f1, x1, y1] = track[i];
        const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
      }
    }
    return null;
  }
  const PARKED_X = TRACKS.map((t) => posAt(t, PARK_IN)?.[0] ?? 0);

  class StampType {
    /** o.worlds: [{ bg, bar, ink, lines[4], park? (ticks, default 48) }] */
    constructor(canvas, o) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.family = o.family;
      this.worlds = o.worlds;
      this.metrics = new Map();
      this.parks = this.worlds.map((w) => w.park ?? PARK_OUT - PARK_IN);
      this.passFrames = this.parks.map((pf) => PASS_END + pf - (PARK_OUT - PARK_IN));
      this.starts = [0];
      for (let p = 1; p < this.worlds.length; p++) this.starts.push(this.starts[p - 1] + this.passFrames[p - 1] - PASS_OVERLAP);
      this.lines = this.worlds.map((w) => w.lines.map((text, i) => ({ text, track: i })));
    }

    toTrack(p, f) {
      const pf = this.parks[p];
      if (f <= PARK_IN) return f;
      if (f >= PARK_IN + pf) return f - (pf - (PARK_OUT - PARK_IN));
      return PARK_IN;
    }

    measure(ctx, text, size, room) {
      const key = `${size}|${room}|${text}`;
      const got = this.metrics.get(key);
      if (got) return got;
      ctx.font = `600 ${size * REF}px ${this.family}`;
      const m = ctx.measureText(text);
      const raw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const sx = raw > room ? Math.max(CONDENSE_MIN, room / raw) : 1;
      const met = { dx: m.actualBoundingBoxLeft * sx, asc: m.actualBoundingBoxAscent, w: raw * sx, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, sx };
      this.metrics.set(key, met);
      return met;
    }

    lineMetrics(ctx, line) {
      return this.measure(ctx, line.text, HEADLINE, REF - PARKED_X[line.track] - LINE_RIGHT_MARGIN * REF);
    }

    place(p, line, f) {
      return posAt(TRACKS[line.track], this.toTrack(p, f));
    }

    text(ctx, str, x, y, m, stroke) {
      ctx.font = `600 ${HEADLINE * REF}px ${this.family}`;
      if (m.sx === 1) {
        if (stroke) ctx.strokeText(str, x, y);
        ctx.fillText(str, x, y);
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(m.sx, 1);
      if (stroke) ctx.strokeText(str, 0, 0);
      ctx.fillText(str, 0, 0);
      ctx.restore();
    }

    silhouette(ctx, line, x, y, color) {
      const m = this.lineMetrics(ctx, line);
      const padX = BAR_PAD_X * REF;
      const padT = BAR_PAD_TOP * REF;
      const padB = BAR_PAD_BOTTOM * REF;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - padX, y - padT, m.w + padX * 2, m.h + padT + padB, BAR_RADIUS * REF);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = BAR_STROKE * REF;
      ctx.lineJoin = 'round';
      this.text(ctx, line.text, x + m.dx, y + m.asc, m, true);
    }

    stamps(ctx, p, f) {
      const world = this.worlds[p];
      const step0 = Math.floor(f / STEP) * STEP;
      for (let s = step0; s > f - STAMP_TTL; s -= STEP) {
        if (s < STEP) break;
        for (const line of this.lines[p]) {
          const a = this.place(p, line, s - STEP);
          const b = this.place(p, line, s);
          if (!a || !b) continue;
          if (Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5) continue;
          this.silhouette(ctx, line, a[0], a[1], world.bar);
        }
      }
    }

    live(ctx, p, f) {
      const world = this.worlds[p];
      const placed = [];
      for (const line of this.lines[p]) {
        const pos = this.place(p, line, f);
        if (pos) placed.push([line, pos]);
      }
      for (const [line, pos] of placed) this.silhouette(ctx, line, pos[0], pos[1], world.bar);
      ctx.fillStyle = world.ink;
      for (const [line, pos] of placed) {
        const m = this.lineMetrics(ctx, line);
        this.text(ctx, line.text, pos[0] + m.dx, pos[1] + m.asc, m, false);
      }
    }

    /** lt = seconds since the segment began; ticks are held (20 fps), never smoothed */
    renderAt(lt) {
      const tick = Math.floor(lt / TICK_S + 1e-6);
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const k = H / REF;
      const ox = (W - H) / 2;
      const active = [];
      for (let p = 0; p < this.worlds.length; p++) {
        const f = tick - this.starts[p];
        if (f >= 0 && f <= this.passFrames[p]) active.push([p, f]);
      }
      let field = active.length ? active[0][0] : this.worlds.length - 1;
      for (const [p, f] of active) if (p === 0 || f >= FIELD_SWAP) field = p;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.worlds[field].bg;
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(k, 0, 0, k, ox, 0);
      ctx.textBaseline = 'alphabetic';
      for (const [p, f] of active) this.stamps(ctx, p, f);
      for (const [p, f] of active) this.live(ctx, p, f);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** seconds: when pass p starts, when its lines finish parking (readable), when it scatters, when it ends */
    timing(p) {
      const s = this.starts[p];
      return { start: s * TICK_S, parked: (s + PARK_IN) * TICK_S, scatter: (s + PARK_IN + this.parks[p]) * TICK_S, end: (s + this.passFrames[p]) * TICK_S };
    }
  }

  StampType.PARK_IN = PARK_IN;
  StampType.TICK_S = TICK_S;
  StampType.passFrames = (park) => PASS_END + park - (PARK_OUT - PARK_IN);
  StampType.OVERLAP = PASS_OVERLAP;
  PE.StampType = StampType;
})();
