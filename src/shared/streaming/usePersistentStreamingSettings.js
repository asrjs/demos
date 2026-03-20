import { useEffect, useMemo, useState } from 'react';
import {
  STREAMING_PROFILE_IDS,
  getStreamingPreset,
  isStreamingConfigEqual,
  mergeStreamingConfig,
  resolveDefaultMicMode,
  resolveStreamingProfileId,
} from '@asrjs/speech-recognition/realtime';

const STORAGE_KEY = 'asrjs-streaming-demo-streaming-mic-settings';
const STORAGE_VERSION = 3;

function migrateStoredConfig(config) {
  if (!config || typeof config !== 'object') {
    return {};
  }
  if (
    typeof config.energyThreshold === 'number' &&
    typeof config.minSpeechLevelDbfs !== 'number'
  ) {
    return {
      ...config,
      minSpeechLevelDbfs: 20 * Math.log10(Math.max(config.energyThreshold, 0.000001)),
    };
  }
  return config;
}

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (parsed.version !== STORAGE_VERSION && parsed.version !== 2) {
      return null;
    }
    return {
      ...parsed,
      version: STORAGE_VERSION,
      customConfig: migrateStoredConfig(parsed.customConfig),
    };
  } catch {
    return null;
  }
}

function saveStoredSettings(value) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        ...value,
      }),
    );
  } catch {
    // ignore storage failures
  }
}

export function usePersistentStreamingSettings({ modelId, isRealtimeEouModel }) {
  const defaultProfileId = resolveStreamingProfileId(isRealtimeEouModel);
  const defaultMode = resolveDefaultMicMode(isRealtimeEouModel);
  const stored = useMemo(() => loadStoredSettings(), []);

  const [micMode, setMicMode] = useState(stored?.micMode ?? defaultMode);
  const [hudVisible, setHudVisible] = useState(Boolean(stored?.hudVisible));
  const [profileId, setProfileId] = useState(stored?.profileId ?? defaultProfileId);
  const [customConfig, setCustomConfig] = useState(stored?.customConfig ?? {});

  const resolvedConfig = useMemo(() => {
    if (profileId === STREAMING_PROFILE_IDS.CUSTOM) {
      return {
        ...mergeStreamingConfig(defaultProfileId),
        ...customConfig,
      };
    }
    return mergeStreamingConfig(profileId, customConfig);
  }, [customConfig, defaultProfileId, profileId]);

  useEffect(() => {
    saveStoredSettings({
      modelId,
      micMode,
      hudVisible,
      profileId,
      customConfig,
    });
  }, [customConfig, hudVisible, micMode, modelId, profileId]);

  function applyPreset(nextProfileId) {
    setProfileId(nextProfileId);
    setCustomConfig({});
  }

  function updateConfig(patch) {
    const nextConfig = {
      ...resolvedConfig,
      ...patch,
    };
    const activePresetConfig =
      profileId === STREAMING_PROFILE_IDS.CUSTOM
        ? mergeStreamingConfig(defaultProfileId)
        : getStreamingPreset(profileId).config;

    if (isStreamingConfigEqual(nextConfig, activePresetConfig)) {
      setCustomConfig({});
      if (profileId === STREAMING_PROFILE_IDS.CUSTOM) {
        setProfileId(defaultProfileId);
      }
      return;
    }

    setProfileId(STREAMING_PROFILE_IDS.CUSTOM);
    setCustomConfig(nextConfig);
  }

  function resetToDefaults() {
    setMicMode(defaultMode);
    setProfileId(defaultProfileId);
    setCustomConfig({});
    setHudVisible(false);
  }

  return {
    micMode,
    setMicMode,
    hudVisible,
    setHudVisible,
    profileId,
    setProfileId,
    resolvedConfig,
    applyPreset,
    updateConfig,
    resetToDefaults,
    defaultProfileId,
    defaultMode,
  };
}
