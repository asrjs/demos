import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { act, createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { effect, effectScope } from "vue";
import type {
  SpeechController,
  SpeechControllerSnapshot,
  MicrophoneSpeechController,
} from "@asrjs/speech-recognition/controller";
import { useSpeechRecognition as useReactSpeech } from "../packages/react/src/index.js";
import { createSpeechRecognitionStore } from "../packages/svelte/src/index.js";
import { useSpeechRecognition as useVueSpeech } from "../packages/vue/src/index.js";

function assertControllerCapabilitiesArePreserved(
  controller: MicrophoneSpeechController,
) {
  expectTypeOf(
    useReactSpeech(controller).controller,
  ).toEqualTypeOf<MicrophoneSpeechController>();
  expectTypeOf(
    createSpeechRecognitionStore(controller).controller,
  ).toEqualTypeOf<MicrophoneSpeechController>();
  expectTypeOf(
    useVueSpeech(controller).controller,
  ).toEqualTypeOf<MicrophoneSpeechController>();
}

void assertControllerCapabilitiesArePreserved;

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
});

function fixture() {
  let snapshot: SpeechControllerSnapshot = Object.freeze({
    status: "idle",
    modelId: null,
    progress: null,
    result: null,
    partial: null,
    error: null,
    supportsStreaming: false,
  });
  const listeners = new Set<() => void>();
  // Adapter contract simulation; this fixture performs no model inference.
  const controller = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: vi.fn(),
  } as unknown as SpeechController;
  return {
    controller,
    listeners,
    publish(status: SpeechControllerSnapshot["status"]) {
      snapshot = Object.freeze({ ...snapshot, status });
      for (const listener of [...listeners]) listener();
    },
  };
}

describe("thin framework bindings", () => {
  it("React renders on the server without subscribing or taking model ownership", () => {
    const f = fixture();
    function View() {
      const { state } = useReactSpeech(f.controller);
      return createElement("p", null, state.status);
    }
    expect(renderToString(createElement(View))).toBe("<p>idle</p>");
    expect(f.listeners.size).toBe(0);
    expect(f.controller.dispose).not.toHaveBeenCalled();
  });

  it("React survives StrictMode, switches controllers, and releases only subscriptions", async () => {
    const first = fixture();
    const second = fixture();
    function View({ controller }: { controller: SpeechController }) {
      const { state } = useReactSpeech(controller);
      return createElement("p", null, state.status);
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(View, { controller: first.controller }),
        ),
      );
    });
    expect(first.listeners.size).toBe(1);
    await act(async () => {
      first.publish("loading");
    });
    expect(container.textContent).toBe("loading");
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(View, { controller: second.controller }),
        ),
      );
    });
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(1);
    await act(async () => {
      first.publish("error");
      second.publish("ready");
    });
    expect(container.textContent).toBe("ready");
    await act(async () => {
      root.unmount();
    });
    container.remove();
    expect(second.listeners.size).toBe(0);
    expect(first.controller.dispose).not.toHaveBeenCalled();
    expect(second.controller.dispose).not.toHaveBeenCalled();
  });

  it("Svelte gives each subscriber the current snapshot and keeps ownership with the caller", () => {
    const f = fixture();
    const store = createSpeechRecognitionStore(f.controller);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(first);
    expect(first).toHaveBeenLastCalledWith(f.controller.getSnapshot());
    f.publish("loading");
    const unsubscribeSecond = store.subscribe(second);
    expect(second).toHaveBeenLastCalledWith(f.controller.getSnapshot());
    unsubscribeFirst();
    const previous = first.mock.calls.length;
    f.publish("ready");
    expect(first.mock.calls.length).toBe(previous);
    expect(second).toHaveBeenLastCalledWith(f.controller.getSnapshot());
    unsubscribeSecond();
    expect(f.listeners.size).toBe(0);
    expect(f.controller.dispose).not.toHaveBeenCalled();
  });

  it("Vue follows snapshots and unsubscribes when its scope stops", () => {
    const f = fixture();
    const scope = effectScope();
    let status = "";
    scope.run(() => {
      const { state, controller } = useVueSpeech(f.controller);
      expect(controller).toBe(f.controller);
      effect(() => {
        status = state.value.status;
      });
    });
    expect(status).toBe("idle");
    f.publish("loading");
    expect(status).toBe("loading");
    scope.stop();
    expect(f.listeners.size).toBe(0);
    f.publish("ready");
    expect(status).toBe("loading");
    expect(f.controller.dispose).not.toHaveBeenCalled();
  });

  it("Svelte does not miss a change triggered by the initial subscriber", () => {
    const f = fixture();
    const states: string[] = [];
    const unsubscribe = createSpeechRecognitionStore(f.controller).subscribe(
      (state) => {
        states.push(state.status);
        if (state.status === "idle") f.publish("ready");
      },
    );
    expect(states).toEqual(["idle", "ready"]);
    unsubscribe();
    expect(f.listeners.size).toBe(0);
  });

  it("Vue rejects use outside a component or effect scope without leaking a listener", () => {
    const f = fixture();
    expect(() => useVueSpeech(f.controller)).toThrow(
      /component or effect scope/,
    );
    expect(f.listeners.size).toBe(0);
  });

  it("Svelte removes the listener if the initial subscriber throws", () => {
    const f = fixture();
    const failure = new Error("view failed");
    expect(() =>
      createSpeechRecognitionStore(f.controller).subscribe(() => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(f.listeners.size).toBe(0);
    expect(f.controller.dispose).not.toHaveBeenCalled();
  });
});
