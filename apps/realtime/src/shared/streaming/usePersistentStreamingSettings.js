import { useEffect, useMemo, useState } from 'react';
import {
  STREAMING_PROFILE_IDS,
  isStreamingConfigEqual,
  mergeStreamingConfig,
  resolveDefaultMicMode,
  resolveStreamingProfileId,
} from '@asrjs/speech-recognition/realtime';

const STORAGE_KEY = 'asrjs-streaming-demo-streaming-mic-settings';
const STORAGE_VERSION = 8;
const STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES = {
  tenVadEnabled: true,
};

function migrateStoredConfig(config) {
  if (!config || typeof config !== 'object') {
    return {};
  }
  const migrated = { ...config };
  if (
    typeof migrated.energyThreshold === 'number' &&
    typeof migrated.minSpeechLevelDbfs !== 'number'
  ) {
    migrated.minSpeechLevelDbfs = 20 * Math.log10(Math.max(migrated.energyThreshold, 0.000001));
  }
  if (
    migrated.gateMode === 'rough-and-ten-vad'
    || migrated.gateMode === 'ten-vad-only'
  ) {
    migrated.gateMode = 'rough-only';
  }
  delete migrated.foregroundMinDb;
  delete migrated.foregroundOnsetMinDb;
  delete migrated.foregroundOnsetWindowMs;
  delete migrated.foregroundShortSpeechMs;
  delete migrated.foregroundLongSpeechMs;
  delete migrated.foregroundLongExcessDbMs;
  delete migrated.foregroundLongMinDb;
  migrated.tenVadEnabled = STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES.tenVadEnabled;
  if (migrated.vadBackend === 'firered-vad') {
    delete migrated.vadHopDurationMs;
    delete migrated.vadVisualBucketDurationMs;
  }
  return migrated;
}

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (
      parsed.version !== STORAGE_VERSION
      && parsed.version !== 7
      && parsed.version !== 6
      && parsed.version !== 5
      && parsed.version !== 4
      && parsed.version !== 3
      && parsed.version !== 2
    ) {
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
  const [customConfig, setCustomConfig] = useState(
    stored?.customConfig ?? STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES,
  );

  const resolvedConfig = useMemo(() => {
    if (profileId === STREAMING_PROFILE_IDS.CUSTOM) {
      return mergeStreamingConfig(defaultProfileId, customConfig);
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
    setCustomConfig(STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES);
  }

  function updateConfig(patch) {
    const nextConfig = {
      ...resolvedConfig,
      ...patch,
    };
    if (
      Object.prototype.hasOwnProperty.call(patch, 'vadBackend')
      && !Object.prototype.hasOwnProperty.call(patch, 'vadHopDurationMs')
    ) {
      delete nextConfig.vadHopDurationMs;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'vadBackend')
      && !Object.prototype.hasOwnProperty.call(patch, 'vadVisualBucketDurationMs')
    ) {
      delete nextConfig.vadVisualBucketDurationMs;
    }
    const activePresetConfig =
      profileId === STREAMING_PROFILE_IDS.CUSTOM
        ? mergeStreamingConfig(defaultProfileId, STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES)
        : mergeStreamingConfig(profileId, STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES);

    if (isStreamingConfigEqual(nextConfig, activePresetConfig)) {
      setCustomConfig(STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES);
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
    setCustomConfig(STREAMING_DEMO_DEFAULT_CONFIG_OVERRIDES);
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
