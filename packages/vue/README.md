# @asrjs/speech-recognition-vue

Vue 3 composable for the framework-neutral speech controller.

This package is available in the repository workspace and is not published to npm yet. To use it locally, install from `frameworks/` and build the core package and framework packages:

```sh
cd frameworks
npm install
npm run build:core
npm run build:packages
```

```ts
import { createSpeechController } from "@asrjs/speech-recognition/controller";
import { useSpeechRecognition } from "@asrjs/speech-recognition-vue";

const controller = createSpeechController();
const { state } = useSpeechRecognition(controller);
```

Call the composable inside `setup()` or `<script setup>`. It subscribes to immutable controller snapshots and removes that subscription when its Vue effect scope ends. The component or app that created the controller owns `controller.dispose()`.

See [`examples/vue`](../../examples/vue) for a complete file transcription app.
