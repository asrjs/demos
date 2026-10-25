# Context-preserving capture and streaming report

**Status:** v24 controlled real-weight acceptance completed: **52/52 checks passed**, independently audited by the parent. This certifies only the model/backend/fixture/flow combinations below.

**Evidence date:** 2026-10-25. The acceptance fixture scope is deliberately narrow: one English JFK utterance and one Russian fixture. Microphone runs use controlled/fake microphone injection; they do not certify a physical microphone, browser/device, or acoustic environment.

## What changed

### Shared contextual VAD

The opt-in `transcriptionContext` path, enabled by the Realtime demo, keeps a bounded transcript context across VAD utterances. Defaults are 600 ms of preroll, 30 seconds maximum context duration, and a 3 second maximum gap. Context snapshots carry a stable context id, monotonically increasing revision, and absolute sample-frame bounds. Successive requests therefore contain cumulative audio from the same context instead of isolated VAD slices. On `stop({ flush: true })`, if additional captured frames extend the latest snapshot, the controller emits one final revision with the same context id/start/sample rate, revision +1, and `context.finalized=true`. It appends only the actual captured tail, up to 600 ms and the 30-second cap; it does not pad audio. The callback carries a context revision which replaces the existing transcript instead of appending a duplicate. This runs only after successful stop, with flushing enabled and without a separate native streaming transcriber. No extra job is emitted when there is no extension or when flushing is disabled. The implementation preserves captured PCM and does not remove repeated words with lexical deduplication; transcription remains the model's output over the supplied audio context.

The browser capture path provides raw mono Float32 PCM on a 16 kHz processing timeline, with the Realtime controller requesting echo cancellation, noise suppression, and automatic gain control off. Context is bounded; this is cumulative-window re-decoding, **not** a claim that every model uses a continuous native decoder cache.

Relevant sources: `speech-recognition/src/runtime/browser-controller.ts`, `speech-recognition/src/runtime/capture.ts`, and `speech-recognition/src/runtime/speech-context.ts`.

### Playground recording and timestamp correctness

Playground recording now uses the shared browser realtime microphone controller in manual mode. The exact mono Float32 capture is retained as inference input; a WAV is produced only for playback/download. Transcription, streaming simulation, and benchmark actions use the retained raw capture and common exact-zero edge preparation. Benchmark RTF uses the processed audio-window duration. Starting or selecting new audio invalidates stale recorded PCM; a missing recorded buffer fails closed instead of falling back to the WAV. Stop/dispose is idempotent and generation/session guarded, including the race where an old asynchronous stop completes after a new recording starts.

Captured-audio preparation trims only exact-zero utterance-edge samples with a retained 300 ms margin by default; internal zeros and all-zero input are retained. The resulting frame window is explicit. `rebaseCapturedTranscriptTimes(result, startFrame, sampleRate)` immutably restores canonical segment/sentence/word/token times to the original capture timeline after edge trimming, while preserving native diagnostics and duration metadata. It supports canonical results and `{ canonical, native }` envelopes.

Relevant sources: `apps/playground/src/App.jsx`, `apps/playground/src/recorded-audio.js`, and `packages/demo-runtime/src/capture-transcription.js` (public export in `packages/demo-runtime/src/index.js`).

### X-ASR streaming correctness

When `emitPartials: false`, X-ASR now still feeds every ordered PCM chunk to its executor so model streaming state advances; it suppresses intermediate text emission rather than dropping input. Finalization updates the transcript accumulator as final, and blank revisions use the accumulator's revision sequence. Regression coverage asserts actual forwarded float samples, strict push/flush/push/final revision order, and final kind/meta/finalized state. No lexical deduplication was added.

Relevant source/test: `speech-recognition/src/models/x-asr/model.ts` and `speech-recognition/tests/x-asr.test.ts`.

## Verification record

### v20 regression matrix (not v23 acceptance)

Receipt: `tmp/real-e2e/context-v20-regression/parent-context-verification.json`. The controlled real-weight matrix accepted **46/50** checks; cumulative focused/regression accounting was **71/76**. The five failures are preserved:

1. GigaAM CTC, WASM, Realtime TEN-VAD: final `s` missing (`americans` → `american`).
2. X-ASR, WASM, Realtime TEN-VAD.
3. X-ASR, WASM, Realtime FireRed-VAD.
4. X-ASR, Playground record-then-transcribe, WASM.
5. X-ASR, Playground record-then-transcribe, WebGPU.

These failures must not be recast as PASS based on another backend, another flow, or source-level tests. The subsequent X-ASR input-preservation fix passed the fresh v24 built-app matrix below. The served v20 evidence predates timestamp rebasing and the later X-ASR change.

The standalone v20 focused receipt remains **25/26**, with its single failure GigaAM CTC WASM TEN-VAD final-`s` loss. v19 CPU boundary experiments support a leading-context crop hypothesis for that fixture, but are official CPU controls, not browser-runtime acceptance. See `tmp/real-e2e/context-v20-focused/parent-context-verification.json` and `tmp/real-e2e/context-v19-gigaam-ctc/native-cpu-leading-context-control-v19.json`.

### Source tests and builds

- Final library suite: **1,982 passed, 36 skipped**, isolated with `maxWorkers=4`. Two earlier timeout failures remain preserved in their original logs; the isolated rerun is evidence for the final library run, not a reason to erase the earlier failures.
- Demos: **93 tests passed** and all four app builds passed.
- Harness: **68 tests passed**. The strict finalized-tail checks require one terminal extra job only, exact context identity/revision/frame bounds, an actual captured-PCM artifact, and byte-for-byte preservation of the prior context PCM prefix. The test suite also rejects arbitrary extra jobs, changed context identity, invalid revisions, oversized tails, missing artifacts, and changed PCM prefixes.
- Lint: **0 errors, 16 warnings**. Two warnings are new max-lines warnings in the browser controller and its test; they are recorded rather than hidden.
- The v24 package SHA-256 is `2cbbd04f7c102c372e7f281880d8d3b6770ac5afd09ad2ce911a2700d6b38bb2`. It identifies the tested package; it does not certify model flows. The parent reported root-import count **44**.
- Historical v23 package SHA-256: `0d95f59fa358d82322d6e3421a21babd8c7b70238fa7dca567f125c6750ba3c5`.
- Source tests/builds do not replace a live real-weight matrix. The completed v24 browser acceptance is recorded below.

Independent review caught and corrected the Playground stop-session ownership race and X-ASR revision sequencing issue. The parent independently reviewed the shared helper and X-ASR changes and requested the associated failure-path/input-preservation regressions. These reviews are not model acceptance evidence.

## Historical v23 results and completed v24 acceptance

The v23 Playground record/stream subset passed **12/12** controlled flows. The v23 VAD subset passed **34/36**; the two preserved failures are GigaAM CTC WebGPU FireRed-VAD returning “american” and Moonshine WASM TEN-VAD returning “America”. These are historical v23 results, not v24 acceptance.

The GigaAM boundary control compared the full source fixture with the captured context: the final captured context ended at frame 252,416, while the source's last nonzero sample is frame 255,999 (3,584 missing samples through that inclusive last sample, about 224 ms). The captured 176,384-frame window aligns with the fixture at correlation 0.999996. Appending 600 ms of the actual fixture tail restored the full oracle transcript in the CPU control. This supports a captured-tail truncation cause for this fixture; it is CPU evidence, not browser-runtime acceptance or a general model guarantee. The exact control is `tmp/real-e2e/context-v23-vad/native-cpu-fr-tail-v23-parent.json`, status `OFFICIAL_CPU_CONTEXT_BOUNDARY_CONTROL_COMPLETED_NOT_RUNTIME_PASS`. Preserve the original v23 failure receipts.

The v24 real-weight matrix passed **52/52** independently checked flows:

| Model | Realtime WASM + WebGPU: file / TEN-VAD / FireRed-VAD | Playground WASM + WebGPU: file / file streaming / recorded transcription / recorded streaming |
| --- | --- | --- |
| Qwen3-ASR 0.6B | 6/6 | Not rerun in this final subset |
| SenseVoice Small | 6/6 | Not rerun in this final subset |
| GigaAM multilingual CTC | 6/6 | Not rerun in this final subset |
| GigaAM v3 E2E RNN-T | 6/6 | Not rerun in this final subset |
| Moonshine Streaming Tiny | 6/6 | 8/8 |
| X-ASR 160 ms | 6/6 | 8/8 |

The parent checked full normalized oracle text, fixture/model/package hashes, requested backend evidence, browser errors, and captured PCM continuity. All 24 VAD flows contain exactly one verified final context revision with the original PCM prefix intact. A stop-completion guard was added during the matrix; the first CTC receipts lack its explicit field, so the parent separately checked their final PCM revisions instead of inferring completion from an empty queue. WebGPU evidence covers the requested component configuration, including documented hybrid components; it does not prove every operator runs on GPU.

Parent receipts: `tmp/real-e2e/context-v24-vad/parent-context-verification.json` (36/36), `parent-final-tail-audit.json` in that root, and `tmp/real-e2e/context-v24-record-stream/parent-context-verification.json` (16/16). Both roots include served-v24 provenance. The parent verified 426 source hashes, 1,695 built/installed distribution hashes, and freshly rehashed 34 local model artifacts with zero mismatches.

Reproduction uses the serial runner, a fresh nonexistent output root, cached local model artifacts, and the fixed fixture/oracle values embedded in the runner:

```powershell
python tmp/context-vad-20261025/run-v24.py --model gigaam-ctc --model moonshine --model x-asr --model gigaam-rnnt --model sensevoice --model qwen --app realtime --vad-only --root tmp/real-e2e/context-v24-vad-rerun
python tmp/context-vad-20261025/run-v24.py --model moonshine --model x-asr --app playground --root tmp/real-e2e/context-v24-record-stream-rerun
python tmp/context-vad-20261025/verify-context-v24.py tmp/real-e2e/context-v24-vad-rerun
python tmp/context-vad-20261025/verify-context-v24.py tmp/real-e2e/context-v24-record-stream-rerun
```

The runner definition is `tmp/context-vad-20261025/run-v24.py`. The second command exercises Playground record/stream for models configured with native streaming. The runner writes per-flow receipts, logs, `runs.json`, and served provenance under its output root. Do not reuse an existing output directory; the runner deliberately rejects it.

## Limits and remaining gates

- Real-weight coverage here is limited to the English JFK and Russian fixtures; do not generalize to all languages, speakers, models, or acoustic conditions.
- Controlled/fake microphone evidence is not physical-microphone certification.
- Contextual VAD currently re-decodes bounded cumulative windows. Native continuous-cache parity is model-specific and not established by this report.
- The v20/v23 failures remain valid historical evidence; matching v24 cases now pass. No earlier failed receipt was changed to PASS.
- All four apps build and pin v24; final live capture coverage is Realtime and Playground only. Earlier four-app file evidence remains historical, not a new v24 four-app certification.
- Recorded benchmark preparation has regression tests, but its UI benchmark flow was not specifically verified against real-weight oracles this turn.
- Bounded acoustic re-decoding and the terminal pass add inference work; no latency improvement or continuous native-cache parity is claimed. Broad accuracy and recordings longer than the context bound are not certified here.
- CI, commit, push and merge were not run in this continuation. Both working trees contain inherited edits; do not stage them wholesale.

## Durable evidence snapshot

[Manifest](evidence/context-preserving-capture-2026-10-25/manifest.json) records SHA-256 for the saved logs, probes, package/model provenance and 780 JSON receipts in `receipts.json.gz`. Archive SHA-256: `b98e3bab03d6297acf8f125f6f89c6a3d9ca00d0fcfdbb52c5a0b73f9e35ce06`. Raw PCM, browser profiles and weights remain local and are excluded from the archive. Historical failures are retained.

## Evidence locations

- v20 combined regression: `tmp/real-e2e/context-v20-regression/parent-context-verification.json`
- v20 focused matrix: `tmp/real-e2e/context-v20-focused/parent-context-verification.json`
- v19 CTC boundary controls: `tmp/real-e2e/context-v19-gigaam-ctc/`
- v23 served provenance: `tmp/real-e2e/context-v23-record-stream/served-v23-provenance.json`
- v23 CPU context-tail control: `tmp/real-e2e/context-v23-vad/native-cpu-fr-tail-v23-parent.json`
- v24 completed VAD and record/stream matrices: `tmp/real-e2e/context-v24-vad/` and `tmp/real-e2e/context-v24-record-stream/`
- implementation-specific tests/logs and prior failure receipts: `tmp/context-vad-20261025/` and `tmp/real-e2e/`
