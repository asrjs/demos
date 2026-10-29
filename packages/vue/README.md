# @asrjs/speech-recognition-vue

Vue composable for [`@asrjs/speech-recognition`](https://www.npmjs.com/package/@asrjs/speech-recognition): local speech recognition in the browser with WebGPU and WASM.

```sh
npm install @asrjs/speech-recognition @asrjs/speech-recognition-vue
```

## Usage

Create one controller, then read its state inside `setup()` or `<script setup>`.

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { createSpeechController } from '@asrjs/speech-recognition/controller';
import { useSpeechRecognition } from '@asrjs/speech-recognition-vue';

const controller = createSpeechController();
const { state } = useSpeechRecognition(controller);

onMounted(() => {
  void controller.load({ modelId: 'parakeet-tdt-0.6b-v3', backend: 'webgpu-hybrid' });
});
onBeforeUnmount(() => void controller.dispose());

function transcribe(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void controller.transcribeSource(file);
}
</script>

<template>
  <input type="file" accept="audio/*" :disabled="state.status !== 'ready'" @change="transcribe" />
  <p aria-live="polite">{{ state.result?.text ?? state.partial?.text ?? state.status }}</p>
</template>
```

`useSpeechRecognition(controller)` returns `{ state, controller }`. `state` is a shallow ref of the controller's immutable snapshot: `status`, `progress`, `loadWarnings`, `result`, `partial`, `error` and `supportsStreaming`.

The subscription ends with the current effect scope. It never disposes the controller, so several components can share one model. Dispose the controller where you created it.

## Requirements

- Vue 3.5 or later.
- `@asrjs/speech-recognition` 0.3 or later.

A full example is in [`examples/vue`](https://github.com/asrjs/demos/tree/framework-examples/examples/vue). Model loading, backends and transcript formats are documented in the [core library](https://github.com/asrjs/speech-recognition#readme).
