# @asrjs/browser-demo

Unified React demo for local `@asrjs/speech-recognition` development and validation.

The demo now uses the centralized ASRJS high-level pipeline API for hosted models, so the same interface can load multiple model families from one UI.

## Model Catalog

### HuggingFace models

The model picker now includes:

- `Parakeet TDT 0.6B v2`
- `Parakeet TDT 0.6B v3`
- `Parakeet Realtime EOU 120M v1`
- `Google MedASR (Medical English)`

Parakeet and MedASR are loaded through the same `createSpeechPipeline()` path in the library. The demo adapts their results into one shared UI contract for transcription text, timings, confidences, and performance metrics.

The realtime Parakeet RNNT model uses the shared pure-JS NeMo frontend by default. That is the intended integration path for this demo and does not require a separate `nemo80.onnx` or `nemo128.onnx` preprocessor artifact.

### Local folder models

Local folder loading supports Parakeet-style split artifacts for both TDT and RNNT presets:

- encoder ONNX
- decoder ONNX
- tokenizer text file
- optional frontend ONNX

MedASR is currently exposed in the demo through HuggingFace-hosted artifacts only.

## What's New

- Added **Model Source** switch: `HuggingFace` or `Local folder`.
- Added multi-model HuggingFace selection through a shared `createSpeechPipeline()` instance.
- Added MedASR as a selectable hosted model beside the existing Parakeet presets.
- Added Parakeet Realtime EOU 120M v1 through the shared built-in model catalog.
- Added visible hosted-load progress phases from runtime callbacks (resolve/download/compile/session ready).
- Added a `Loaded from cache` badge when a hosted model is reused from pipeline cache.
- Added local-folder model loading from browser-selected files.
- Added local folder artifact detection (encoder/decoder quant modes, tokenizer files, optional frontend ONNX artifacts).
- Added persisted local folder handle restore (where browser permissions allow it).
- Added automatic fallback of preprocessor backend from ONNX to JS when local `nemo*.onnx` is not present.
- Added model-aware JS-first frontend defaults so RNNT models do not assume `nemo128.onnx`.
- Added a simple live-microphone capture path using Web Audio `AudioContext`.
- Added stronger local blob URL cleanup on failure paths.

## High-Level API Example

Hosted model loading in the demo is intentionally model-agnostic. It keeps one pipeline instance and lets the runtime reuse loaded models across model switches:

```js
import { createSpeechPipeline, PcmAudioBuffer } from '@asrjs/speech-recognition';

const pipeline = createSpeechPipeline({ cacheModels: true });

const loaded = await pipeline.loadModel({
  modelId: 'parakeet-realtime-eou-120m-v1', // or 'parakeet-tdt-0.6b-v3', 'google/medasr'
  backend: 'wasm',
});

const response = await loaded.transcribe(PcmAudioBuffer.fromMono(pcm, 16000), {
  responseFlavor: 'canonical+native',
  detail: 'detailed',
});

console.log(response.canonical.text);
```

## Quick Start

```bash
cd browser-demo
npm install
```

## Development Modes

### Local Source Mode

```bash
npm run dev:local
```

Runs against the sibling `speech-recognition` source tree through the Vite aliases in `vite.config.js`.

Use this for library development and pre-publish validation.

### NPM Package Mode

```bash
npm run dev
```

Currently this demo also resolves to the local `speech-recognition` source tree.

That is fine while the package is still being iterated locally. Once `@asrjs/speech-recognition` is published, `dev` can be switched to the installed package path if needed.

## Model Sources in UI

### HuggingFace

- Select model in the UI.
- Demo uses pinned or manifest-defined revisions per model.
- Hosted models share one loading surface in the UI even when their internal architectures differ.

Canonical branches are pinned in code:
- `parakeet-tdt-0.6b-v2` -> `feat/fp16-canonical-v2`
- `parakeet-tdt-0.6b-v3` -> `feat/fp16-canonical-v3`

MedASR is resolved through the library preset manifest and loaded from its configured HuggingFace artifact source.

Parakeet Realtime EOU 120M v1 is resolved through `ysdede/parakeet-realtime-eou-120m-v1-onnx` and defaults to the shared JS frontend path.

### Local Folder

- Pick a folder containing local model artifacts.
- This mode targets Parakeet split artifacts, including RNNT packages like `parakeet-realtime-eou-120m-v1`.
- Expected minimum artifacts:
  - encoder ONNX (e.g. `encoder-model.onnx` or quantized variants)
  - decoder ONNX (e.g. `decoder_joint-model.onnx` or quantized variants)
- tokenizer text file (`vocab.txt`)
- Optional:
  - frontend ONNX (`nemo128.onnx` / `nemo80.onnx`)
  - external ONNX data files (`*.data`)

If no local `nemo*.onnx` is found, the demo automatically switches frontend backend to JS. This is expected for newer NeMo model ports.

### Folder Access Persistence

- On supported browsers, selected folder access can be persisted and restored.
- If permission is not granted on revisit, the UI offers **Restore Saved Folder**.
- On unsupported browsers, users must re-select the folder next visit.

## Version Display

Header shows the active `@asrjs/speech-recognition` source/version:

- Local mode: repo version (with short commit hash when available).
- Package mode later: installed package version when that path is introduced.

## Build

```bash
npm run build
npm run build:local
```

## Deployment

### HuggingFace Spaces

Run:

```bash
node scripts/deploy-to-hf.js
```

This script builds and pushes demo artifacts using the space template config.

### GitHub Pages

Automated with GitHub Actions (local-source build path).

Manual trigger:

```bash
gh workflow run deploy-gh-pages.yml
```

## Cross-Origin Isolation

Required for `SharedArrayBuffer` / multithreaded WASM.

- Local dev server sets COOP/COEP headers.
- HF Spaces headers are configured in `space_template/README.md`.
- GitHub Pages uses `public/coi-serviceworker.js`.

## Troubleshooting

### SharedArrayBuffer unavailable

- Local: verify dev server is used and headers are present.
- HF Spaces: verify custom headers in space template.
- GitHub Pages: ensure `coi-serviceworker.js` is deployed.

### Local folder model fails to load

- Check required encoder/decoder/tokenizer files exist.
- Confirm selected quantization exists in your folder.
- If using ONNX frontend, confirm `nemo*.onnx` exists; otherwise use the JS frontend.

### Realtime Parakeet uses JS frontend by default

- Expected today. `parakeet-realtime-eou-120m-v1` is configured to use the shared JS NeMo mel frontend.
- Do not assume a hosted `nemo80.onnx` or `nemo128.onnx` exists for this model.
- In local-folder mode, ONNX frontend selection is only useful if you explicitly add a compatible `nemo*.onnx` artifact yourself.

### Live microphone capture

- The demo includes a simple microphone capture path built on `getUserMedia()` and `AudioContext`.
- For `parakeet-realtime-eou-120m-v1`, microphone mode keeps listening and auto-submits a turn after roughly 800 ms of silence.
- For other models, microphone mode behaves as a basic record-then-transcribe flow when you stop capture.

### MedASR is not offered in Local folder mode

- Expected today. The demo currently exposes MedASR through HuggingFace-hosted artifacts only.
- Use `Model Source = HuggingFace` and pick `Google MedASR (Medical English)`.

### Model load memory pressure

- Close extra tabs/processes.
- Prefer smaller quant modes (`fp16`/`int8`) where possible.
