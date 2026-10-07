/* FlipType (Arlan vault) — one bold word that keeps becoming the next word of four, every letter on its
   own cubic-bezier(1, 0, 0, 1) hop between three rows, flipping through stranger glyphs on the way.
   Ported to a seek-driven renderer. The card shipped hand-authored per-letter tables for its own four
   words; here the same rules generate them for any words at mount (seeded, so every render is identical):
   centres form a V from the middle letter outward (2-3 frames a letter with jitter), spans of 35-46 frames,
   words 1-3 leave as they land, word 0 rests across the loop wrap, flips one character per frame, never
   wider than the slot. Pens come from the face's own advances and kerning; kerning is off when drawing. */
(function () {
  const PE = window.PE;
  const FRAMES = 176;
  const SCENE_W = 1080;
  const SCENE_H = 810;
  const FONT_SIZE = 197.2;
  const ROW = [203, 470, 735, 469];
  const BREATH = { px: 3, frames: 8 };
  const BOUNCE = { px: 5, tau: 3.2, period: 9 };
  const REST = 100;
  const BASE = [20, 60, 96, 136];
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const UPPER = LOWER.toUpperCase();

  const letterScale = (slot, word) => 0.75 + ((slot * 5 + word * 3) % 7) / 12;
  const breath = (t, s) => (t <= 0 || t >= BREATH.frames ? 0 : -BREATH.px * s * Math.sin((Math.PI * t) / BREATH.frames));
  const bounce = (t, s) => (t <= 0 ? 0 : BOUNCE.px * s * Math.exp(-t / BOUNCE.tau) * Math.sin((2 * Math.PI * t) / BOUNCE.period));
  const bez = (s) => {
    const c = Math.min(Math.max(s, 0), 1);
    const t = 0.5 + Math.cbrt((c - 0.5) / 4);
    return 3 * t * t - 2 * t * t * t;
  };
  const half2 = (x) => Math.round(x * 2) / 2;

  class FlipType {
    /** o: { family, weight, words[4], ground, ink, seed, tag: [{ text, size, weight, y, color, start, stagger }] } */
    constructor(canvas, o) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.family = o.family;
      this.weight = o.weight ?? 600;
      this.words = o.words;
      this.ground = o.ground;
      this.ink = o.ink;
      this.seed = o.seed ?? 7;
      this.tag = o.tag ?? [];
      this.build();
    }

    build() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `${this.weight} ${FONT_SIZE}px ${this.family}`;
      ctx.fontKerning = 'normal';
      const W = (s) => (s ? ctx.measureText(s).width : 0);
      this.pens = [];
      this.adv = [];
      for (const word of this.words) {
        const m = ctx.measureText(word);
        const x0 = SCENE_W / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
        this.pens.push([...word].map((ch, i) => x0 + W(word.slice(0, i + 1)) - W(ch)));
        this.adv.push([...word].map((ch) => W(ch)));
      }
      this.gw = new Map();
      for (const ch of LOWER + UPPER) this.gw.set(ch, W(ch));
      this.byWidth = {
        lower: [...LOWER].sort((a, b) => this.gw.get(a) - this.gw.get(b)),
        upper: [...UPPER].sort((a, b) => this.gw.get(a) - this.gw.get(b)),
      };
      for (const t of this.tag) {
        ctx.font = `${t.weight} ${t.size}px ${this.family}`;
        const total = W(t.text);
        const x0 = SCENE_W / 2 - total / 2;
        t.pens = [...t.text].map((ch, i) => x0 + W(t.text.slice(0, i + 1)) - W(ch));
      }
      this.letters = this.generate();
    }

    pick(rnd, own, slotW) {
      const upper = own !== own.toLowerCase();
      const set = upper ? UPPER : LOWER;
      let g = set[Math.floor(rnd() * 26)];
      if (g.toLowerCase() === own.toLowerCase()) g = set[(set.indexOf(g) + 1) % 26];
      if (this.gw.get(g) > slotW) {
        const sorted = upper ? this.byWidth.upper : this.byWidth.lower;
        let best = sorted[0];
        for (const c of sorted) if (this.gw.get(c) <= slotW && c.toLowerCase() !== own.toLowerCase()) best = c;
        g = best;
      }
      return g;
    }

    flips(rnd, own, slotW, glyphs) {
      let s = '';
      for (let k = 0; k < glyphs; k++) {
        if (rnd() < 0.12) s += '.';
        const hold = rnd() < 0.18 ? 1 : rnd() < 0.22 ? 3 : 2;
        s += this.pick(rnd, own, slotW).repeat(hold);
      }
      return s.slice(0, 7);
    }

    generate() {
      const rnd = PE.rng(this.seed);
      const words = this.words;
      const n = words.length;
      const maxLen = Math.max(...words.map((w) => w.length));
      const halfR = () => 17.5 + Math.floor(rnd() * 12) / 2;
      const C = BASE.slice(0, n).map((b, j) => {
        const m = Math.max(words[j].length, words[(j + 1) % n].length);
        const mid = (m - 1) / 2;
        return Array.from({ length: maxLen }, (_, i) => half2(b + Math.abs(i - mid) * (2 + rnd()) + (rnd() - 0.5) * 0.6));
      });
      const L = words.map((w) => [...w].map(() => ({})));
      for (let b = 0; b < n; b++) {
        const a = (b - 1 + n) % n;
        for (let i = 0; i < words[b].length; i++) {
          const x = L[b][i];
          const gained = i >= words[a].length;
          x.cIn = gained ? C[a][i] : half2(C[a][i] + (rnd() - 0.5));
          x.cOut = C[b][i];
          if (b === 0) {
            x.land = x.cIn + halfR();
            x.leave = x.cOut - halfR();
          } else {
            const S = x.cOut - x.cIn;
            let hIn = PE.clamp(half2(S / 2 + (rnd() - 0.5) * 3), 17.5, 23);
            let hOut = S - hIn;
            if (hOut < 17.5) {
              hOut = 17.5;
              hIn = PE.clamp(S - hOut, 17.5, 23);
            } else if (hOut > 23) {
              hOut = 23;
              hIn = PE.clamp(S - hOut, 17.5, 23);
            }
            x.land = x.cIn + hIn;
            x.leave = x.cOut - hOut;
          }
          x.show = Math.round(x.cIn - 2 + rnd() * 7);
          x.hide = Math.round(x.cOut - 2 + rnd() * 4);
          const own = words[b][i];
          const slotW = this.adv[b][i];
          if (gained || rnd() < 0.6) x.flipsIn = this.flips(rnd, own, slotW, 1 + Math.floor(rnd() * 3));
          if (rnd() < 0.45) {
            const len = 3 + Math.floor(rnd() * 6);
            x.flipAt = x.hide - len;
            x.flipsOut = this.flips(rnd, own, slotW, 2 + Math.floor(rnd() * 2));
          }
        }
      }
      return L;
    }

    lettersAt(frame) {
      const f = ((Math.floor(frame) % FRAMES) + FRAMES) % FRAMES;
      const words = this.words;
      const n = words.length;
      const out = [];
      for (let w = 0; w < n; w++) {
        const word = words[w];
        const prev = (w + n - 1) % n;
        const next = (w + 1) % n;
        for (let i = 0; i < word.length; i++) {
          const own = word[i];
          const L = this.letters[w][i];
          if (own === ' ' || !L) continue;
          const fin = w === 0 && f < REST ? f + FRAMES : f;
          const fx = w === 0 && f >= REST ? f - FRAMES : f;
          const shown = L.show === undefined || fin >= L.show;
          const gone = L.hide !== undefined && fx >= L.hide;
          const visible = w === 0 ? (L.show !== undefined && f >= L.show) || (L.hide !== undefined && f < L.hide) : shown && !gone;
          if (!visible) continue;
          let y = ROW[w];
          const scale = letterScale(i, w);
          if (L.cIn !== undefined && L.land !== undefined) {
            const half = L.land - L.cIn;
            const travel = ROW[w] - ROW[prev];
            y -= travel * (1 - bez((fin - (L.cIn - half)) / (2 * half)));
            y += Math.sign(travel) * bounce(fin - L.land, scale);
          }
          if (L.leave !== undefined && L.cOut !== undefined) {
            const half = L.cOut - L.leave;
            const travel = ROW[next] - ROW[w];
            y += travel * bez((fx - L.leave) / (2 * half));
            y += Math.sign(travel) * breath(fx - L.leave, scale);
          }
          let glyph = own;
          if (L.flipsIn && L.show !== undefined) {
            const k = fin - L.show;
            if (k >= 0 && k < L.flipsIn.length) glyph = L.flipsIn[k];
          }
          if (L.flipsOut && L.flipAt !== undefined) {
            const k = fx - L.flipAt;
            if (k >= 0) glyph = L.flipsOut[Math.min(k, L.flipsOut.length - 1)];
          }
          if (glyph === '.') continue;
          out.push({ glyph, x: this.pens[w][i], y });
        }
      }
      return out;
    }

    /** F = flip frame (held, integer); before 0 and from FRAMES on, word 0 holds at rest.
        tagF = the tagline's own 30 fps frame clock (negative = not yet) */
    render(F, tagF = -1) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.ground;
      ctx.fillRect(0, 0, W, H);
      const k = H / SCENE_H;
      ctx.setTransform(k, 0, 0, k, (W - SCENE_W * k) / 2, 0);
      ctx.fontKerning = 'none';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.font = `${this.weight} ${FONT_SIZE}px ${this.family}`;
      ctx.fillStyle = this.ink;
      const f = F < 0 || F >= FRAMES ? 0 : Math.floor(F);
      for (const g of this.lettersAt(f)) ctx.fillText(g.glyph, g.x, g.y);
      this.tag.forEach((t, li) => {
        ctx.font = `${t.weight} ${t.size}px ${this.family}`;
        ctx.fillStyle = t.color;
        const len = t.text.length;
        const mid = (len - 1) / 2;
        for (let i = 0; i < len; i++) {
          const ch = t.text[i];
          if (ch === ' ') continue;
          const kk = Math.floor(tagF) - (t.start + Math.round(Math.abs(i - mid) * t.stagger));
          if (kk < 0) continue;
          let g = ch;
          if (kk < 4 && /[a-zA-Z]/.test(ch)) {
            const h = PE.hash(i + 31 * li, Math.floor(kk / 2) + 7);
            g = LOWER[h % 26];
            if (ch !== ch.toLowerCase()) g = g.toUpperCase();
          }
          ctx.fillText(g, t.pens[i], t.y);
        }
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** the frame at which the last letter of word 0 lands (for timing the hand-off) */
    lastLanding() {
      return Math.max(...this.letters[0].map((x) => x.land));
    }
  }

  FlipType.FRAMES = FRAMES;
  FlipType.ROW = ROW;
  PE.FlipType = FlipType;
})();
