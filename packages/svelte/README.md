# @asrjs/speech-recognition-svelte

Svelte readable-store adapter for the framework-neutral speech controller.

This package is available in the repository workspace and is not published to npm yet. To use it locally, install from `frameworks/` and build the core package and framework packages:

```sh
cd frameworks
npm install
npm run build:core
npm run build:packages
```

```ts
import { createSpeechController } from "@asrjs/speech-recognition/controller";
import { createSpeechRecognitionStore } from "@asrjs/speech-recognition-svelte";

const controller = createSpeechController();
const recognition = createSpeechRecognitionStore(controller);
```

Use the store in a Svelte component with `$recognition`. The controller owns model loading and inference. The store adapter only maps its immutable snapshots to Svelte's store contract. The caller owns and disposes the controller; disposing a store subscription only unsubscribes that listener.

See [`examples/svelte`](../../examples/svelte) for a complete file transcription app.
