// Builds index.html: the Arlan-vault kinetic-type engines (engines/*.js), driven by HyperFrames' hf-seek,
// timed to the real Fish Audio voice-over (assets/vo/meta.json) and Bencho sound cues, pre-mixed to two tracks.
// Usage: node tools/durations.mjs && node tools/build.mjs
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const MODERN = 'tools/ffmpeg/ffmpeg-7.1.1-essentials_build/bin/ffmpeg.exe';
const FF = fs.existsSync(MODERN) ? MODERN : ffmpegInstaller.path;
const { scenes: lines } = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const vo = JSON.parse(fs.readFileSync('assets/vo/meta.json', 'utf8'));
const MARK = fs.readFileSync('../qoder-hackathon/src/components/ui/PioneerMark.tsx', 'utf8').match(/PIONEER_MARK_PATH =\s*"([^"]+)"/)[1];
const r3 = (x) => Math.round(x * 1000) / 1000;
const D = (id) => {
  if (!vo[id]) throw new Error(`no voice-over for ${id}; run npm run voice:fish first`);
  return vo[id].dur;
};
const say = (id) => lines.find((l) => l.id === id).vo.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** start times of spoken words inside a clip, from the silence gaps between them */
function wordStarts(id) {
  const r = spawnSync(FF, ['-hide_banner', '-i', vo[id].file, '-af', 'silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' });
  const ends = [...r.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]);
  const starts = [...r.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1]);
  const words = starts[0] > 0.05 ? [0.02] : [];
  for (const e of ends) if (e < D(id) - 0.1) words.push(e);
  return words;
}

/* conveyor pulse geometry (same tables as engines/conveyor.js) */
const RATE = 1.45;
const PULSE_DUR = [51 / 30, 50 / 30, 42 / 30];
const ROW0 = [36.7, 158.28, 266.4];
const ROW4 = [51.32, 172.52, 280.88];
const peak = (s) => (ROW4[s] - ROW0[s]) / 30 / RATE + (0.5 * PULSE_DUR[s]) / RATE;

/* ---------- beat sheet: every segment is timed from the real voice ---------- */
const voice = [];
const caps = [];
const sfx = [];
const segs = [];
let T = 0;
const speak = (id, at, cap = false) => {
  voice.push({ id, at: r3(at), file: vo[id].file });
  if (cap) caps.push({ id, at: r3(at), end: r3(at + D(id)), text: say(id) });
  return at + D(id);
};
const wavLen = (name) => +((fs.statSync(`assets/sfx/${name}.wav`).size - 44) / (48000 * 4)).toFixed(3);
const cue = (name, at, vol = 0.4) => sfx.push({ name, at: r3(at), vol, dur: wavLen(name) });
const seg = (id, len, cfg) => {
  segs.push({ id, start: r3(T), len: r3(len), ...cfg });
  T += len;
};

// 1 — WildType: "intelligence" types in, goes wild, collapses home, un-types (one 104-tick loop)
{
  const LOOP = 104 / 30;
  const len = Math.max(LOOP, 0.25 + D('01-hook') + 0.2);
  const s = T;
  speak('01-hook', s + 0.25);
  const k = len / LOOP;
  [[2, 'pick-2'], [6, 'pick-4'], [8, 'pick-6']].forEach(([tick, n]) => cue(n, s + (tick / 30) * k, 0.32));
  cue('swoop', s + (25 / 30) * k, 0.5);
  cue('whisk', s + (40 / 30) * k, 0.32);
  cue('land', s + (60 / 30) * k, 0.42);
  cue('slide', s + (89 / 30) * k, 0.3);
  seg('wild', len, { rate: LOOP / len });
}

// 2 — ShutterType: "Cities still break" tears in → the "under ground" stack scrolls down into the street → flood
{
  const s = T;
  const aEnd = speak('02a-break', s + 0.1);
  const tA = aEnd - s + 0.1;
  const bStart = s + tA + 0.08;
  const bEnd = speak('02b-under', bStart);
  const wb = wordStarts('02b-under');
  const tFlood = bStart - s + (wb.length ? wb[wb.length - 1] : D('02b-under') - 1.4) + 0.75;
  const len = bEnd - s + 0.4;
  const fmap = [[0, 0], [tA, 29], [Math.min(tFlood, len - 0.5), 54], [len, 67.99]];
  const at = (f) => {
    for (let i = 1; i < fmap.length; i++) if (f <= fmap[i][1]) return fmap[i - 1][0] + ((f - fmap[i - 1][1]) / (fmap[i][1] - fmap[i - 1][1])) * (fmap[i][0] - fmap[i - 1][0]);
    return len;
  };
  cue('knock', s + at(6), 0.5);
  cue('tock', s + at(13), 0.32);
  cue('whisk', s + tA, 0.38);
  cue('slide', s + at(33), 0.32);
  cue('slide', s + at(47), 0.32);
  cue('deny', s + at(54), 0.42);
  seg('shutter', len, { fmap });
}

// 3 — CheckerConveyor: flood → Pioneer → the real twin → the pipes → the leak → six agents
{
  const s = T;
  const pulses = [];
  const pulse = (at, shape, dir, rev = false) => {
    pulses.push({ at: r3(at - s), shape, dir, rev });
    cue('glide', at + peak(shape), 0.46);
  };
  pulse(s, 0, 'left');
  cue('boot', s + peak(0) + 0.1, 0.42);
  const e3 = speak('03-brand', s + 0.62);
  const p2 = Math.max(e3 + 0.15, s + 2.0);
  pulse(p2, 1, 'left');
  const e4a = speak('04a-twin', p2 + 0.45, true);
  const e4b = speak('04b-every', e4a + 0.2, true);
  const p3 = e4b + 0.05;
  pulse(p3, 2, 'split');
  const e4c = speak('04c-pipes', p3 + 0.4, true);
  const p4 = e4c + 0.15;
  pulse(p4, 0, 'left', true);
  cue('notch', p4 + peak(0) + 0.2, 0.42);
  const e5 = speak('05-spot', p4 + 0.45, true);
  const p5 = e5 + 0.1;
  pulse(p5, 1, 'right');
  const e6 = speak('06-agents', p5 + 0.5, true);
  seg('conv1', e6 - s + 0.3, { pulses });
}

// 4 — WarpType: six agents, each cut lands on the narrator saying its name
{
  const s = T;
  const vStart = s + 0.12;
  const end = speak('07-names', vStart);
  const w = wordStarts('07-names').slice(0, 6);
  while (w.length < 6) w.push(w[w.length - 1] + 0.8);
  const len = end - s + 0.45;
  const cuts = w.map((x) => vStart - s + x - 0.03);
  const kmap = [[0, 0], [cuts[1], 13], [cuts[2], 25], [cuts[3], 38], [cuts[4], 50], [cuts[5], 63], [len, 74.99]];
  cuts.forEach((c, k) => cue(`pick-${k + 1}`, s + Math.max(0, c), 0.42));
  seg('warp', len, { kmap });
}

// 5 — AI Lights: the agents at work (compare → close valves → reroute), one body morphing in the dark
{
  const s = T;
  const PERIOD = 1.72 + 0.16 + 0.38 + 0.08 + 0.26;
  speak('08-act', s + 0.3, true);
  const len = PERIOD + 2.26 + 1.75;
  for (let c = 0; c < 3; c++) cue('chime', s + c * PERIOD, 0.26);
  for (let c = 0; c < 2; c++) {
    cue('slide', s + c * PERIOD + 1.88, 0.26);
    cue('pop', s + c * PERIOD + 2.26, 0.3);
  }
  seg('lights', len, {});
}

/** StampType segment: two worlds, each parked for its own line of narration */
function stampSeg(id, idA, idB) {
  const s = T;
  const TICK = 0.05;
  const vA = s + 0.5;
  const eA = speak(idA, vA);
  const parkA = Math.max(48, Math.ceil((eA - s + 0.15 - 28 * TICK) / TICK));
  const startB = 93 + parkA - 48 - 12;
  const vB = Math.max(eA + 0.3, s + (startB + 16) * TICK);
  const eB = speak(idB, vB);
  const parkB = Math.max(48, Math.ceil((eB - s + 0.15 - (startB + 28) * TICK) / TICK));
  const len = (startB + 28 + parkB + 12) * TICK;
  [0, startB].forEach((st, p) => {
    cue('swoop', s + (st + 4) * TICK, 0.36);
    cue('latch', s + (st + 28) * TICK, 0.42);
    cue('whisk', s + (st + 28 + (p ? parkB : parkA)) * TICK, 0.3);
  });
  seg(id, len, { parks: [parkA, parkB] });
}

// 6 — StampType: you hold the limits / ask them why
stampSeg('stampA', '09a-limits', '09b-why');

// 7 — CheckerConveyor: the crew on real streets → fixed
{
  const s = T;
  const pulses = [];
  const pulse = (at, shape, dir, rev = false) => {
    pulses.push({ at: r3(at - s), shape, dir, rev });
    cue('glide', at + peak(shape), 0.46);
  };
  pulse(s, 1, 'right');
  const e10a = speak('10a-crew', s + 0.6, true);
  const p2 = e10a + 0.05;
  pulse(p2, 2, 'left', true);
  cue('check', p2 + peak(2) + 0.35, 0.36);
  const e10b = speak('10b-fixed', p2 + 0.45, true);
  seg('conv2', e10b - s + 0.45, { pulses });
}

// 8 — StampType: the outcome
stampSeg('stampB', '11a-people', '11b-saved');

// 9 — FlipType: Pioneer → Watches → Decides → Repairs → Pioneer
{
  const s = T;
  speak('12-cta', s + 0.2);
  const w = wordStarts('12-cta');
  const tStart = 0.2 + (w[1] ?? 1.0) - 0.25;
  const tLand = 0.2 + D('12-cta') + 0.3;
  cue('bell', s + tLand, 0.42);
  seg('flip', tLand + 0.5, { tStart: r3(tStart), tLand: r3(tLand) });
  [0.22, 0.45, 0.66, 0.86].forEach((p) => cue('pick', s + tStart + p * (tLand - tStart), 0.26));
}

// 10 — Logo showcase: the Pioneer SVG in liquid metal, then the tagline
{
  const s = T;
  cue('swoop', s + 0.02, 0.38);
  cue('chime', s + 1.0, 0.38);
  cue('land', s + 1.55, 0.28);
  seg('showcase', 4.6, {});
}

const TOTAL = r3(T);

/* ---------- audio: one voice track + one Bencho track, pre-mixed ---------- */
fs.mkdirSync('assets/mix', { recursive: true });
function mix(out, items, post = '') {
  const args = ['-y', '-v', 'error'];
  items.forEach((it) => args.push('-i', it.file));
  const chains = items.map((it, k) => `[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(it.at * 1000)}|${Math.round(it.at * 1000)},apad,volume=${it.vol}[a${k}]`);
  const filter = `${chains.join(';')};${items.map((_, k) => `[a${k}]`).join('')}amix=inputs=${items.length}:dropout_transition=0,volume=${items.length}${post ? `,${post}` : ''}`;
  args.push('-filter_complex', filter, '-t', String(TOTAL), '-ar', '48000', '-c:a', 'pcm_s16le', out);
  execFileSync(FF, args);
}
// voice: lift ~7 dB, gentle 2.5:1 compression, limiter at -1 dBFS so nothing clips
mix('assets/mix/voice.wav', voice.map((v) => ({ file: v.file, at: v.at, vol: 2.8 })), 'acompressor=threshold=0.1:ratio=2.5:attack=8:release=150:makeup=1.5,alimiter=limit=0.89:level=0');
mix('assets/mix/sfx.wav', sfx.map((c) => ({ file: `assets/sfx/${c.name}.wav`, at: c.at, vol: +(c.vol * 1.2).toFixed(3) })));

/* ---------- document ---------- */
const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ENGINES = ['core', 'wild', 'shutter', 'conveyor', 'warp', 'stamp', 'flip', 'lights', 'metal'].map((n) => `    <script src="engines/${n}.js"></script>`).join('\n');
const CONFIG = { total: TOTAL, mark: MARK, segs };
const segHtml = segs
  .map((s, i) => `      <canvas id="cv-${s.id}" class="clip seg" width="1920" height="1080" data-start="${s.start}" data-duration="${s.len}" data-track-index="${i + 1}" data-layout-allow-overflow style="z-index:${10 + i}"></canvas>`)
  .join('\n');
const capHtml = caps.map((c, i) => `      <div class="cap" id="cap-${i}"><span>${esc(c.text)}</span></div>`).join('\n');
const tl = caps
  .flatMap((c, i) => [
    `tl.fromTo("#cap-${i}", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.24, ease: "power2.out" }, ${c.at});`,
    `tl.to("#cap-${i}", { opacity: 0, duration: 0.18, ease: "power1.in" }, ${r3(c.end + 0.12)});`,
  ])
  .join('\n      ');

const doc = `<!doctype html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Pioneer — the city that fixes itself first</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Geist'; src: url('assets/fonts/geist.woff2') format('woff2'); font-weight: 100 900; }
      @font-face { font-family: 'Instrument Sans'; src: url('assets/fonts/instrument-sans.woff2') format('woff2'); font-weight: 400 700; }
      @font-face { font-family: 'Fragment Mono'; src: url('assets/fonts/fragment-mono.woff2') format('woff2'); font-weight: 400; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0e0f13; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; }
      .ground { position: absolute; inset: 0; background: #0e0f13; }
      .seg { position: absolute; left: 0; top: 0; display: block; width: 1920px; height: 1080px; }
      #assets { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
      #assets img { display: block; width: 1px; height: 1px; }
      .cap { position: absolute; left: 0; right: 0; bottom: 26px; display: flex; justify-content: center; opacity: 0; z-index: 50; }
      .cap span { display: block; max-width: 1560px; padding: 12px 28px; background: rgba(236, 238, 242, 0.95); color: #0e0f13; font-size: 32px; font-weight: 500; line-height: 1.28; letter-spacing: -0.005em; text-align: center; box-shadow: 0 0 0 3px #0e0f13; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${TOTAL}">
      <div class="ground"></div>
      <div id="assets" aria-hidden="true">
        <img id="img-city" src="assets/shots/city.jpg" alt="" />
        <img id="img-valves" src="assets/shots/valves.jpg" alt="" />
        <img id="img-leak" src="assets/shots/leak.jpg" alt="" />
        <img id="img-drive" src="assets/shots/drive.jpg" alt="" />
        <img id="img-fixed" src="assets/shots/fixed.jpg" alt="" />
        <img id="img-logo" src="assets/brand/pioneer-logo.svg" alt="" />
      </div>
${segHtml}
${capHtml}
      <audio id="voice-mix" src="assets/mix/voice.wav" data-start="0" data-duration="${TOTAL}" data-track-index="20" data-volume="1"></audio>
      <audio id="sfx-mix" src="assets/mix/sfx.wav" data-start="0" data-duration="${TOTAL}" data-track-index="21" data-volume="0.9"></audio>
    </div>
${ENGINES}
    <script type="application/json" id="pioneer-config">${JSON.stringify(CONFIG)}</script>
    <script src="engines/runtime.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${tl}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
fs.writeFileSync('index.html', doc);
console.log(`index.html: ${segs.length} segments, ${voice.length} voice lines, ${caps.length} captions, ${sfx.length} sound cues, ${TOTAL}s`);
console.log(segs.map((s) => `${s.id.padEnd(8)} start ${s.start.toFixed(2).padStart(6)}  len ${s.len.toFixed(2)}`).join('\n'));
