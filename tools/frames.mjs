// Headless check of the engines without the HyperFrames runtime: serves the project, opens index.html in
// headless Chrome, renders chosen times through window.__pe and saves each segment canvas + a contact sheet.
// Usage: node tools/frames.mjs [--times 1.2,3.4] [--per 4] [--out snapshots/engines]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const OUT = arg('--out', 'snapshots/engines');
const PER = +arg('--per', '4');
const TIMES = arg('--times', '');
const FF = 'tools/ffmpeg/ffmpeg-7.1.1-essentials_build/bin/ffmpeg.exe';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const cdpPort = 9500 + (process.pid % 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pioneer-frames-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const finish = (code) => {
  try { chrome.kill(); } catch {}
  server.close();
  process.exit(code);
};

try {
  let targets = [];
  for (let i = 0; i < 60 && !targets.some((t) => t.type === 'page'); i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') console.log('PAGE EXCEPTION:', (msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').slice(0, 600));
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) console.log(`PAGE ${msg.params.type}:`, msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result?.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 240 && !ok; i++) {
    await sleep(250);
    ok = await evaluate('!!(window.__pe && window.__pe.isReady())').catch(() => false);
  }
  console.log(`engines ready: ${ok} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (!ok) finish(1);
  const segs = await evaluate('window.__pe.cfg.segs');
  const times = TIMES
    ? TIMES.split(',').map(Number)
    : segs.flatMap((s) => Array.from({ length: PER }, (_, k) => +(s.start + (s.len * (k + 0.5)) / PER).toFixed(3)));
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.jpg')) fs.unlinkSync(path.join(OUT, f));
  const files = [];
  for (const [k, t] of times.entries()) {
    const s0 = Date.now();
    const data = await evaluate(`(() => { window.__pe.renderAt(${t}); const s = window.__pe.cfg.segs.filter((s) => ${t} >= s.start && ${t} <= s.start + s.len).pop(); return s.id + '|' + document.getElementById('cv-' + s.id).toDataURL('image/jpeg', 0.86); })()`);
    const [sid, url] = data.split('|');
    const file = path.join(OUT, `${String(k).padStart(3, '0')}-${sid}-${t.toFixed(2)}.jpg`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    files.push(file);
    console.log(`t=${t.toFixed(2)} ${sid} ${Date.now() - s0} ms`);
  }
  if (fs.existsSync(FF) && files.length > 1) {
    const cols = TIMES ? Math.min(4, files.length) : PER;
    const rows = Math.ceil(files.length / cols);
    const sheet = path.join(OUT, 'sheet.png');
    const inputs = files.flatMap((f) => ['-i', f]);
    const scaled = files.map((_, i) => `[${i}:v]scale=480:270,drawtext=text='${path.basename(files[i]).slice(4, -4)}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';');
    const pad = Array.from({ length: rows * cols - files.length }, (_, i) => `color=c=black:s=480x270:d=1[p${i}]`).join(';');
    const all = [...files.map((_, i) => `[v${i}]`), ...Array.from({ length: rows * cols - files.length }, (_, i) => `[p${i}]`)].join('');
    const graph = `${scaled}${pad ? ';' + pad : ''};${all}xstack=inputs=${rows * cols}:layout=${Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}[out]`;
    execFileSync(FF, ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', sheet]);
    console.log('sheet', sheet);
  }
  ws.close();
  finish(0);
} catch (err) {
  console.error('failed:', err?.message ?? err);
  finish(1);
}
