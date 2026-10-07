// Voice-over with Fish Audio: one MP3 per scene, then real durations into assets/vo/meta.json.
// Usage: node tools/tts.mjs [--force]   (reads FISH_API_KEY / FISH_VOICE_ID from .env.local; never prints the key)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const { scenes } = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const force = process.argv.includes('--force');
fs.mkdirSync('assets/vo', { recursive: true });

for (const s of scenes) {
  const out = `assets/vo/${s.id}.mp3`;
  if (!s.vo || (fs.existsSync(out) && !force)) continue;
  let ok = false;
  for (const model of ['s2.1-pro-free', 's2.1-pro', 's1']) {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.FISH_API_KEY}`, 'Content-Type': 'application/json', model },
      body: JSON.stringify({ text: s.vo, reference_id: env.FISH_VOICE_ID, format: 'mp3', mp3_bitrate: 192, normalize: true, latency: 'normal' }),
      signal: AbortSignal.timeout(90_000),
    });
    if (r.ok) {
      fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      console.log(`${s.id}: ok (${model})`);
      ok = true;
      break;
    }
    console.log(`${s.id}: ${model} failed, HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  }
  if (!ok) process.exitCode = 1;
}

const meta = {};
for (const s of scenes) {
  const f = `assets/vo/${s.id}.mp3`;
  if (!fs.existsSync(f)) continue;
  meta[s.id] = parseFloat(execFileSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
}
fs.writeFileSync('assets/vo/meta.json', JSON.stringify(meta, null, 2));
console.log('durations', meta, 'total', Object.values(meta).reduce((a, b) => a + b, 0).toFixed(1), 's');
