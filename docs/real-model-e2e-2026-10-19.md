# Real-model browser E2E — 2026-10-19

Status: PARTIAL. These are application flow smoke tests, not numerical parity or broad model certification. No blanket PASS.

## Environment and fixture

Production suite served at http://127.0.0.1:4190/ using scripts/serve-suite.mjs; installed Chrome headless, actual NVIDIA Blackwell WebGPU, WASM decoder. Library: vendored @asrjs/speech-recognition 0.2.0. Successful model: local N:/models/onnx/nemo/parakeet-tdt-0.6b-v3-onnx, fp16 encoder / fp32 decoder, JS processor, webgpu-hybrid.

Fixture: ../speech-recognition/tests/fixtures/jfk2.en.wav, SHA256 59DFB9A4ACB36FE2A2AFFC14BACBEE2920FF435CB13CC314A08C13F66BA7860E, 11 seconds. Expected phrase checked independently: “ask not what your country”. Actual file transcript in all four applications: “And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.”

## Results

| App | Local model loading | File transcription | Controlled microphone | Benchmark |
|---|---|---|---|---|
| Showcase | PASS (v3 warmup and file) | PASS | N/A | N/A |
| Playground | PASS (Parakeet Easy Mode) | PASS | PASS, actual MediaRecorder from WAV-fed getUserMedia | PASS, 3 real inference runs |
| Realtime | PASS (v3 warmup and file) | PASS; 22 aligned words after fix | PARTIAL: 12.03 s passes; 12.000 s fails in library encoder layout inference | N/A |
| Benchmark | PASS | PASS through local audio catalog | N/A | PASS, real run and exported JSON inspected |

Physical microphone, automatic Speech Detect/FireRed/TEN segmentation, Hugging Face downloads, other Playground loading modes, and other model families: UNVERIFIED in this run. Manual Realtime capture passing does not establish VAD correctness.

Benchmark run: total 2620.11 ms, RTFx 4.1983, 11 seconds audio, no run error. Playground wall times: 639.4, 746.4, 658.2 ms. Different warmup/workload conditions mean these numbers are not cross-app performance comparisons. Benchmark exactRate=1 is self-agreement with the first run, not ground-truth accuracy; reference metrics were null. Export has actual transcript and finite positive timings.

## Small fixes made and checked

1. Production model loading initially requested /node_modules/onnxruntime-web/dist/... and failed with 404. Shared build helper copies the exact installed ORT assets to each app's public/ort; main-thread bootstrap configures both WASM and WebGPU modules to the deployed app base. Real v3 inference subsequently passed in all four apps.
2. Benchmark local loader previously ignored selected quantizations and nested cpuThreads in an unsupported options object. It now passes encoderQuant, decoderQuant, preprocessorBackend and cpuThreads through documented top-level fields. Real benchmark after rebuild produced the expected transcript.
3. Realtime worker used CDN fallback despite local main-thread assets. Explicit wasmPaths now reaches worker load options. With jsdelivr requests blocked, the worker reported Ready, emitted a completed microphone job, and used only /realtime/ort resources.
4. Realtime requested native timestamps but omitted canonical detail. Adding detail=words restores 22 aligned words in both file and microphone history; no fabricated word-count fallback.
5. Realtime metrics panel now accepts canonical camelCase timing fields as well as native snake_case; component regression covers both shapes. Build and test passed; post-change live visual timing values have not been separately rechecked.

## Reproduced unresolved failures

- EOU120 (`parakeet-realtime-eou-120m-v1`, local artifacts): actual warmup inference failed the existing expected-text oracle in both fp16/int8 and fp32/fp32 configurations. One output was “the boy was therese rod is used pink salmon”. UI correctly refused verification. No acceptance threshold or expected text was weakened. File flow after this rejected load is UNVERIFIED.
- Realtime exact 12.000 s controlled capture: `NeMo TDT encoder output shape [1, 1024, 151] matches neither axis of encoded_lengths=150.` Failed receipt preserved. The layout fallback in library src/models/nemo-tdt/executor.ts rejects this padded shape; later crop logic already accepts valid lengths shorter than the physical axis. A verified explicit export layout contract is required before altering inference heuristics. No speculative core change was made. The 12.030 s control succeeds; this does not resolve the boundary failure.

## Evidence and reproducibility

Local receipts (ignored tmp files retained; not portable CI artifacts):
- tmp/real-e2e/showcase-local-before-ort.json — production 404 failure.
- tmp/real-e2e/showcase-eou-after-ort.json and showcase-parakeet-realtime-eou-120m-v1-1792357911.json — EOU failures.
- tmp/real-e2e/showcase-parakeet-tdt-0.6b-v3-1792357969.json — v3 file success.
- tmp/real-e2e/playground-1792358255.json — load, file, controlled mic, 3-run benchmark.
- tmp/real-e2e/benchmark-export-1792358308.json — actual benchmark export.
- tmp/real-e2e/realtime-1792358538.json — 12.000 s failure, local worker runtime.
- tmp/real-e2e/realtime-1792358636.json — 12.030 s success with CDN blocked and aligned words.

Browser harnesses are in tmp/real-e2e/{showcase-local,playground,benchmark,realtime}.py. They use local models, production UI controls, and actual inference. Early showcase prototype exit status is not an oracle: inspect its explicit load/file statuses. Realtime prototype initially left mic UNVERIFIED pending manual receipt inspection; later version checks new microphone history, worker completion and absence of CDN requests. Repeated runtime failures must not be overwritten by successful later runs.

Validation: full suite production build passed; changed Benchmark and Realtime rebuilt individually after later fixes. npm test: 14 Node tests + 45 Vitest tests passed. Subagent review was read-only; parent verified library option signatures, source layout inference, receipts and new regression tests independently.
