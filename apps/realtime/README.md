# @asrjs/streaming-demo

Realtime and streaming browser demo for local `@asrjs/speech-recognition` development.

This app is the home for microphone-first and streaming-focused work:

- live microphone capture
- speech-detection and segmentation tuning
- realtime-oriented Parakeet flows
- FireRed VAD and TEN-VAD backend comparison
- streaming debug HUD and waveform tools

Classic file transcription belongs in `../browser-demo`.

## Scope

`streaming-demo` is where we iterate on:

- browser microphone capture
- rolling PCM buffers and detector state
- rough speech gating and VAD diagnostics
- realtime transcription UX
- debug instrumentation that should stay out of the library core

The app still supports model loading and file-based testing, but its main purpose is streaming and realtime behavior.

## Quick Start

```bash
cd streaming-demo
npm install
npm run dev
```

## Library Source Selection

The app uses the pinned `@asrjs/speech-recognition` package by default. To develop against a sibling source checkout, explicitly set `ASRJS_SOURCE=source` (and `ASRJS_LIB_DIR` if the checkout is not at `../speech-recognition`) before running `npm run dev` or `npm run dev:local`.

In PowerShell:

```powershell
$env:ASRJS_SOURCE = 'source'
$env:ASRJS_LIB_DIR = '..\speech-recognition'
npm run dev:local
```

The package version and source commit are included in the benchmark provenance labels. Source labels include `-dirty` when the library checkout has uncommitted changes.

## Main Streaming Pieces

- microphone capture from `@asrjs/speech-recognition/browser`
- rolling ring-buffer state in `src/shared/streaming/`
- rough speech gate
- FireRed VAD / TEN-VAD backend selection
- streaming detector orchestration
- demo-only debug HUD and meters

## Persistence

The demo keeps its own browser storage keys so it does not collide with `browser-demo`:

- app settings: `asrjs.streaming-demo.settings.v1`
- local model DB: `asrjs-streaming-demo-local-model`
- audio cache DB: `asrjs-streaming-demo-cache`
- streaming settings: `asrjs-streaming-demo-streaming-mic-settings`

## Tests

```bash
npm test
```

The streaming-specific detector, VAD backend settings, and persistent streaming settings are covered by the local Vitest suite.

## Build

```bash
npm run build
```

## Notes

- FireRed VAD diagnostics are enabled by default. It runs 10 ms VAD hops and aggregates them into 20 ms visual buckets.
- TEN-VAD remains selectable from the capture panel and uses the streaming chunk duration for hop and visual bucket sizing.
- FireRed VAD uses ONNX Runtime Web (WASM). The `predev` and `prebuild` steps copy the matching runtime files from the selected package/source installation into `public/ort/`; the app resolves them under Vite's base URL for both development and production builds.
- TEN-VAD browser assets are still stored under `public/wasm/`.
- The debug HUD and streaming presets are demo concerns; they are intentionally separate from the library's stable public API.
- This folder is now its own local git repo, ready for its own remote when you want to publish or split it further.
