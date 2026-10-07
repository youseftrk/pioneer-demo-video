// Real voice-over durations → assets/vo/meta.json. Prefers the Fish Audio MP3 over the stand-in WAV.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';

const { scenes } = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const meta = {};
for (const s of scenes) {
  const file = ['mp3', 'wav'].map((ext) => `assets/vo/${s.id}.${ext}`).find((f) => fs.existsSync(f));
  if (!file) continue;
  const dur = parseFloat(execFileSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  meta[s.id] = { file, dur: Math.round(dur * 1000) / 1000, voice: file.endsWith('.mp3') ? 'fish' : 'stand-in' };
}
fs.writeFileSync('assets/vo/meta.json', JSON.stringify(meta, null, 2));
const total = Object.values(meta).reduce((a, m) => a + m.dur, 0);
console.log(Object.entries(meta).map(([k, m]) => `${k} ${m.dur}s (${m.voice})`).join('\n'), `\nvoice total ${total.toFixed(1)} s`);
