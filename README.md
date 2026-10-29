# Framework examples

React, Svelte and Vue bindings for `@asrjs/speech-recognition`.

| Package                             | API                                        | Example                                |
| ----------------------------------- | ------------------------------------------ | -------------------------------------- |
| [React](packages/react/README.md)   | `useSpeechRecognition(controller)`         | [File transcription](examples/react/)  |
| [Svelte](packages/svelte/README.md) | `createSpeechRecognitionStore(controller)` | [File transcription](examples/svelte/) |
| [Vue](packages/vue/README.md)       | `useSpeechRecognition(controller)`         | [File transcription](examples/vue/)    |

Published examples: [React](https://github.com/asrjs/demos/tree/framework-examples/examples/react), [Svelte](https://github.com/asrjs/demos/tree/framework-examples/examples/svelte), [Vue](https://github.com/asrjs/demos/tree/framework-examples/examples/vue).

Each binding subscribes to the same framework-neutral controller. Loading,
transcription, streaming and resource ownership stay in the core library.
The bindings add no model implementations or UI components.

Install from npm with the core package:

```sh
npm install @asrjs/speech-recognition @asrjs/speech-recognition-react   # or -svelte, -vue
```

The bindings require `@asrjs/speech-recognition` 0.3 or later.

## Run an example

Keep this workspace beside the `speech-recognition` and `demos` checkouts. The
framework sources live on the `framework-examples` branch of `asrjs/demos`.
Clone the three checkouts side by side, then install dependencies and build:

```sh
git clone --branch checkpoint/2026-w43-library https://github.com/asrjs/speech-recognition.git ../speech-recognition
git clone --branch checkpoint/2026-w43-demos https://github.com/asrjs/demos.git ../demos

npm --prefix ../speech-recognition ci
npm ci
npm --prefix ../demos ci
npm --prefix ../demos run build
npm run build:suite
npm run preview:suite
```

For example, place the directories as `speech-recognition/`, `demos/` and
`frameworks/` under one parent. Check out `framework-examples` in `frameworks` and `checkpoint/2026-w43-demos` in `demos`; this
workspace expects to be in its sibling `frameworks/` directory.

Open `http://127.0.0.1:4190/` for all seven applications. Keeping the hostname and port fixed lets them share the browser model cache. Standalone `dev:react`, `dev:svelte` and `dev:vue` commands use separate origins and therefore separate caches. Each example loads a model
only after you choose Load model. Model weights are not bundled and the selected
preset may fetch them. WebGPU support and WASM-compatible graphs depend on the
model. The examples share the companion suite's Keet colors and self-hosted font. See the core library's `docs/BROWSER_CACHE.md` for cache identity and cross-site limits.

## Use the controller

```ts
import { createSpeechController } from "@asrjs/speech-recognition/controller";
import { buildSpeechModelLoadOptions } from "@asrjs/speech-recognition";

const controller = createSpeechController();
await controller.load(
  buildSpeechModelLoadOptions({
    modelId: "parakeet-tdt-0.6b-v2",
    backend: "webgpu-hybrid",
  }),
);

// Pass a File, Blob or audio URL. The core prepares it for the loaded model.
await controller.transcribeSource(file);
// Or start capture from a user gesture, then stop when finished.
await controller.startMicrophone({
  config: { gateMode: "vad-only", vadBackend: "ten-vad", tenVadEnabled: true },
});
await controller.stopMicrophone();
await controller.dispose();
```

Read `controller.getSnapshot()` for load progress, the canonical result, the
current streaming revision and errors. Native streaming is available only when
`supportsStreaming` is true: call `startStreaming()`, await ordered
`pushAudio(pcm, sampleRate)` calls, then `finalizeStreaming()`.

The application which creates a controller disposes it. Bindings only remove
their own subscriptions. Several components can safely read the same controller.
Create a separate controller per application instance or server request; do not
share recognition state between SSR requests. Constructors do not load models
or request microphone access.

For capture, TEN-VAD and FireRed VAD, connect the core browser controller as shown
in the library's `examples/browser-microphone.ts`. These bindings do not select
an endpointing policy or request microphone permission themselves.

## Check changes

```sh
npm test
npm run typecheck
npm run build
```

The adapter tests cover subscriptions, React StrictMode/server rendering and
Vue scope teardown. They simulate controller state and are not real-model
accuracy tests. Real framework/compiler builds are checked separately.
