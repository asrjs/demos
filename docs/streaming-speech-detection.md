# Streaming Speech Detection

`streaming-demo` now keeps the streaming mic pipeline in `src/shared/streaming/` so the detector logic can move into `@asrjs/speech-recognition` later without dragging the demo HUD along.

## Architecture

The browser demo streaming path is split into:

1. browser microphone capture from `@asrjs/speech-recognition/browser`
2. rolling PCM ring buffer
3. TEN-VAD adapter
4. TEN-VAD-first segment builder
5. segment foreground filter
6. demo-only debug HUD

TEN-VAD is the primary detector:

- consumes the 16 kHz mono timeline continuously
- owns segment start and end decisions through thresholding, confirmation, and hangover
- rewinds accepted speech with pre-roll
- degrades gracefully to rough-gate-only fallback when worker init fails

The foreground filter runs only after a segment closes:

- computes short-window RMS in dBFS
- compares segment P90 loudness against the adaptive noise floor
- compares onset loudness against the noise floor for short segments
- rejects long quiet background speech with a separate long-segment threshold

The rough gate remains only for:

- diagnostics
- noise-floor telemetry
- degraded fallback when TEN-VAD is unavailable

## Frame Timeline

All stages share one frame timeline at the target sample rate:

- browser capture emits `startFrame` / `endFrame`
- ring buffer stores PCM by absolute frame offset
- TEN-VAD returns hop-level flags anchored to the same offsets
- the segment builder and foreground filter both keep those offsets
- finalized segments expose `startFrame`, `endFrame`, and `readPcm()`

This is the key extraction boundary for future library work.

## Debug HUD

The HUD is demo-only and reads `StreamingSpeechDetectorSnapshot` rather than touching detector internals.

It shows:

- waveform from the rolling ring buffer
- noise floor in dBFS
- TEN-VAD probability/state
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

## TEN-VAD Asset Source

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

## Future Extraction

Planned future split:

- TEN-VAD segmenter and foreground filter -> `speech-recognition/src/runtime`
- TEN-VAD adapter / browser worker surface -> `speech-recognition` browser/runtime entrypoints
- debug HUD -> stays in `streaming-demo`
