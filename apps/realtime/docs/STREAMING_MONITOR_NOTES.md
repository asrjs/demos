# Streaming Monitor Notes

These notes describe how the current demo consumes the shared browser monitor runtime from `@asrjs/speech-recognition`.

## Source Of Truth

The demo should treat the package runtime as the source of truth for:

- waveform renderer semantics
- compact stats renderer behavior
- display mode options
- control labels and notes

Current shared imports come from `@asrjs/speech-recognition/browser`.

## Current Demo Role

The demo is responsible for:

- arranging the monitor surface in the page
- persisting local display settings
- passing live detector state into the shared renderers
- exposing tuning controls for the detector

The demo is not supposed to fork the renderer semantics.

## Current Visual Surfaces

The monitor surface currently supports:

- `full`
- `stats-only`
- `waveform-only`

The waveform panel currently combines:

- compact stats
- waveform canvas
- footer metrics
- side controls for display and detector tuning

## Current Debugging Intent

The waveform view is meant to help debug:

- rough-gate activity
- accepted segment bounds
- logical onset backtracking
- included preroll and lookback audio
- live active segment timing

If the UI is simplified later, preserve those debugging signals.
