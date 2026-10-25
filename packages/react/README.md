# React binding

This package is a local development build and has not been published to npm. Build it from the framework workspace before use.

`@asrjs/speech-recognition-react` connects the core controller to React's external store API.

```tsx
import { useSpeechRecognition } from "@asrjs/speech-recognition-react";
import type { SpeechController } from "@asrjs/speech-recognition/controller";

export function Transcript({ controller }: { controller: SpeechController }) {
  const { state } = useSpeechRecognition(controller);
  return (
    <p aria-live="polite">
      {state.result?.text ?? state.partial?.text ?? state.status}
    </p>
  );
}
```

Create and load the controller in your application. The hook subscribes for the component lifetime and removes that subscription when it unmounts. It does not load or dispose the controller. This keeps ownership explicit and works when several components read the same recognition state.

See [the React example](../../examples/react/) for model loading, file decoding, transcription and native streaming.

The peer range is React 18 or 19; this workspace tests React 19.3.1. The core package owns model loading, runtime work, transcript revisions and disposal. This package only adapts controller state to React.
