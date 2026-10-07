/* Pioneer demo — shared helpers for the seek-driven canvas engines.
   Nothing here reads a clock: every frame is a pure function of the time HyperFrames seeks to. */
(function () {
  const PE = (window.PE = window.PE || {});
  PE.W = 1920;
  PE.H = 1080;
  PE.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  PE.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  PE.lerp = (a, b, t) => a + (b - a) * t;
  PE.rng = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
  PE.hash = (a, b) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  PE.bezier = (t, x1, y1, x2, y2) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const u = (lo + hi) / 2;
      const v = 1 - u;
      const x = 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u;
      if (x < t) lo = u;
      else hi = u;
    }
    const u = (lo + hi) / 2;
    const v = 1 - u;
    return 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u;
  };
  PE.rgb = (hex) => {
    const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  PE.mix = (a, b, t) => {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const pa = PE.rgb(a);
    const pb = PE.rgb(b);
    const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  /** piecewise-linear map through [x, y] knots (x increasing); clamps at both ends */
  PE.pw = (knots, x) => {
    if (x <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) {
      const [x1, y1] = knots[i];
      if (x <= x1) {
        const [x0, y0] = knots[i - 1];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return knots[knots.length - 1][1];
  };
})();
