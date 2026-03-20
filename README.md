# @asrjs/browser-demo

Classic file-transcription demo for local `@asrjs/speech-recognition` development.

This app is intentionally focused on the simple browser workflow:

- choose a built-in speech model
- load a random dataset sample or upload an audio file
- transcribe it
- compare the output against reference text
- optionally load a supported local model folder

Live microphone streaming and realtime-debug tooling now live in `../streaming-demo`.

## Scope

`browser-demo` is the classic app for:

- hosted model loading through the library's high-level built-in pipeline surface
- browser file upload and dataset sample playback
- transcript/reference comparison
- local folder loading for built-in models that support local browser artifacts

Today, local folder loading is primarily aimed at built-in Parakeet models.

## Library Surfaces Used

Hosted model loading uses the built-in catalog and high-level pipeline helpers from `@asrjs/speech-recognition`.

Local folder loading uses the browser-local library surface, including:

- `createSpeechModelLocalEntries`
- `collectSpeechModelLocalEntries`
- `inspectSpeechModelLocalEntries`
- `loadSpeechModelFromLocalEntries`

That keeps local artifact inspection and loading in the library rather than buried in demo-only app code.

## Quick Start

```bash
cd browser-demo
npm install
npm run dev
```

## Local Library Development

```bash
npm run dev:local
```

The Vite config aliases `@asrjs/speech-recognition` to the sibling source tree so changes in the library are exercised directly in the demo.

## Main Flows

### Hosted Models

- select a built-in model
- load it from Hugging Face
- transcribe dataset samples or uploaded files

### Local Folder Models

- choose a local folder with compatible model artifacts
- inspect available quantizations, tokenizer files, and optional preprocessors
- load the model directly from browser-managed file handles

## What This Demo Is Not

`browser-demo` is no longer the place for:

- live microphone streaming
- realtime speech-segmentation tuning
- TEN-VAD debugging
- waveform/debug HUD work

Use `../streaming-demo` for those flows.

## Build

```bash
npm run build
```

## Notes

- The app still includes the COI service-worker bootstrap used for static hosting where cross-origin isolation headers are not available directly.
- Classic file transcription stays intentionally simpler than the kitchen-sink app in `../playground`.
