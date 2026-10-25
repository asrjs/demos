import {
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  type ShallowRef,
} from "vue";
import type {
  SpeechController,
  SpeechControllerSnapshot,
} from "@asrjs/speech-recognition/controller";

export interface SpeechRecognitionState<
  TController extends SpeechController = SpeechController,
> {
  readonly state: ShallowRef<SpeechControllerSnapshot>;
  /** The controller remains owned by the code which created it. */
  readonly controller: TController;
}

/** Subscribes in the current Vue scope and removes only that subscription on teardown. */
export function useSpeechRecognition<TController extends SpeechController>(
  controller: TController,
): SpeechRecognitionState<TController> {
  if (!getCurrentScope()) {
    throw new Error(
      "useSpeechRecognition must be called in a Vue component or effect scope.",
    );
  }
  const state = shallowRef(controller.getSnapshot());
  const unsubscribe = controller.subscribe(() => {
    state.value = controller.getSnapshot();
  });
  onScopeDispose(unsubscribe);
  return { state, controller };
}
