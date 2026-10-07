// Runs the pinned HyperFrames CLI with a project-local FFmpeg on PATH (none is installed system-wide).
// Prefers FFmpeg 7.1.1 in tools/ffmpeg (gyan.dev essentials build); falls back to the npm-bundled 2018 build.
// Usage: node tools/hf.mjs <hyperframes args…>
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, delimiter, resolve } from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';

const modern = resolve('tools/ffmpeg/ffmpeg-7.1.1-essentials_build/bin');
const bins = fs.existsSync(`${modern}/ffmpeg.exe`) ? [modern] : [dirname(ffmpeg.path), dirname(ffprobe.path)];
const PATH = [...bins, process.env.PATH].join(delimiter);
const r = spawnSync('npx', ['--yes', 'hyperframes@0.8.86', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PATH, Path: PATH, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1' },
});
process.exit(r.status ?? 1);
