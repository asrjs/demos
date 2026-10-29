# ASRJS demo suite

Four browser workspaces for developing and using `@asrjs/speech-recognition`: explore models, test integrations, inspect live capture, and measure performance. They share one installed library, theme, model catalog and runtime helpers.

## The project

The goal is a practical speech recognition library for web, Node.js and Bun developers: offline inference with WebGPU and WASM, a consistent TypeScript API, and streaming where the model supports it. The demos are working examples and engineering workbenches for that library.

This project grows from working ports and experiments:

- Parakeet TDT was optimized in `parakeet.js`, carried through a Transformers.js fork, then integrated here with custom ONNX execution paths.
- Whisper Large v3 Turbo uses a purpose-built four-graph ONNX export to support browser execution.
- Browser workstations combine model streaming with TEN-VAD and FireRed-VAD, live waveform and speech-region views, and repeatable transcription and benchmark flows.

These are implementation lineage and current project capabilities; support and backend behavior still depend on each model descriptor and its tested artifacts. See the [library README](https://github.com/asrjs/speech-recognition) for installation, API, runtime selection and model integration. See its [architecture](https://github.com/asrjs/speech-recognition/blob/main/docs/architecture.md) and [workspace map](https://github.com/asrjs/speech-recognition/blob/main/docs/WORKSPACE_CONTEXT.md) for library design and project history.

## Choose a workspace

| Workspace | Use it to |
| --- | --- |
| [Showcase](apps/showcase) | Load audio and try supported models in the browser. |
| [Playground](apps/playground) | Inspect model options and transcript output; generate an integration example. |
| [Realtime](apps/realtime) | Exercise microphone capture, streaming, TEN-VAD and FireRed-VAD with waveform and speech-region views. |
| [Benchmark](apps/benchmark) | Run comparable measurements and inspect/export results. |

Every workspace follows the same theme and shared interface components. Their roles differ by task, while actual controls come from the library's model and runtime capabilities. A model loading successfully does not by itself establish transcription quality, streaming support or full WebGPU execution.

## Framework examples

Small React, Svelte and Vue bindings subscribe to the same library controller. Their example apps and package sources are available on the [`framework-examples` branch](https://github.com/asrjs/demos/tree/framework-examples): [React](https://github.com/asrjs/demos/tree/framework-examples/examples/react), [Svelte](https://github.com/asrjs/demos/tree/framework-examples/examples/svelte), [Vue](https://github.com/asrjs/demos/tree/framework-examples/examples/vue). The workspace README documents setup alongside the library and demo-suite checkouts.

The historical applications and experiments are retained in [`references/`](references/) where available. They are research and provenance sources; the four workspaces above are the current suite.

## Run locally

Use Node.js 22 or newer with npm. The apps install `@asrjs/speech-recognition` from npm, pinned by the lockfile. From this directory:

```sh
npm ci
npm run dev:showcase
```

Use `dev:playground`, `dev:realtime`, or `dev:benchmark` for another workspace. Available commands are listed in the root [`package.json`](package.json).

Build and preview the central suite:

```sh
npm run build
npm run preview:suite
```

Build each workspace independently with `npm run build:apps` or a `build:<workspace>` script. Run the suite checks with `npm test`.

## Use a library checkout while developing

By default, the suite uses its installed `@asrjs/speech-recognition` dependency. To develop against the sibling library checkout, choose source mode explicitly in PowerShell:

```powershell
$env:ASRJS_SOURCE = 'source'
$env:ASRJS_LIB_DIR = '..\speech-recognition'
npm run dev:realtime
```

Unset `ASRJS_SOURCE` to return to the installed package. Source and package provenance are shown by the suite at runtime. For dependency direction, theme conventions and app responsibilities, see [suite conventions](docs/suite-apps.md).
