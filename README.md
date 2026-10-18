# ASRJS Companion Demos Suite (`@asrjs/demos`)

Unified companion demo applications, benchmarks, and interactive workstations for **[@asrjs/speech-recognition](https://github.com/asrjs/speech-recognition)**.

---

## 🏛 Apps Architecture

All active applications live under `apps/` and share a cohesive **ASRJS Slate-Blue Console** design system, full Light/Dark theming with automatic Hugging Face Space `?__theme=` synchronization, and zero-dependency interactive SVG visualizers.

```
demos/
├── apps/
│   ├── showcase/     # Flagship multilingual transcription & Canary AST translation showcase
│   ├── playground/   # 16-family universal catalog, live code snippet generator, and stateful streaming stepper
│   ├── realtime/     # Realtime microphone, neural VAD (FireRedVAD & TEN-VAD) lab, and subtitle workstation
│   └── benchmark/    # Multi-family benchmarking, long-form sweet-spot planner, 8 SVG charts, and snapshot comparison
├── packages/
│   └── ui/           # Shared @asrjs/demo-ui (theme, word pills, SVG charts, subtitle export, WER/CER math)
├── references/       # Historical, pioneering & reference demo implementations preserved with git history
└── vite.shared.js    # Shared Vite configuration (COOP/COEP, worker format: 'es', dynamic @asrjs aliases)
```

### 1. Flagship Showcase (`apps/showcase`)
- **Origin**: `asrjs/browser-demo` & `ysdede/transformers-v4-parakeet-demo`
- **Purpose**: Production-ready, client-side multilingual transcription and speech translation.
- **Key Features**:
  - Full Hugging Face dataset sampler (JFK, LibriSpeech, MInDS-14, FLEURS)
  - Canary-1B Speech-to-Text and Speech Translation (AST)
  - Interactive click-to-seek word timestamp pills
  - SRT / VTT / JSON transcription history export

### 2. Developer Playground (`apps/playground`)
- **Origin**: `asrjs/playground`
- **Purpose**: Developer workbench for exploring model architectures, inspecting envelopes, and generating ready-to-run code.
- **Key Features**:
  - **Universal Catalog Mode**: dynamically loads any of the 16 supported model families via `loadBuiltInSpeechModel()`
  - **Live Code Snippet Panel**: generates copy-paste ready TypeScript/JavaScript code for the selected model, backend, and options
  - **Stateful Streaming Stepper**: simulates audio chunk streaming via `createStreamingTranscriber()` with step-by-step latency tracking
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

The `references/` directory preserves the complete commit histories and pioneering design patterns from previous explorations:
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
- Node.js 18+ or 20+
- Modern Web browser with WebGPU support (Chrome 113+, Edge 113+, or Safari Technology Preview)

### Development
```bash
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
# Build all 4 applications
npm run build

# Or build individual applications
npm run build:showcase
npm run build:playground
npm run build:realtime
npm run build:benchmark
```

---

## 🌐 Hugging Face Spaces Deployment

Each app in `apps/*` can be deployed directly to a Hugging Face Static Space:
1. Set the Space SDK to **static**.
2. Run `npm run build:<app>`.
3. Copy the contents of `apps/<app>/dist` to your Hugging Face Space repository.
4. The applications automatically honor Hugging Face iframe theme changes via `?__theme=` and parent window messages.
