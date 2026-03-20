# @asrjs/streaming-demo

Realtime and streaming browser demo for local `@asrjs/speech-recognition` development.

This app is the home for microphone-first and streaming-focused work:

- live microphone capture
- speech-detection and segmentation tuning
- realtime-oriented Parakeet flows
- TEN-VAD integration
- streaming debug HUD and waveform tools

Classic file transcription belongs in `../browser-demo`.

## Scope

`streaming-demo` is where we iterate on:

- browser microphone capture
- rolling PCM buffers and detector state
- rough speech gating and TEN-VAD confirmation
- realtime transcription UX
- debug instrumentation that should stay out of the library core

The app still supports model loading and file-based testing, but its main purpose is streaming and realtime behavior.

## Quick Start

```bash
cd streaming-demo
npm install
npm run dev
```

## Local Library Development

```bash
npm run dev:local
```

The Vite config aliases `@asrjs/speech-recognition` to the sibling source tree so streaming/runtime changes can be exercised directly.

## Main Streaming Pieces

- microphone capture from `@asrjs/speech-recognition/browser`
- rolling ring-buffer state in `src/shared/streaming/`
- rough speech gate
- TEN-VAD worker adapter
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

The streaming-specific detector, TEN-VAD adapter, and persistent streaming settings are covered by the local Vitest suite.

## Build

```bash
npm run build
```

## Notes

- TEN-VAD browser assets are stored under `public/wasm/`.
- The debug HUD and streaming presets are demo concerns; they are intentionally separate from the library's stable public API.
- This folder is now its own local git repo, ready for its own remote when you want to publish or split it further.
