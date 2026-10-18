# Streaming Speech Detection

`streaming-demo` keeps the streaming mic UI in `src/shared/streaming/` while the reusable capture, detector, VAD, ring-buffer, and waveform pieces live in `@asrjs/speech-recognition`.

## Architecture

The browser demo streaming path is split into:

1. browser microphone capture from `@asrjs/speech-recognition/browser`
2. rolling PCM ring buffer
3. rough gate segmentation
4. FireRed VAD or TEN-VAD diagnostics
5. segment foreground filter / final acceptance gate
6. demo-only debug HUD

The rough gate currently owns live segmentation:

- consumes the 16 kHz mono timeline continuously
- owns segment start and end decisions through energy thresholding and silence release
- rewinds accepted speech with pre-roll
- keeps running when the selected VAD backend fails

The selected VAD backend is diagnostic:

- FireRed VAD is the default backend
- FireRed consumes 10 ms frames and the app visualizes them as 20 ms buckets
- TEN-VAD remains selectable and follows the streaming chunk duration
- both backends publish probability/state into the monitor and waveform layers

The foreground filter / final acceptance gate runs after a segment closes:

- computes short-window RMS in dBFS
- compares segment P90 loudness against the adaptive noise floor
- compares onset loudness against the noise floor for short segments
- rejects long quiet background speech with a separate long-segment threshold

## Frame Timeline

All stages share one frame timeline at the target sample rate:

- browser capture emits `startFrame` / `endFrame`
- ring buffer stores PCM by absolute frame offset
- VAD backends return hop-level flags anchored to the same offsets
- the rough gate, VAD diagnostics, waveform, and foreground filter keep those offsets
- finalized segments expose `startFrame`, `endFrame`, and `readPcm()`

This is the key extraction boundary for future library work.

## Debug HUD

The HUD is demo-only and reads `StreamingSpeechDetectorSnapshot` rather than touching detector internals.

It shows:

- waveform from the rolling ring buffer
- noise floor in dBFS
- selected VAD probability/state
- segment foreground dB above floor
- onset dB above floor
- accept/reject reason
- active segment and recent finalized segments

The HUD and tuning values are persisted in local storage under:

- `asrjs-streaming-demo-streaming-mic-settings`

## Presets

Available presets:

- `Realtime RNNT`
- `Generic Streaming`
- `Aggressive`
- `Conservative`
- `Custom`

Realtime RNNT models default to `Speech Detect`. Other models default to `Manual`, but the detector can still be enabled.

## VAD Runtime Notes

FireRed VAD uses the library-owned ONNX Runtime Web dependency. The demo injects the local ORT wasm directory from `../speech-recognition/node_modules/onnxruntime-web/dist` through `__ASRJS_ORT_WASM_PATH__` and passes it into `fireRedVadConfig.wasmPaths`.

TEN-VAD remains available for comparison. Its demo-owned runtime assets come from:

The demo-owned TEN-VAD runtime comes from:

- `N:\github\ysdede\keet\public\wasm\ten_vad.js`
- `N:\github\ysdede\keet\public\wasm\ten_vad.wasm`

Copied runtime location in this repo:

- `public/wasm/ten_vad.js`
- `public/wasm/ten_vad.wasm`

Refresh workflow:

1. update the source assets in `keet`
2. copy them into `streaming-demo/public/wasm/`
3. rerun `npm run test`
4. rerun `npm run build`

## Known Failure Mode: FireRed Degraded + NotFoundError

If you see:

- `FireRed VAD is degraded. Runtime plots may be incomplete.`
- `Speech segmentation is running on the rough gate. FireRed VAD is diagnostics-only.`

then separate expected behavior from real failure:

- `diagnostics-only` is expected in this detector port
- `degraded` indicates backend init/runtime failure

Historic root cause (May 2026):

- stale IndexedDB/cache store paths throwing `NotFoundError`
- CMVN URL wiring/default drift

Resolution lives in core library docs:

- `speech-recognition/docs/FIRERED_VAD_DEGRADED_TROUBLESHOOTING.md`

Quick triage:

1. read degraded warning detail text in UI (backend error is appended)
2. inspect browser console for `NotFoundError`
3. confirm FireRed model assets resolve and load
4. restart dev server after code/dependency updates

## Future Extraction

Current split:

- detector, VAD adapters, browser worker surfaces, ring buffer, and waveform renderer -> `speech-recognition/src/runtime`
- debug HUD -> stays in `streaming-demo`
