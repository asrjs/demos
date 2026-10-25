import { useCallback, useSyncExternalStore } from "react";
import type {
  SpeechController,
  SpeechControllerSnapshot,
} from "@asrjs/speech-recognition/controller";

export interface SpeechRecognitionBinding<
  TController extends SpeechController = SpeechController,
> {
  readonly state: SpeechControllerSnapshot;
  /** The controller remains owned by the code which created it. */
  readonly controller: TController;
}

/** Subscribes React to one framework-neutral ASR controller. */
export function useSpeechRecognition<TController extends SpeechController>(
  controller: TController,
): SpeechRecognitionBinding<TController> {
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { state, controller };
}
