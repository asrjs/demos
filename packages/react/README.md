# @asrjs/speech-recognition-react

React bindings for [`@asrjs/speech-recognition`](https://www.npmjs.com/package/@asrjs/speech-recognition): local speech recognition in the browser with WebGPU and WASM.

```sh
npm install @asrjs/speech-recognition @asrjs/speech-recognition-react
```

## Usage

Create one controller, load a model, and read its state from any component.

```tsx
import { useEffect, useState } from 'react';
import { createSpeechController } from '@asrjs/speech-recognition/controller';
import { useSpeechRecognition } from '@asrjs/speech-recognition-react';

export function App() {
  const [controller] = useState(createSpeechController);
  const { state } = useSpeechRecognition(controller);

  useEffect(() => {
    void controller.load({ modelId: 'parakeet-tdt-0.6b-v3', backend: 'webgpu-hybrid' });
    return () => void controller.dispose();
  }, [controller]);

  return (
    <>
      <input
        type="file"
        accept="audio/*"
        disabled={state.status !== 'ready'}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void controller.transcribeSource(file);
        }}
      />
      <p aria-live="polite">{state.result?.text ?? state.partial?.text ?? state.status}</p>
    </>
  );
}
```

`useSpeechRecognition(controller)` returns `{ state, controller }`. `state` is the controller's immutable snapshot: `status`, `progress`, `loadWarnings`, `result`, `partial`, `error` and `supportsStreaming`.

The hook only subscribes. It never loads or disposes the controller, so several components can share one model. Dispose the controller where you created it.

## Requirements

- React 18 or 19.
- `@asrjs/speech-recognition` 0.3 or later.

A full example with file decoding, progress and native streaming is in [`examples/react`](https://github.com/asrjs/demos/tree/framework-examples/examples/react). Model loading, backends and transcript formats are documented in the [core library](https://github.com/asrjs/speech-recognition#readme).
