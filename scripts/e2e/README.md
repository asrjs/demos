# Real-model audit tools

Run the production suite on port 4190, with the pinned library archive installed:

```powershell
npm ci --ignore-scripts --cache tmp/npm-cache
npm run build
npm run preview:suite -- --port 4190
```

`remaining-model-flows.py` drives the visible model/source controls and uses the selected model's real loading path. It requires Python, Playwright, Chrome, a WAV fixture, its independently known SHA-256, and the complete expected transcript. Run model cases serially; do not share its test-owned browser profile between simultaneous processes.

```powershell
python scripts/e2e/remaining-model-flows.py --app realtime `
  --model-id UsefulSensors/moonshine-tiny --source local --descriptor-sources local `
  --model-dir N:/github/asrjs/speech-recognition/models/onnx/moonshine-tiny-fp32 `
  --backend wasm --fixture N:/github/asrjs/speech-recognition/tests/fixtures/jfk2.en.wav `
  --expected-fixture-sha256 59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e `
  --oracle "And so my fellow Americans ask not what your country can do for you ask what you can do for your country" `
  --mic-flow manual --mic-flow speech-detect:vad-only:ten-vad `
  --mic-flow speech-detect:vad-only:firered-vad --mic-capture-ms 21000 `
  --output-dir tmp/real-e2e/my-model/realtime
```

Use `--app playground --record-mic --run-streaming` for recording and native chunked inference. Showcase and Benchmark have file flows; they do not expose microphone/VAD controls in this suite. Backend/quantization options must correspond to controls actually exposed by the chosen model. `--descriptor-sources` records the inspected catalog's source values for a disabled single-source control; it cannot supply artifacts or activate a hidden loader.

Receipts keep load, execution, exact transcript, GPU dispatch, and each requested flow separate. Exit zero requires **every requested flow** to pass. A successful file flow cannot mask a failed microphone flow. Offline fallback is never a native-streaming PASS. Missing model artifacts, a timeout, or a skipped flow never count as verified inference. Transcript comparison ignores case/punctuation, but preserves all words and repetitions.

Microphone runs inject the supplied fixture once, with five seconds of silence at either end. The default capture covers the entire padded WAV; `--mic-capture-ms` is an exact explicit override. Receipts record the requested capture duration and padded fixture duration. They exercise browser capture and the actual ASR/VAD paths, but cannot certify a physical microphone. The receipt always retains `physicalMicrophone: UNVERIFIED`. GPU microphone probes reset after the transcription worker finishes loading and only observe that worker plus the page; model warm-up does not satisfy inference telemetry.

Chrome loops a fake audio file unless `%noloop` is specified; the runner explicitly disables looping. See the [Chromium switch definition](https://chromium.googlesource.com/chromium/src/+/HEAD/media/base/media_switches.cc).

Regression checks:

```powershell
python scripts/e2e/test_remaining_model_evidence.py
python scripts/e2e/test_remaining_model_selectors.py
```

The first suite needs no browser. The second uses Chrome to cover the observed Mode/Model label collision and stale progress-message completion bug. These tool tests do not load models and do not replace real-weight acceptance receipts.
