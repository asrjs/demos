# @asrjs/benchmark-demo

This demo benchmarks `@asrjs/speech-recognition` Parakeet TDT models against Hugging Face speech datasets.

It is intentionally built on the current `@asrjs/speech-recognition` helper surface instead of carrying over the old app structure. The demo uses:

- built-in Parakeet model loading from `@asrjs/speech-recognition`
- dataset split and row helpers from `@asrjs/speech-recognition`
- benchmark statistics and CSV export helpers from `@asrjs/speech-recognition`
- shared browser audio decoding helpers from `@asrjs/speech-recognition`

## Run

```bash
npm install
npm run dev
```

The app aliases `@asrjs/speech-recognition` to the sibling `speech-recognition` source tree, so it always tests the current library state.

## What It Covers

- choose Parakeet model, backend, quantization, and preprocessor mode
- browse Hugging Face dataset configs and splits
- prepare sequential or seeded-random benchmark sample sets
- run repeat benchmarks against real dataset audio
- inspect timing, repeatability, and transcript output
- export run records as JSON or CSV

## Notes

- This demo is focused on the `@asrjs/speech-recognition` direct model/runtime surface, not old compatibility APIs.
- It keeps the UI smaller than the copied benchmark app on purpose. The reusable pieces belong in `@asrjs/speech-recognition`; the demo should stay readable.
- The shared audio helpers are also suitable for other browser apps that need to fetch and decode audio before inference.
