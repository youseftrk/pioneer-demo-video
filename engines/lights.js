/* AI Lights (Arlan vault) — one body that becomes different agent surfaces, lit by a one-shot pulse of
   rainbow light running around its rim. Rebuilt on canvas for a seek-driven render; the mechanics are the
   card's: five glow layers, each a conic-OPACITY stroke on the body's own rounded rect, blurred and used
   as a mask (fifth layer: fill with a 1px hole = the border), drawn twice with the copy mirrored, under the
   face; the colour conic swings its start angle backwards while its stops push outward as it fades.
   Three beats never overlap: the light pulses, contents fade out, the empty body morphs (380 ms ease-out,
   real radii, glow hidden), then the new contents rise in per character. The gap between pulses is
   derived from those beats. Palettes roll per pulse from a seeded hash instead of Math.random. */
(function () {
  const PE = window.PE;
  const PULSE = 1.6;
  const HANDOVER = PULSE + 0.12;
  const FADE = 0.16;
  const MORPH = 0.38;
  const SETTLED = 0.26;
  const PERIOD = HANDOVER + FADE + MORPH + 0.08 + SETTLED;
  const RIM_STOPS = [['#000', 54], ['rgba(0,0,0,0)', 126], ['rgba(0,0,0,0)', 333], ['rgba(0,0,0,0.10)', 347], ['#000', 360]];
  const RIM_LAYERS = [
    { sw: 0, blur: 0, alpha: 1, ring: 1 },
    { sw: 4, blur: 4, alpha: 0.3 },
    { sw: 8, blur: 8, alpha: 0.2 },
    { sw: 16, blur: 12, alpha: 0.1 },
    { sw: 20, blur: 20, alpha: 0.32 },
  ];
  const T = { surface2: '#fafafa', border1: '#dedede', primary: '#171717', body: '#3d3d3d', muted: '#6b6b6b', subtle: '#9a9a9a', inverse: '#ffffff', dark: '#1e1e1e' };
  const glowEase = (t) => PE.bezier(t, 0.26, 0.94, 0.6, 1);
  const morphEase = (t) => PE.bezier(t, 0.22, 1, 0.36, 1);
  const riseEase = (t) => PE.bezier(t, 0.66, 0, 0.34, 1);
  const easeOut = (t) => PE.bezier(t, 0, 0, 0.58, 1);
  const cssEase = (t) => PE.bezier(t, 0.25, 0.1, 0.25, 1);

  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const DEFAULT = {
    c: [[0, 91, 246, 1], [176, 198, 233, 1], [254, 202, 0, 1], [255, 28, 17, 1], [255, 0, 234, 1], [255, 162, 251, 0.8]],
    tail: [149, 193, 255, 0.63],
    bg: [[247, 249, 252], [238, 244, 251], [230, 240, 250]],
  };
  /** the card's rollPalette, from a seeded hash per pulse */
  function palette(c) {
    if (c < 0) return DEFAULT;
    const r = (salt) => PE.hash(c + 1, salt) / 4294967296;
    const anchor = r(101) * 360;
    const arc = (90 + r(202) * 100) * (r(303) < 0.5 ? -1 : 1);
    const at = (t) => anchor + arc * t;
    return {
      c: [[...hslRgb(at(0), 96, 48), 1], [...hslRgb(at(0.18), 52, 80), 1], [...hslRgb(at(0.4), 98, 55), 1], [...hslRgb(at(0.66), 96, 52), 1], [...hslRgb(at(0.88), 94, 50), 1], [...hslRgb(at(1), 90, 72), 0.8]],
      tail: [...hslRgb(at(-0.12), 70, 76), 0.63],
      bg: [hslRgb(at(0), 62, 97), hslRgb(at(0.5), 54, 95), hslRgb(at(1), 58, 93)],
    };
  }
  const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  class Lights {
    /** o.variants: [{ kind: 'block'|'progress'|'terminal'|'wand', radius, pad:[t,r,b,l], cw, ch, dark, ...content }] */
    constructor(canvas, o) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.S = o.scale ?? 2.4;
      this.family = o.family ?? 'Geist';
      this.mono = o.mono ?? 'Fragment Mono';
      this.variants = o.variants;
      this.masks = new Map();
      this.tmp = PE.canvas(8, 8);
    }

    box(v) {
      const [t, r, b, l] = v.pad;
      return { w: v.cw + l + r + 2, h: v.ch + t + b + 2, r: v.radius };
    }

    mask(w, h, r, L) {
      const key = `${Math.round(w)}|${Math.round(h)}|${Math.round(r)}|${L.sw}|${L.blur}`;
      const hit = this.masks.get(key);
      if (hit) return hit;
      const S = this.S;
      const sw = L.sw * S;
      const blur = L.blur * S;
      const ring = (L.ring ?? 0) * S;
      const pad = Math.ceil(sw + blur * 3);
      const cw = Math.ceil(w) + pad * 2;
      const ch = Math.ceil(h) + pad * 2;
      const c = PE.canvas(cw, ch);
      const g = c.getContext('2d');
      if (blur) g.filter = `blur(${blur}px)`;
      const grad = g.createConicGradient(0, cw / 2, ch / 2);
      for (const [col, deg] of RIM_STOPS) grad.addColorStop(deg / 360, col);
      g.strokeStyle = grad;
      g.fillStyle = grad;
      g.globalAlpha = L.alpha;
      const x = (cw - w) / 2;
      const y = (ch - h) / 2;
      g.beginPath();
      g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
      if (sw) {
        g.lineWidth = sw;
        g.stroke();
      } else {
        g.fill();
        if (ring) {
          g.globalCompositeOperation = 'destination-out';
          g.globalAlpha = 1;
          g.filter = 'none';
          g.beginPath();
          g.roundRect(x + ring, y + ring, w - ring * 2, h - ring * 2, Math.max(0, Math.min(r - ring, (w - ring * 2) / 2, (h - ring * 2) / 2)));
          g.fill();
          g.globalCompositeOperation = 'source-over';
        }
      }
      const out = { c, pad };
      this.masks.set(key, out);
      return out;
    }

    /** one pulse: opacity 0→1 by 10%, held to 30%, back to 0; angles swing during the fade */
    pulse(u) {
      if (u < 0 || u >= PULSE) return null;
      const p = u / PULSE;
      let op;
      if (p < 0.1) op = glowEase(p / 0.1);
      else if (p < 0.3) op = 1;
      else op = 1 - glowEase((p - 0.3) / 0.7);
      const k = p < 0.3 ? 0 : glowEase((p - 0.3) / 0.7);
      const lerp = (a, b) => a + (b - a) * k;
      return { op, start: lerp(180, 30), stops: [lerp(16, 6), lerp(30, 11), lerp(43, 17), lerp(59, 40), lerp(72, 90), lerp(84, 120)] };
    }

    drawGlow(ctx, bx, by, bw, bh, r, g, pal) {
      const cx = bx + bw / 2;
      for (const L of RIM_LAYERS) {
        const m = this.mask(bw, bh, r, L);
        const tw = m.c.width;
        const th = m.c.height;
        if (this.tmp.width !== tw || this.tmp.height !== th) {
          this.tmp.width = tw;
          this.tmp.height = th;
        }
        const tg = this.tmp.getContext('2d');
        tg.setTransform(1, 0, 0, 1, 0, 0);
        tg.globalCompositeOperation = 'source-over';
        tg.clearRect(0, 0, tw, th);
        const grad = tg.createConicGradient(((g.start - 90) * Math.PI) / 180, tw / 2, th / 2);
        const c = pal.c;
        grad.addColorStop(0, rgba(c[0], c[0][3]));
        grad.addColorStop(g.stops[0] / 360, rgba(c[1], c[1][3]));
        grad.addColorStop(g.stops[1] / 360, rgba(c[2], c[2][3]));
        grad.addColorStop(g.stops[2] / 360, rgba(c[3], c[3][3]));
        grad.addColorStop(g.stops[3] / 360, rgba(c[4], c[4][3]));
        grad.addColorStop(g.stops[4] / 360, rgba(c[5], c[5][3]));
        grad.addColorStop(g.stops[5] / 360, rgba(c[5], 0));
        grad.addColorStop(324 / 360, rgba(pal.tail, 0));
        grad.addColorStop(349 / 360, rgba(pal.tail, pal.tail[3]));
        grad.addColorStop(1, rgba(c[0], c[0][3]));
        tg.fillStyle = grad;
        tg.fillRect(0, 0, tw, th);
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(m.c, 0, 0);
        tg.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = g.op;
        ctx.drawImage(this.tmp, bx - m.pad, by - m.pad);
        ctx.save();
        ctx.translate(cx * 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.tmp, bx - m.pad, by - m.pad);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    rising(ctx, text, x, y, size, color, weight, family, t, delay, alpha) {
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.fillStyle = color;
      let pen = x;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const w = ch === ' ' ? 0.28 * size : ctx.measureText(ch).width;
        const p = PE.clamp((t - delay - i * 0.02) / 0.3, 0, 1);
        if (p > 0 && ch !== ' ') {
          const e = riseEase(p);
          const blur = 2 * (1 - e) * this.S;
          ctx.globalAlpha = alpha * e;
          ctx.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : 'none';
          ctx.fillText(ch, pen, y + 16 * (1 - e));
        }
        pen += w;
      }
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }

    fade(t, delay) {
      return cssEase(PE.clamp((t - delay) / 0.3, 0, 1));
    }

    content(ctx, v, x, y, t, a) {
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (v.kind === 'block') {
        const cw = v.cw;
        const stepW = cw / v.steps.length;
        ctx.globalAlpha = a * this.fade(t, 0.06);
        ctx.fillStyle = T.border1;
        ctx.fillRect(x + stepW / 2, y + 7, cw - stepW, 1);
        v.steps.forEach((st, i) => {
          const cx = x + stepW * (i + 0.5);
          const d = 0.1 + i * 0.07;
          ctx.globalAlpha = a * this.fade(t, d);
          ctx.beginPath();
          ctx.roundRect(cx - 6, y + 1, 12, 12, 4);
          if (st.state === 'next') {
            ctx.fillStyle = T.surface2;
            ctx.fill();
            ctx.strokeStyle = T.border1;
            ctx.lineWidth = 1;
            ctx.stroke();
          } else {
            ctx.fillStyle = st.state === 'done' ? T.subtle : T.primary;
            ctx.fill();
          }
          if (st.state === 'live') {
            const ph = (Math.max(0, t) % 1.8) / 1.8;
            const s = 1 + 0.55 * easeOut(ph);
            ctx.globalAlpha = a * this.fade(t, d) * (1 - ph) * 0.9;
            ctx.strokeStyle = T.primary;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cx - 10 * s, y + 7 - 10 * s, 20 * s, 20 * s, 6 * s);
            ctx.stroke();
          }
          ctx.globalAlpha = a * this.fade(t, d + 0.06);
          ctx.font = `400 14px ${this.family}`;
          ctx.fillStyle = st.state === 'next' ? T.subtle : T.body;
          ctx.textAlign = 'center';
          ctx.fillText(st.label, cx, y + 33);
          ctx.textAlign = 'left';
        });
        ctx.globalAlpha = 1;
      } else if (v.kind === 'progress') {
        this.rising(ctx, v.text, x, y + 12.5, 16, T.body, 400, this.family, t, 0, a);
        const sx = x + v.cw - 7;
        const sy = y + 8;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2;
        ctx.strokeStyle = T.border1;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.stroke();
        const rot = (Math.max(0, t) / 0.9) * Math.PI * 2;
        ctx.strokeStyle = T.body;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(sx, sy, 6, -Math.PI / 2 + rot, rot);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = a * this.fade(t, 0.12);
        ctx.font = `400 13px ${this.family}`;
        ctx.fillStyle = T.subtle;
        ctx.textAlign = 'right';
        ctx.fillText(v.trail, x + v.cw - 20, y + 12.5);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      } else if (v.kind === 'terminal') {
        ctx.globalAlpha = a;
        ctx.font = `400 14px ${this.mono}`;
        ctx.fillStyle = '#5f5f5f';
        ctx.fillText('$', x, y + 11);
        const dw = ctx.measureText('$ ').width;
        ctx.fillStyle = '#8c8c8c';
        ctx.fillText(v.cmd, x + dw, y + 11);
        ctx.globalAlpha = 1;
        this.rising(ctx, v.out, x, y + 33, 14, '#d6d6d6', 400, this.mono, t, 0.06, a);
      } else if (v.kind === 'wand') {
        this.rising(ctx, v.text, x, y + 21.5, 16, T.muted, 400, this.family, t, 0, a);
        const bx = x + v.cw - 32;
        ctx.globalAlpha = a;
        ctx.fillStyle = T.primary;
        ctx.beginPath();
        ctx.roundRect(bx, y, 32, 32, 9);
        ctx.fill();
        ctx.save();
        ctx.translate(bx + 8, y + 8);
        ctx.scale(16 / 12, 16 / 12);
        ctx.strokeStyle = T.inverse;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(6, 9.5);
        ctx.lineTo(6, 2.5);
        ctx.moveTo(3, 5.5);
        ctx.lineTo(6, 2.5);
        ctx.lineTo(9, 5.5);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    renderAt(lt) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const S = this.S;
      const n = this.variants.length;
      const t = Math.max(0, lt);
      const c = Math.floor(t / PERIOD);
      const u = t - c * PERIOD;
      const hand = c + 1 < n;
      let slot = Math.min(c, n - 1);
      let alpha = 1;
      let morph = null;
      let mount = slot === 0 ? 0.05 : (slot - 1) * PERIOD + HANDOVER + FADE + MORPH;
      if (hand && u >= HANDOVER) {
        if (u < HANDOVER + FADE) alpha = 1 - easeOut((u - HANDOVER) / FADE);
        else if (u < HANDOVER + FADE + MORPH) {
          morph = { from: c, to: c + 1, k: morphEase((u - HANDOVER - FADE) / MORPH) };
          alpha = 0;
        } else {
          slot = c + 1;
          mount = c * PERIOD + HANDOVER + FADE + MORPH;
        }
      }

      const pal = palette(c);
      const prevPal = palette(c - 1);
      const bgK = easeOut(Math.min(1, u / 1.2));
      const bg = pal.bg.map((col, i) => mixRgb(prevPal.bg[i], col, bgK));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      const field = ctx.createLinearGradient(0, 0, 0, H);
      field.addColorStop(0, rgba(bg[0]));
      field.addColorStop(0.55, rgba(bg[1]));
      field.addColorStop(1, rgba(bg[2]));
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, W, H);

      let b;
      let faceCol;
      if (morph) {
        const A = this.box(this.variants[morph.from]);
        const B = this.box(this.variants[morph.to]);
        b = { w: PE.lerp(A.w, B.w, morph.k), h: PE.lerp(A.h, B.h, morph.k), r: PE.lerp(A.r, B.r, morph.k) };
        faceCol = PE.mix(this.variants[morph.from].dark ? T.dark : T.surface2, this.variants[morph.to].dark ? T.dark : T.surface2, morph.k);
      } else {
        b = this.box(this.variants[slot]);
        faceCol = this.variants[slot].dark ? T.dark : T.surface2;
      }
      const bw = b.w * S;
      const bh = b.h * S;
      const br = Math.min(b.r, b.w / 2, b.h / 2) * S;
      const bx = Math.round(W / 2 - bw / 2);
      const by = Math.round(H / 2 - bh / 2);

      ctx.save();
      ctx.fillStyle = T.border1;
      ctx.shadowColor = 'rgba(12,38,77,0.08)';
      ctx.shadowBlur = 24 * S;
      ctx.shadowOffsetY = 8 * S;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, br);
      ctx.fill();
      ctx.shadowColor = 'rgba(12,38,77,0.06)';
      ctx.shadowBlur = 2 * S;
      ctx.shadowOffsetY = 1 * S;
      ctx.fill();
      ctx.restore();

      const g = morph ? null : this.pulse(u);
      if (g && g.op > 0.002) this.drawGlow(ctx, bx, by, bw, bh, br, g, pal);

      ctx.fillStyle = faceCol;
      ctx.beginPath();
      ctx.roundRect(bx + S, by + S, bw - 2 * S, bh - 2 * S, Math.max(0, br - S));
      ctx.fill();

      if (!morph && alpha > 0.001) {
        const v = this.variants[slot];
        const [pt, , , pl] = v.pad;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bx + S, by + S, bw - 2 * S, bh - 2 * S, Math.max(0, br - S));
        ctx.clip();
        ctx.setTransform(S, 0, 0, S, bx, by);
        this.content(ctx, v, 1 + pl, 1 + pt, t - mount, alpha);
        ctx.restore();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  Lights.PERIOD = PERIOD;
  Lights.PULSE = PULSE;
  Lights.HANDOVER = HANDOVER;
  Lights.MOUNT = HANDOVER + FADE + MORPH;
  PE.Lights = Lights;
})();
