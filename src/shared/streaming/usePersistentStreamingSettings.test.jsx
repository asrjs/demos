import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { usePersistentStreamingSettings } from './usePersistentStreamingSettings.js';

function Harness({ modelId, isRealtimeEouModel, onRender }) {
  const state = usePersistentStreamingSettings({ modelId, isRealtimeEouModel });
  onRender(state);
  return null;
}

describe('usePersistentStreamingSettings', () => {
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
    expect(stored.version).toBe(3);
    expect(stored.hudVisible).toBe(true);
    expect(stored.profileId).toBe('custom');
    expect(stored.customConfig.prerollMs).toBe(777);

    await act(async () => {
      root.unmount();
    });
  });

  it('migrates legacy energy thresholds to dBFS tuning values', async () => {
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

    expect(latest.resolvedConfig.minSpeechLevelDbfs).toBeCloseTo(-40, 0);

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
    expect(latest.resolvedConfig.minSpeechDurationMs).toBe(240);

    await act(async () => {
      root.unmount();
    });
  });
});
