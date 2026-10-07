# Pioneer demo video — handoff

Scope: everything about the video in `pioneer-demo-video/` only. The twin app (`qoder-hackathon`) is out of scope except as a source of screenshots, fonts, and the logo path.

## State right now

- `renders/pioneer-demo.mp4` is current: **75.9 s, 26.6 MB, 1920×1080 @ 30 fps, H.264 + AAC**, includes the metal logo showcase. Audio: −15.2 LUFS integrated, −1.2 dBFS true peak, no clipping.
- Voice is Fish reference **`f76b60630a174b36a15f4bd9ed6708f0`** (in `.env.local` as `FISH_VOICE_ID`), model `s2.1-pro-free`, 18 lines ≈ 55.1 s. The previous voice `b97618c1…` was replaced at the user's request.
- The metal logo appears twice: live in the conv1 brand card (repainted per frame via `paintBrand` in `renderers.conv1` — conveyor scenes are static canvases, so the runtime repaints the logo layer before each blit) and in the showcase end card. Params pushed toward readable chrome (`METAL_PARAMS` in `engines/runtime.js`: rep 2.4, contour 0.55, shifts 0.6, softness 0.03, distortion 0.15) with a silhouette halo for edge contrast on dark grounds.
- `index.html` builds to **10 segments / 18 voice lines / 75.931 s**; `npm run check` → 0 errors, 0 warnings, 0 layout issues, contrast AA pass (3/3).
- Rendered-frames contact sheet verified (wild → shutter → conveyor → warp → lights → stamp → conv2 → stampB → flip → showcase, captions and honest labels in place).
- Git status: nothing committed or pushed anywhere in this session.

## What changed this session

### Voice (Fish Audio)

- New Fish API key saved to `.env.local` (git-ignored; it was pasted in chat → **rotate after the hackathon**).
- `tools/tts.mjs` uses model **`s2.1-pro-free`**. The paid `s2.1-pro` returns HTTP 402 "Insufficient API credit" on this account. Per Fish docs the free model is the same model at $0 under fair use until Nov 30, 2026.
- `script.json` rewritten: 18 narration segments, opens **"In the age of super intelligence…"**, value-first arc (hook → hidden failure → product → six agents → limits → crew → outcome → CTA). Uses Fish S2 bracket cues `[pause]` sparingly (verified as real silence, not spoken).
- All 18 lines generated to `assets/vo/*.mp3` (~58.4 s of voice). Legacy Windows Zira stand-ins remain at `assets/vo/*.wav` and are only used when no `.mp3` exists.

### Motion: seek-driven engine ports (`engines/`)

Every visual is a 1920×1080 canvas painted from the frame's time — no clocks, no rAF state, no `Math.random`. `engines/runtime.js` registers `window.__pe`, loads fonts, inits all engines, and listens for HyperFrames `hf-seek` events (falls back to polling `window.__hfThreeTime` and the GSAP timeline).

| File | Engine | Used for |
| --- | --- | --- |
| `engines/core.js` | shared | measured ink boxes, glyph/pen layout, interpolation, grain |
| `engines/wild.js` | WildType | hook — "intelligence" types, goes wild, collapses |
| `engines/shutter.js` | ShutterType | "Cities still break" torn in; ground floods blue |
| `engines/conveyor.js` | CheckerConveyor | brand panel, city/leak/crew/fixed shots, agent-name row |
| `engines/warp.js` | WarpType | six agent sentences, cuts land on the voice naming each agent |
| `engines/lights.js` | AI Lights (canvas) | dark mode steps/progress/"Closing valves"/terminal under rim glow |
| `engines/stamp.js` | StampType | limits, "Ask them why", "12,400 people…", "AED 5.94M…" |
| `engines/flip.js` | FlipType + word generator | "Pioneer / Watches / Decides / Repairs / Pioneer" |
| `engines/metal.js` | **MetalLogo (new)** | Paper `liquidMetal` shader on the Pioneer SVG |
| `engines/runtime.js` | glue | engine config, showcase compositor, `window.__pe` |

Deformation tables stay exactly as supplied; only words/colours/images are Pioneer.

### Pioneer SVG + metal shader (logo showcase, segment 10)

- `tools/logo_svg.py` → `assets/brand/pioneer-logo.svg` (mark + word, 542×120) and `assets/brand/pioneer-mark.svg`. Real paths: mark path copied from `PioneerMark.tsx`, "Pioneer" outlined from Instrument Sans instanced at `wght 500` (OFL) with GPOS kerning. Fill is `currentColor`.
- `engines/metal.js` runs the **Paper Shaders `liquidMetal`** fragment shader (Apache-2.0 © Paper Design, Inc.) + its sizing vertex shader, both taken unmodified from the app's `metal-fx@2.0.11` bundle (MIT © Jakub Antalik — same material as the Approve button). Keep the NOTICE/LICENSE credit lines in the file header if it gets vendored elsewhere.
- Image mode needs a processed shape: `processShape()` computes R = edge field (Poisson solve at half res, normalised per-stroke via separable max filter, `1 − √depth`), G = coverage. Solves once at init (~90 k cells, ~300 ms).
- Showcase compositor (in `runtime.js`): near-black `#08090c` ground, dusk radial lift, soft blurred silhouette glow (alpha 0.34) for edge contrast, metal rendered at `u_time = 0.6 + lt`, reveal = chrome pours from outline to stroke spine over ~1 s via depth-map alpha mask, tagline "The city that fixes itself first." flips in letter-by-letter mid-out, footer line below. Preset `silver` (`colorTint #ffffff66, rep 1.5, softness 0.05, shifts 0.3/0.3, distortion 0.1, contour 0.4, angle 90`); `chromatic` preset is in `MetalLogo.PRESETS` if you want more colour.

### Build + audio (`tools/build.mjs`)

- Rebuilt: scans `script.json`, reads real durations from `assets/vo/meta.json` (via `tools/durations.mjs` — run it after regenerating voice), computes segment starts, and emits `index.html`.
- Sync points: WarpType cuts = each agent-name word onset; conveyor whip pulses lead each narration beat; FlipType `tLand` sits ~0.3 s after the last CTA word.
- Audio pre-mix with local FFmpeg 7.1.1: `assets/mix/voice.wav` (vol 2.8 + `acompressor` 2.5:1 + `alimiter` @ −1 dBFS) and `assets/mix/sfx.wav` (Bencho-derived cues ×1.2). Final render measures **−20.0 LUFS, −1.8 dBFS true peak**; sounds sit ~9 dB under voice.
- Emitted composition: one canvas per segment (each its own track, `data-layout-allow-overflow` since canvases are intentionally full-bleed), two `<audio>` tracks, caption overlays only on product-shot scenes, one paused GSAP timeline, config in a `#pioneer-config` JSON element (HyperFrames scopes `window` for inline scripts — do **not** pass config via globals).
- `package.json` render script now `--quality looks --low-memory-mode` (this machine had ~1.3 GB free at one point; `high` OOM'd mid-render).

### Tooling added

- `tools/frames.mjs` — headless check without HyperFrames: serves the project, loads `index.html`, calls `window.__pe.renderAt(t)`, dumps per-segment JPGs + a contact sheet (`snapshots/engines/`). Flags: `--times a,b,c`, `--per N`, `--out dir`.
- `tools/logo_svg.py` — needs `python` + `fontTools` + `brotli` (installed globally on this machine; `uharfbuzz` absent but not needed).
- `tools/hf.mjs` unchanged — pins `hyperframes@0.8.86`, prefers `tools/ffmpeg/ffmpeg-7.1.1-essentials_build`, disables telemetry.

### Segment map (from latest build)

```
wild      0.00–3.47    shutter  3.47–9.84    conv1   9.84–29.07
warp     29.07–35.10   lights  35.10–41.71   stampA  41.71–52.21
conv2    52.21–58.25   stampB  58.25–66.70   flip    66.70–71.33
showcase 71.33–75.93
```

## What's left (optional, in rough order)

1. Consider trimming ~10 s: the biggest pots are conv1 (20.5 s — 6 shots) and stampA (10.2 s). Showcase (4.6 s) is also a candidate.
2. Visual tuning: metal preset `silver` vs `chromatic` (both in `MetalLogo.PRESETS`); showcase ground/lift strength; whether "Verify checks work" frame stays mid-sort (currently intentional).
3. Housekeeping when convenient: delete stale `assets/vo/*-standin.wav` files and old `snapshots/`; rotate the Fish key after the hackathon.
4. If scenes change: `node tools/durations.mjs && node tools/build.mjs && npm run check && npm run render`.

## Gotchas (learned the hard way)

- **HyperFrames scopes `window` for inline scripts** — data for external engine scripts must ride in a DOM element (`#pioneer-config`), not a global.
- A per-line `PAGE EXCEPTION` from an engine silently keeps `__pe` from readying; the harness prints the stack — check it before blaming fonts.
- `frames.mjs` needs real MIME types (`image/svg+xml`) — the harness server map lives at the top of the file.
- Old FFmpeg builds lack `adelay=all`; always invoke via `tools/hf.mjs` or `tools/ffmpeg/…/ffmpeg.exe`.
- GPU: fine now (RTX 3050, ANGLE D3D11). If it regresses, add `--no-browser-gpu` / keep `--low-memory-mode`.
- Free model note: `s2.1-pro-free` is dev/test under fair-use — fine for this demo; paid model needs API credit.
- Honest framing stays: real streets/buildings from OSM; pipes/sensors/crews/incident are demo — the video's own labels say so. Don't let labels imply otherwise.
