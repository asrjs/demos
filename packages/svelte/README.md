# @asrjs/speech-recognition-svelte

Svelte store for [`@asrjs/speech-recognition`](https://www.npmjs.com/package/@asrjs/speech-recognition): local speech recognition in the browser with WebGPU and WASM.

```sh
npm install @asrjs/speech-recognition @asrjs/speech-recognition-svelte
```

## Usage

Create one controller, wrap it in a store, and read it with `$`.

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createSpeechController } from '@asrjs/speech-recognition/controller';
  import { createSpeechRecognitionStore } from '@asrjs/speech-recognition-svelte';

  const controller = createSpeechController();
  const recognition = createSpeechRecognitionStore(controller);

  onMount(() => {
    void controller.load({ modelId: 'parakeet-tdt-0.6b-v3', backend: 'webgpu-hybrid' });
  });
  onDestroy(() => void controller.dispose());

  function transcribe(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void controller.transcribeSource(file);
  }
</script>

<input type="file" accept="audio/*" disabled={$recognition.status !== 'ready'} onchange={transcribe} />
<p aria-live="polite">{$recognition.result?.text ?? $recognition.partial?.text ?? $recognition.status}</p>
```

`createSpeechRecognitionStore(controller)` returns a readable store of the controller's immutable snapshot: `status`, `progress`, `loadWarnings`, `result`, `partial`, `error` and `supportsStreaming`. The store also exposes `controller`.

Unsubscribing only removes that listener. It never disposes the controller, so several components can share one model. Dispose the controller where you created it.

## Requirements

- Svelte 5.
- `@asrjs/speech-recognition` 0.3 or later.

A full example is in [`examples/svelte`](https://github.com/asrjs/demos/tree/framework-examples/examples/svelte). Model loading, backends and transcript formats are documented in the [core library](https://github.com/asrjs/speech-recognition#readme).
