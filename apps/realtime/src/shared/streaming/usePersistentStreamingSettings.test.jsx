import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getStreamingPreset,
  STREAMING_VAD_BACKENDS,
} from '@asrjs/speech-recognition/realtime';
import { usePersistentStreamingSettings } from './usePersistentStreamingSettings.js';

function Harness({ modelId, isRealtimeEouModel, onRender }) {
  const state = usePersistentStreamingSettings({ modelId, isRealtimeEouModel });
  onRender(state);
  return null;
}

function installTestLocalStorage() {
  const store = new Map();
  const storage = {
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    removeItem(key) {
      store.delete(String(key));
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

describe('usePersistentStreamingSettings', () => {
  const realtimeRnntDefaults = getStreamingPreset('realtime-rnnt').config;

  beforeEach(() => {
    installTestLocalStorage();
  });

  it('persists HUD visibility and custom config in localStorage', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    const container = document.createElement('div');
    const root = createRoot(container);
    let latest = null;

    await act(async () => {
      root.render(
        <Harness
          modelId="parakeet-realtime-eou-120m-v1"
          isRealtimeEouModel
          onRender={(value) => {
            latest = value;
          }}
        />,
      );
    });

    await act(async () => {
      latest.setHudVisible(true);
      latest.updateConfig({ prerollMs: 777 });
    });

    const stored = JSON.parse(localStorage.getItem('asrjs-streaming-demo-streaming-mic-settings'));
    expect(stored.version).toBe(8);
    expect(stored.hudVisible).toBe(true);
    expect(stored.profileId).toBe('custom');
    expect(stored.customConfig.prerollMs).toBe(777);

    await act(async () => {
      root.unmount();
    });
  });

  it('migrates legacy gate settings to the new acceptance schema', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem(
      'asrjs-streaming-demo-streaming-mic-settings',
      JSON.stringify({
        version: 2,
        micMode: 'speech-detect',
        hudVisible: true,
        profileId: 'custom',
        customConfig: {
          energyThreshold: 0.01,
          gateMode: 'ten-vad-only',
          foregroundLongMinDb: 6,
        },
      }),
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    let latest = null;

    await act(async () => {
      root.render(
        <Harness
          modelId="parakeet-realtime-eou-120m-v1"
          isRealtimeEouModel
          onRender={(value) => {
            latest = value;
          }}
        />,
      );
    });

    expect(latest.resolvedConfig.energyThreshold).toBe(0.01);
    expect(latest.resolvedConfig.minSpeechLevelDbfs).toBeCloseTo(-40, 0);
    expect(latest.resolvedConfig.gateMode).toBe('rough-only');
    expect(latest.resolvedConfig.tenVadEnabled).toBe(true);
    expect('foregroundLongMinDb' in latest.resolvedConfig).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('reenables VAD diagnostics and drops stale FireRed timing from stored settings', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem(
      'asrjs-streaming-demo-streaming-mic-settings',
      JSON.stringify({
        version: 7,
        micMode: 'speech-detect',
        hudVisible: true,
        profileId: 'custom',
        customConfig: {
          tenVadEnabled: false,
          vadBackend: STREAMING_VAD_BACKENDS.FIRERED_VAD,
          vadHopDurationMs: 16,
          vadVisualBucketDurationMs: 16,
        },
      }),
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    let latest = null;

    await act(async () => {
      root.render(
        <Harness
          modelId="parakeet-realtime-eou-120m-v1"
          isRealtimeEouModel
          onRender={(value) => {
            latest = value;
          }}
        />,
      );
    });

    expect(latest.resolvedConfig.tenVadEnabled).toBe(true);
    expect(latest.resolvedConfig.vadHopDurationMs).toBe(10);
    expect(latest.resolvedConfig.vadVisualBucketDurationMs).toBe(20);

    await act(async () => {
      root.unmount();
    });
  });

  it('ignores stale stored settings from an older schema version', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem(
      'asrjs-streaming-demo-streaming-mic-settings',
      JSON.stringify({
        version: 1,
        micMode: 'speech-detect',
        hudVisible: true,
        profileId: 'custom',
        customConfig: {
          minSpeechDurationMs: 96,
        },
      }),
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    let latest = null;

    await act(async () => {
      root.render(
        <Harness
          modelId="parakeet-realtime-eou-120m-v1"
          isRealtimeEouModel
          onRender={(value) => {
            latest = value;
          }}
        />,
      );
    });

    expect(latest.profileId).toBe('realtime-rnnt');
    expect(latest.resolvedConfig.minSpeechDurationMs).toBe(
      realtimeRnntDefaults.minSpeechDurationMs,
    );
    expect(latest.resolvedConfig.tenVadEnabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('re-derives backend-specific VAD frame sizes when switching backends', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    const container = document.createElement('div');
    const root = createRoot(container);
    let latest = null;

    await act(async () => {
      root.render(
        <Harness
          modelId="parakeet-realtime-eou-120m-v1"
          isRealtimeEouModel
          onRender={(value) => {
            latest = value;
          }}
        />,
      );
    });

    expect(latest.resolvedConfig.vadBackend).toBe(STREAMING_VAD_BACKENDS.FIRERED_VAD);
    expect(latest.resolvedConfig.vadHopDurationMs).toBe(10);
    expect(latest.resolvedConfig.vadVisualBucketDurationMs).toBe(20);

    await act(async () => {
      latest.updateConfig({ vadBackend: STREAMING_VAD_BACKENDS.TEN_VAD });
    });

    expect(latest.resolvedConfig.vadBackend).toBe(STREAMING_VAD_BACKENDS.TEN_VAD);
    expect(latest.resolvedConfig.vadHopDurationMs).toBe(latest.resolvedConfig.chunkDurationMs);
    expect(latest.resolvedConfig.vadVisualBucketDurationMs).toBe(latest.resolvedConfig.chunkDurationMs);

    await act(async () => {
      latest.updateConfig({ vadBackend: STREAMING_VAD_BACKENDS.FIRERED_VAD });
    });

    expect(latest.resolvedConfig.vadBackend).toBe(STREAMING_VAD_BACKENDS.FIRERED_VAD);
    expect(latest.resolvedConfig.vadHopDurationMs).toBe(10);
    expect(latest.resolvedConfig.vadVisualBucketDurationMs).toBe(20);

    await act(async () => {
      root.unmount();
    });
  });
});
