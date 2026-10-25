import type { Readable } from "svelte/store";
import type {
  SpeechController,
  SpeechControllerSnapshot,
} from "@asrjs/speech-recognition/controller";

export interface SpeechRecognitionStore<
  TController extends SpeechController = SpeechController,
> extends Readable<SpeechControllerSnapshot> {
  /** The controller remains owned by the code which created it. */
  readonly controller: TController;
}

/** Adapts one framework-neutral controller to Svelte's readable store contract. */
export function createSpeechRecognitionStore<
  TController extends SpeechController,
>(controller: TController): SpeechRecognitionStore<TController> {
  return {
    controller,
    subscribe(run) {
      const unsubscribe = controller.subscribe(() =>
        run(controller.getSnapshot()),
      );
      try {
        run(controller.getSnapshot());
      } catch (error) {
        unsubscribe();
        throw error;
      }
      return unsubscribe;
    },
  };
}
