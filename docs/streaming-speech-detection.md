# Streaming Speech Detection

`streaming-demo` now keeps the streaming mic pipeline in `src/shared/streaming/` so the detector logic can move into `@asrjs/speech-recognition` later without dragging the demo HUD along.

## Architecture

The browser demo streaming path is split into:

1. browser microphone capture from `@asrjs/speech-recognition/browser`
2. rolling PCM ring buffer
3. rough speech gate
4. TEN-VAD adapter
5. streaming speech detector
6. demo-only debug HUD

The rough gate is intentionally cheap:

- adaptive noise floor
- RMS energy threshold
- SNR threshold
- rising-energy lookback for speech onset
- silence hangover for end detection

TEN-VAD is the confirmation layer:

- consumes the same 16 kHz mono timeline as the rough gate
- can refine speech start closer to the first speech hop
- can confirm silence before segment finalization
- degrades gracefully to rough-gate-only mode when worker init fails

## Frame Timeline

All stages share one frame timeline at the target sample rate:

- browser capture emits `startFrame` / `endFrame`
- ring buffer stores PCM by absolute frame offset
- rough gate tracks chunk onset using the same offsets
- TEN-VAD returns hop-level flags anchored to the same offsets
- finalized segments expose `startFrame`, `endFrame`, and `readPcm()`

This is the key extraction boundary for future library work.

## Debug HUD

The HUD is demo-only and reads `StreamingSpeechDetectorSnapshot` rather than touching detector internals.

It shows:

- waveform from the rolling ring buffer
- short-window speech level in dBFS
- rolling 1 second speech level in dBFS
- noise floor in dBFS
- calibrated speech threshold in dBFS
- SNR
- TEN-VAD probability/state
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

- detector core -> `speech-recognition/src/runtime`
- TEN-VAD adapter / browser worker surface -> `speech-recognition` browser/runtime entrypoints
- debug HUD -> stays in `streaming-demo`
