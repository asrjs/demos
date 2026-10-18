# ASRJS Companion Demos Suite (`@asrjs/demos`)

Unified companion demo applications, benchmarks, and interactive workstations for **[@asrjs/speech-recognition](https://github.com/asrjs/speech-recognition)**.

---

## 🏛 Apps Architecture

The four task-oriented applications live under `apps/`. They share `@asrjs/demo-ui` for the shell and light/dark theme, and `@asrjs/demo-runtime` for catalog helpers and the showcase/realtime hub loader. The central portal links all four workspaces. See [suite conventions and migration map](docs/suite-apps.md).

```
demos/
├── apps/
│   ├── showcase/     # Flagship multilingual transcription & Canary AST translation showcase
│   ├── playground/   # 16-family universal catalog, live code snippet generator, and stateful streaming stepper
│   ├── realtime/     # Realtime microphone, neural VAD (FireRedVAD & TEN-VAD) lab, and subtitle workstation
│   └── benchmark/    # Multi-family benchmarking, long-form sweet-spot planner, 8 SVG charts, and snapshot comparison
├── packages/
│   ├── demo-runtime/ # Shared catalog, hub loader, and suite navigation
│   └── ui/           # Shared @asrjs/demo-ui (theme, word pills, SVG charts, subtitle export, WER/CER math)
├── references/       # Historical demos; 11 subtree imports plus one file snapshot (see below)
└── vite.shared.js    # Shared Vite configuration (COOP/COEP, worker format: 'es', dynamic @asrjs aliases)
```

### 1. Flagship Showcase (`apps/showcase`)
- **Origin**: `asrjs/browser-demo` & `ysdede/transformers-v4-parakeet-demo`
- **Purpose**: Client-side multilingual transcription and speech translation demos.
- **Key Features**:
  - Full Hugging Face dataset sampler (JFK, LibriSpeech, MInDS-14, FLEURS)
  - Canary-1B Speech-to-Text and Speech Translation (AST)
  - Interactive click-to-seek word timestamp pills
  - SRT / VTT / JSON transcription history export

### 2. Developer Playground (`apps/playground`)
- **Origin**: `asrjs/playground`
- **Purpose**: Developer workbench for exploring model architectures, inspecting envelopes, and generating ready-to-run code.
- **Key Features**:
  - **Universal Catalog Mode**: uses `loadBuiltInSpeechModel()`; available execution paths depend on each model's artifacts and backend support.
  - **Live Code Snippet Panel**: generates copy-paste ready TypeScript/JavaScript code for the selected model, backend, and options
  - **Streaming Stepper**: uses `createStreamingTranscriber()` only when the handle reports support; otherwise runs one labelled offline transcription. Nemotron's persistent state path remains experimental pending numerical parity evidence.
  - Dual Canonical & Native envelope inspection side-by-side

### 3. Realtime & Neural VAD Workstation (`apps/realtime`)
- **Origin**: `asrjs/streaming-demo` + consolidated `asrjs/vad-demo`
- **Purpose**: Low-latency microphone streaming, neural VAD endpointing, and live subtitle station.
- **Key Features**:
  - Dual Workspace: `Realtime VAD Lab` (live waveform, energy thresholds, VAD timeline) and `Transcript & Subtitles`
  - Integrated Neural VAD backends: **FireRedVAD** and **TEN-VAD**
  - Gate modes: `rough-only`, `hybrid`, and `vad-only`
  - Instant `.srt`, `.vtt`, and `.json` subtitle file download

### 4. Benchmark Workbench (`apps/benchmark`)
- **Origin**: `asrjs/benchmark-demo` + `ysdede/tdt-webgpu-demo` (branch `feat/browser-benchmark-lab`) + `ysdede/parakeet.js-benchmark`
- **Purpose**: Systematic performance profiling, RTFx analysis, and long-form chunk sweet-spot optimization.
- **Key Features**:
  - **5-Tab Console**: Setup, Overview & Sweet-Spot, 8 Interactive SVG Charts, Compare & Pivot, Run Data & Export
  - **Target Duration Bucket Planner**: benchmark across standard durations (`2s, 4s, 6s, 10s, 15s, 20s, 30s`)
  - **Long-Form Overlapped-Window Sweet-Spot Simulator**: profiles window duration vs. overlap to find maximum throughput
  - **Snapshot Manager & Pivot Table**: persistent run comparisons with baseline delta % and Markdown leaderboard generation

---

## 📚 References & Pioneering Implementations (`references/`)

The migration contains 11 subtree import records. `transformers-v4-parakeet-demo-cr` was added as a file snapshot in commit `992d4cf`; preservation of that source's earlier history is not established. No history was rewritten during the audit repair.
- `references/tdt-webgpu-demo`: The original Transformers.js Parakeet TDT WebGPU demo on Hugging Face Spaces.
- `references/tdt-webgpu-benchmark-lab`: The `feat/browser-benchmark-lab` exploration introducing target-duration benchmarking and sweet-spot simulation.
- `references/transformers-v4-parakeet-demo-cr`: Clean room variant using ONNX Runtime Web directly.
- `references/parakeet.js-benchmark`: Chart.js benchmark application with pivot analysis and compare table.
- `references/parakeet.js-demo`: Hugging Face Space parent/system theme integration and dark/light synchronization.
- `references/webgpu-whisper-v2`: WebGPU/WASM Whisper implementation.
- `references/vad-demo`: Standalone VAD prototype (now unified into `apps/realtime`).
- `references/firered-vad-web`: Standalone WebAssembly/WebGPU FireRedVAD demonstrator.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22+ (required by the pinned speech package)
- Modern Web browser with WebGPU support (Chrome 113+, Edge 113+, or Safari Technology Preview)

### Development
```bash
npm ci

# Launch Developer Playground
npm run dev:playground

# Launch Realtime & Neural VAD Workstation
npm run dev:realtime

# Launch Benchmark Workbench
npm run dev:benchmark

# Launch Flagship Showcase
npm run dev:showcase
```

### Production Build
```bash
# Build the central portal and all 4 applications
npm run build
npm run preview:suite

# Build independent app outputs instead
npm run build:apps

# Or build individual applications
npm run build:showcase
npm run build:playground
npm run build:realtime
npm run build:benchmark
```

### Speech Library Source Selection

Demo builds and development servers use the pinned `@asrjs/speech-recognition` package by default. After the repository-local `vendor/asrjs-speech-recognition-0.2.0.tgz` archive has been generated, run `npm install` to install it. Package mode resolves that installed package and does not read or alias a sibling source checkout.

To opt into a sibling source checkout while developing the library, set `ASRJS_SOURCE=source` and optionally `ASRJS_LIB_DIR` before starting Vite. For example, in PowerShell:

```powershell
$env:ASRJS_SOURCE = 'source'
$env:ASRJS_LIB_DIR = '..\speech-recognition'
npm run dev:realtime
```

Source builds report the source commit and a `-dirty` suffix when the checkout has uncommitted changes. Package builds report the installed package version and `npm-package` provenance.

The realtime app's `predev` and `prebuild` steps copy the installed ONNX Runtime Web WASM modules and binaries into `apps/realtime/public/ort/`. Vite emits these as app-local assets, so production runtime URLs follow the configured base path instead of pointing at a development filesystem path.

---

## 🌐 Hugging Face Spaces Deployment

Each app in `apps/*` can be deployed directly to a Hugging Face Static Space:
1. Set the Space SDK to **static**.
2. Run `npm run build:<app>`.
3. Copy the contents of `apps/<app>/dist` to your Hugging Face Space repository.
4. The applications automatically honor Hugging Face iframe theme changes via `?__theme=` and parent window messages.
