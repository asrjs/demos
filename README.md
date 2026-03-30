# FireRed VAD Web

TypeScript/JavaScript FireRedVAD runtime for Node.js and browser, using ONNX Runtime WASM.

## Features

- Full FireRed model family support: stream VAD, non-stream VAD, AED.
- Node-first WASM bring-up, browser-ready runtime.
- FireRed Python-like API (`from_pretrained`, `detect_frame`, etc.) with JS aliases.
- C-style packed stream adapter semantics (`process_stream`, `get_frame_offset`, `reset`).
- Hybrid asset loading with override URLs/paths.

## Install

```bash
npm install @asrjs/firered-vad-web
```

## Node Quick Start

```ts
import { FireRedStreamVad } from '@asrjs/firered-vad-web';

const vad = await FireRedStreamVad.from_pretrained('N:/github/FireRedVAD/pretrained_models/onnx_models');
const [frames, result] = await vad.detect_full('N:/github/FireRedVAD/assets/hello_en.wav');
console.log(frames.length, result);
await vad.dispose();
```

## Browser Quick Start

```ts
import { FireRedStreamVad } from '@asrjs/firered-vad-web/browser';

const vad = await FireRedStreamVad.from_pretrained(
  'https://raw.githubusercontent.com/FireRedTeam/FireRedVAD/main/pretrained_models/onnx_models/'
);
const results = await vad.detect_chunk(new Int16Array(400));
console.log(results);
await vad.dispose();
```

## Scripts

- `npm run build` compile package.
- `npm test` run unit tests.
- `npm run parity:node` run Node-first parity smoke and write JSON output.
- `npm run profile:rtfx` run Node WASM speed profiling and print `RTF` / `RTFx` (also writes `tools/profile/out/node-rtfx-latest.json`).
- `npm run profile:browser` start a browser profiler page for `RTF` / `RTFx` with worker benchmarks (`examples/browser-rtfx-profiler.html`).
- `npm run upstream:check` validate upstream model assets and write manifest stub.

### Profiling knobs

- `PROFILE_RUNS` (default `5`)
- `PROFILE_WARMUP_RUNS` (default `1`)
- `PROFILE_WASM_THREADS` (default `1`)
- `FIRERED_ROOT` (default `N:/github/FireRedVAD`)
- `FIRERED_ONNX_DIR` (default `${FIRERED_ROOT}/pretrained_models/onnx_models`)
- `FIRERED_ASSETS_DIR` (default `${FIRERED_ROOT}/assets`)

## Notes

- Browser target is Chromium-first for v1.
- WASM backend is the baseline in Node and browser.
- Upstream converter flow is intentionally a stub in v1; see `tools/upstream/check-upstream.mjs`.
