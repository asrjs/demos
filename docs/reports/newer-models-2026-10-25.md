# Modern ASR: real-weight four-demo audit — 2026-10-25

Completed the remaining local model integrations and tested real weights in Showcase,
Realtime, Playground and Benchmark on WebGPU and WASM. The latest independently
audited matrices contain **108 requested flows: 81 accepted, 8 unsupported native
streaming requests, and 19 failed transcript-accuracy checks**. There is no blanket
model PASS. Every acceptance is limited to the exact fixture, app, backend and
flow in its receipt. Microphones used controlled Chrome audio injection; physical
microphone input remains UNVERIFIED.

## Final matrix

Each model has 18 checks: eight file/benchmark flows, six Realtime capture flows,
two Playground recordings and two native-streaming requests.

| Model | Package | Accepted / 18 | Remaining failures |
| --- | --- | --- | --- |
| Qwen3-ASR 0.6B | v16 | 16 | Native streaming unsupported on both backends |
| SenseVoice Small | v17 | 16 | Native streaming unsupported on both backends |
| GigaAM multilingual CTC | v17 | 10 | Four VAD accuracy failures, two recording accuracy failures, two unsupported native-streaming requests |
| GigaAM v3 E2E RNN-T | v17 | 12 | Four VAD accuracy failures, two unsupported native-streaming requests |
| Moonshine Streaming Tiny | v18 | 13 | Both manual captures and Playground recordings are empty on padded input; WebGPU FireRed misses one word |
| X-ASR 160 ms | v18 | 14 | Four VAD accuracy failures |

All six models loaded and transcribed the file fixture in all four demos on both
backends. Qwen and SenseVoice also passed manual capture, TEN-VAD, FireRed-VAD and
record-then-transcribe. Moonshine passed TEN-VAD on both backends and FireRed on
WASM. Moonshine and X-ASR passed genuine Playground native streaming on both
backends. Unsupported offline fallbacks were never counted as streaming success.
Realtime VAD currently transcribes utterance segments independently; it is not the
cache-carrying native-streaming path tested in Playground.

The English fixture is JFK, SHA-256
`59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`.
RNN-T used the Russian Pushkin example, SHA-256
`d8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69`.
The entire pinned oracle was compared after case/punctuation normalization;
partial text, duplicates and missing words fail. This is not a broad accuracy
benchmark or proof of quality across every supported language.

## Changes and verified fixes

- Added shared local-artifact loading for SenseVoice, GigaAM CTC/RNN-T and X-ASR.
  Registration supplies model filenames and contracts; four app-specific model
  branches were not added. Local-only entries remain experimental and cannot
  silently route to the Hub. X-ASR uses its existing native 160 ms streaming path.
- Added a distinct `moonshine-ai/moonshine-streaming-tiny` entry requiring the
  streaming graph set. It advertises one shared provider for its four graphs,
  and no unsupported model-derived timestamp/confidence capabilities. Existing
  offline Moonshine identity remains available.
- Fixed four Moonshine final-tail errors: ragged audio must be padded to 80
  samples with a valid-sample mask; the 480-frame retention bound was incorrectly
  treated as 480 samples; lookahead was retained and then fed again; a padded
  hidden row was included while the first valid row was dropped. Regression tests
  cover exact PCM continuity, horizon, ragged boundaries and valid hidden slices.
  The parent reran all nine captured VAD pieces on the exact staged ONNX graphs:
  text and explicitly BOS/EOS-normalized tokens match the official CPU model.
- Fixed the PCM diagnostic callback's reentrant browser-query deadlock. Qwen's
  real capture retest completed, and the parent independently verified PCM bytes,
  digest, response type and one enqueue/one completion.
- Fixed harness terminal-state reporting: Playground `Failed:` is persisted as a
  runtime failure before text comparison; completed empty microphone output fails
  the oracle immediately instead of waiting five minutes for a DOM change.
- Profiling now defaults off in Showcase, Realtime and Playground, preserving
  saved boolean choices. Benchmark exposes no profiling control. X-ASR's original
  default-profiled run hit ORT's event cap. The fresh-profile v18 rerun has no such
  console errors; manual, recording and native-streaming flows pass. Explicitly
  enabling long session profiling remains subject to that upstream event limit.
  No error filter or acceptance threshold was weakened.

No new ONNX export or weight mutation was needed for these fixes. Existing local
source graphs and custom Moonshine graphs were used with corrected host contracts.

## Native controls and remaining limitations

The parent reran each subagent control, rather than accepting its status:

- Official Moonshine CPU generation returns exact JFK text for 11 seconds but
  empty text for the 21-second silence-padded input and actual manual capture.
  The captured PCM contains speech. On the new v18 WebGPU VAD captures, both
  joined browser texts match the official CPU outputs exactly, including the
  remaining FireRed `as` versus oracle `ask` error. Model agreement does not make
  the inaccurate output a quality PASS.
- Both official GigaAM CPU implementations reproduce the browser's VAD errors on
  the exact captured float32 segments. Full manual input is exact. Short-context
  recognition is the demonstrated limitation; changing the oracle would hide it.
- X-ASR's documented sherpa-onnx CPU path also drops words on these VAD pieces.
  Its output differs in some details from the browser; numerical/text parity is
  not established. No unproven flush or graph patch was applied.

CPU controls and probes are preserved in the library's
`docs/reports/evidence/{moonshine-streaming,gigaam-ctc,gigaam-rnnt,xasr}-2026-10-25/`.
Raw PCM remains in the corresponding ignored `tmp/real-e2e/.../mic-pcm-capture/`
folders; preserve it for exact-input reproduction.

## Code and package validation

- Library: **1,961 passed, 36 skipped**; build passed; lint **0 errors / 14 warnings**.
- Root static import graph: **44**, below the unchanged requested limit of 45.
- Demo tests: **69 passed** (22 suite/runtime + 47 app tests); all four builds passed.
- Harness tests: **57 passed**. Both repository diff checks passed.
- v18 archive, installed package and built distribution match: **49 source hashes
  and 1,691 dist hashes**, no mismatches. Served HTML and entry scripts match disk
  for all four apps. Between SDK v17 and v18 only Moonshine streaming-session JS
  and its maps changed; other model executors are byte-identical. App profiling
  defaults are a separate, tested change.
- Parent independently checked 34 model-artifact hashes and 117 captured PCM
  byte-count/SHA pairs. These checks establish identity, not recognition quality.

Current package:
`vendor/asrjs-speech-recognition-0.2.0-model-audit-20261024-v18.tgz`

SHA-256: `c85b861e576b08c237af5f5c2d982909547e9aa4777e2d5d1ee95862c7bf00b6`.

This continuation made no commit/push/merge and did not run new CI. Both checkouts
remain on their existing main commits with inherited and current local changes.
Non-Turbo Whisper Large v3 and EOU120 were excluded; existing Turbo work was kept.

## Durable evidence and bot PR

[Compact audited summary](evidence/modern-model-audit-2026-10-25/summary.json) and
[per-model checks](evidence/modern-model-audit-2026-10-25/) bind the final receipts.
The [v18 archive manifest](evidence/remaining-model-audit-2026-10-24/manifest-v18.json)
indexes **1,078** current/historical JSON receipt versions, including failures and
incomplete attempts. Archive SHA-256:
`f8a54c7cae98e40565a17b3527af334c232c959231831af2c32529314ee17d1d`.
No raw audio, model tensors, browser profiles or screenshots are in that archive.
Historical passes do not certify the current package.

[PR #238](https://github.com/asrjs/speech-recognition/pull/238) was rejected and
closed without merging. A real-source reproduction showed that replacing async
cleanup-map callbacks with direct callbacks stops cleanup after a synchronous
throw, leaking subsequent handles. No cosmetic subset was taken. Decision,
reproduction and closure evidence are in the library report
`docs/reports/bot-pr-238-decision-2026-10-25.md`. A later GitHub connector check
found zero open PRs in both speech-recognition and demos.
