# @asrjs/playground

This demo is the developer-facing Parakeet cockpit for `@asrjs/speech-recognition`.

It is intentionally broad and parameter-heavy so we can inspect the real library surface while developing the runtime:

- root `loadSpeechModel()` flow versus Parakeet compatibility helper flow
- Hugging Face and local-folder artifact loading
- backend, quantization, tokenizer, and preprocessor choices
- load progress events and transcription progress stages
- browser audio preparation metrics
- canonical output, native output, and raw response payloads
- repeat-run benchmark timings

## Run

```bash
npm install
npm run dev
# or
npm run dev:local
```

The demo aliases `@asrjs/speech-recognition` to the sibling `speech-recognition` source tree, so both `dev` and `dev:local` currently exercise the current development version of the library.

## Why this demo exists

This is not a minimal end-user sample. It is our kitchen-sink developer app for:

- validating new API surfaces
- comparing compatibility paths against root runtime paths
- checking model-loading defaults and overrides
- inspecting progress, metrics, and output shapes while porting and debugging models
