// Renders bencho.dev sounds (their Web Audio table + synth routine, no audio files exist upstream)
// to WAV with Chrome's OfflineAudioContext, so the video uses the exact same sounds.
// Usage: node tools/sfx.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// subset of bencho.dev/sounds (same values as the Pioneer app's src/lib/sound.ts)
const SOUNDS = {
  whisk: [{ hz: 124, to: 65, ms: 130, gain: 0.067, wave: 'sine', cut: 560, atk: 50 }],
  press: [{ hz: 168, ms: 95, gain: 0.028, wave: 'sine', cut: 480, atk: 14 }],
  deny: [{ hz: 208, to: 165, ms: 120, gain: 0.03, wave: 'sine', cut: 520, atk: 10 }],
  latch: [{ hz: 256, ms: 90, gain: 0.058, wave: 'square', cut: 2400, atk: 10 }],
  check: [{ hz: 370, ms: 90, gain: 0.055, wave: 'square', cut: 2400, atk: 10 }],
  pick: [{ hz: 245, ms: 41, gain: 0.044, wave: 'square', cut: 2400, atk: 6 }],
  pop: [{ hz: 680, to: 930, ms: 34, gain: 0.05, wave: 'sine', atk: 3 }],
  pin: [{ hz: 329, ms: 37, gain: 0.059, wave: 'triangle', cut: 1100, atk: 6 }],
  tock: [{ hz: 250, ms: 28, gain: 0.045, wave: 'triangle', cut: 1700, atk: 10 }],
  notch: [{ hz: 230, ms: 49, gain: 0.048, wave: 'sine', cut: 820, atk: 6 }],
  chime: [{ hz: 220, ms: 271, gain: 0.046, wave: 'sine', cut: 820, atk: 90 }],
  bell: [{ hz: 366, ms: 319, gain: 0.041, wave: 'sine', cut: 560, atk: 90 }],
  rise: [{ hz: 394, to: 612, ms: 360, gain: 0.057, wave: 'triangle', cut: 1700, atk: 13 }],
  boot: [{ hz: 291, ms: 360, gain: 0.043, wave: 'sine', cut: 560, atk: 90 }],
  swoop: [{ hz: 214, to: 124, ms: 241, gain: 0.065, wave: 'sine', cut: 560, atk: 90 }],
  glide: [{ hz: 397, to: 276, ms: 205, gain: 0.065, wave: 'sine', cut: 820, atk: 90 }],
  land: [{ hz: 262, to: 247, ms: 320, gain: 0.036, wave: 'sine', cut: 920, atk: 30 }],
  slide: [{ hz: 309, ms: 325, gain: 0.054, wave: 'sine', cut: 820, atk: 48 }],
  expand: [
    { hz: 196, to: 174, ms: 360, gain: 0.042, wave: 'sine', cut: 880, atk: 36 },
    { hz: 294, to: 262, ms: 300, at: 24, gain: 0.014, wave: 'sine', cut: 1100, atk: 48 },
  ],
  knock: [{ hz: 330, ms: 32, gain: 0.046, wave: 'triangle', cut: 1100, atk: 7 }],
  step: [{ hz: 227, to: 114, ms: 311, gain: 0.051, wave: 'sine', cut: 820, atk: 90 }],
};

// what the video needs: [file name, sound, pitch]; the agent chain climbs like bencho's `level` option
const JOBS = [
  ...Object.keys(SOUNDS).map((n) => [n, n, 1]),
  ...[0, 1, 2, 3, 4, 5].map((i) => [`pick-${i + 1}`, 'pick', 0.75 + (i / 5) * 0.75]),
  ...[0, 1, 2].map((i) => [`check-${i + 1}`, 'check', 0.9 + i * 0.18]),
];

const page = `(async () => {
  const SOUNDS = ${JSON.stringify(SOUNDS)};
  const JOBS = ${JSON.stringify(JOBS)};
  const RATE = 48000;
  function synth(a, parts, pitch) {
    for (const p of parts) {
      const start = 0.01 + (p.at ?? 0) / 1e3;
      const end = start + p.ms / 1e3;
      const osc = a.createOscillator();
      osc.type = p.wave ?? 'sine';
      osc.frequency.setValueAtTime(p.hz * pitch, start);
      if (p.to) osc.frequency.exponentialRampToValueAtTime(p.to * pitch, end);
      const g = a.createGain();
      const attack = Math.min((p.atk ?? 4) / 1e3, (p.ms / 1e3) * 0.6);
      g.gain.setValueAtTime(1e-4, start);
      g.gain.exponentialRampToValueAtTime(p.gain ?? 0.05, start + attack);
      g.gain.exponentialRampToValueAtTime(1e-4, end);
      let node = osc;
      if (p.cut) {
        const f = a.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = p.cut;
        osc.connect(f);
        node = f;
      }
      node.connect(g).connect(a.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
  function wav(buf) {
    // normalise to a -6 dBFS peak so the mix can set levels with data-volume
    const ch = [buf.getChannelData(0)];
    let peak = 1e-6;
    for (const d of ch) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const k = 0.5 / peak;
    const n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, RATE, true); out.setUint32(28, RATE * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    w(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, ch[0][i] * k)) * 32767;
      out.setInt16(44 + i * 4, v, true);
      out.setInt16(46 + i * 4, v, true);
    }
    let s = '';
    const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const res = {};
  for (const [file, name, pitch] of JOBS) {
    const parts = SOUNDS[name];
    const len = Math.max(...parts.map((p) => ((p.at ?? 0) + p.ms) / 1e3)) + 0.12;
    const a = new OfflineAudioContext(1, Math.ceil(len * RATE), RATE);
    synth(a, parts, pitch);
    res[file] = wav(await a.startRendering());
  }
  return JSON.stringify(res);
})()`;

const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'bencho-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
    if (!target) await sleep(200);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const result = await new Promise((resolve) => {
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) resolve(m.result);
    });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: page, awaitPromise: true, returnByValue: true } }));
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 400));
  const files = JSON.parse(result.result.value);
  fs.mkdirSync('assets/sfx', { recursive: true });
  for (const [name, b64] of Object.entries(files)) fs.writeFileSync(`assets/sfx/${name}.wav`, Buffer.from(b64, 'base64'));
  console.log(`rendered ${Object.keys(files).length} bencho sounds into assets/sfx`);
  ws.close();
} finally {
  chrome.kill();
}
