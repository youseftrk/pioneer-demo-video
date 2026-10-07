// Stand-in voice-over with the Windows speech engine (used only until Fish Audio has API credit).
// Writes assets/vo/<scene>.wav; the build prefers assets/vo/<scene>.mp3 (Fish) whenever it exists.
// Usage: node tools/tts-local.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const { scenes } = JSON.parse(fs.readFileSync('script.json', 'utf8'));
fs.mkdirSync('assets/vo', { recursive: true });
for (const s of scenes) {
  const out = resolve(`assets/vo/${s.id}.wav`).replace(/'/g, "''");
  const text = s.vo.replace(/'/g, "''");
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Zira Desktop'); $s.Rate = 0; $s.SetOutputToWaveFile('${out}'); $s.Speak('${text}'); $s.Dispose()`,
  ]);
  console.log(`${s.id}: stand-in voice written`);
}
