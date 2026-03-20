export const STREAMING_PROFILE_IDS = {
  REALTIME_RNNT: 'realtime-rnnt',
  GENERIC_STREAMING: 'generic-streaming',
  AGGRESSIVE: 'aggressive',
  CONSERVATIVE: 'conservative',
  CUSTOM: 'custom',
};

const BASE_CONFIG = {
  sampleRate: 16000,
  ringBufferDurationMs: 8000,
  waveformPointCount: 180,
  analysisWindowMs: 80,
  energySmoothingWindows: 6,
  prerollMs: 600,
  minSpeechDurationMs: 240,
  minSilenceDurationMs: 800,
  maxSegmentDurationMs: 4000,
  minSpeechLevelDbfs: -38,
  useSnrGate: false,
  snrThreshold: 3.0,
  minSnrThreshold: 1.0,
  energyRiseThreshold: 0.08,
  maxOnsetLookbackChunks: 3,
  defaultOnsetLookbackChunks: 3,
  maxHistoryChunks: 20,
  initialNoiseFloor: 0.005,
  fastAdaptationRate: 0.15,
  slowAdaptationRate: 0.05,
  minBackgroundDurationSec: 1,
  levelWindowMs: 1000,
  tenVadEnabled: true,
  tenVadThreshold: 0.5,
  tenVadConfirmationWindowMs: 192,
  tenVadHangoverMs: 320,
};

export const STREAMING_PRESETS = {
  [STREAMING_PROFILE_IDS.REALTIME_RNNT]: {
    id: STREAMING_PROFILE_IDS.REALTIME_RNNT,
    label: 'Realtime RNNT',
    mode: 'speech-detect',
    config: {
      ...BASE_CONFIG,
      prerollMs: 680,
      minSilenceDurationMs: 820,
      maxSegmentDurationMs: 3600,
      snrThreshold: 3.2,
      tenVadThreshold: 0.55,
    },
  },
  [STREAMING_PROFILE_IDS.GENERIC_STREAMING]: {
    id: STREAMING_PROFILE_IDS.GENERIC_STREAMING,
    label: 'Generic Streaming',
    mode: 'speech-detect',
    config: {
      ...BASE_CONFIG,
      minSilenceDurationMs: 400,
    },
  },
  [STREAMING_PROFILE_IDS.AGGRESSIVE]: {
    id: STREAMING_PROFILE_IDS.AGGRESSIVE,
    label: 'Aggressive',
    mode: 'speech-detect',
    config: {
      ...BASE_CONFIG,
      prerollMs: 520,
      minSilenceDurationMs: 560,
      snrThreshold: 1.75,
      tenVadThreshold: 0.42,
      tenVadConfirmationWindowMs: 128,
    },
  },
  [STREAMING_PROFILE_IDS.CONSERVATIVE]: {
    id: STREAMING_PROFILE_IDS.CONSERVATIVE,
    label: 'Conservative',
    mode: 'speech-detect',
    config: {
      ...BASE_CONFIG,
      prerollMs: 800,
      minSilenceDurationMs: 1100,
      snrThreshold: 3.2,
      minSnrThreshold: 1.75,
      tenVadThreshold: 0.6,
      tenVadConfirmationWindowMs: 256,
      tenVadHangoverMs: 480,
    },
  },
};

export function resolveDefaultMicMode(isRealtimeEouModel) {
  return isRealtimeEouModel ? 'speech-detect' : 'manual';
}

export function resolveStreamingProfileId(isRealtimeEouModel) {
  return isRealtimeEouModel
    ? STREAMING_PROFILE_IDS.REALTIME_RNNT
    : STREAMING_PROFILE_IDS.GENERIC_STREAMING;
}

export function getStreamingPreset(profileId) {
  return STREAMING_PRESETS[profileId] ?? STREAMING_PRESETS[STREAMING_PROFILE_IDS.GENERIC_STREAMING];
}

export function listStreamingPresets() {
  return [
    STREAMING_PRESETS[STREAMING_PROFILE_IDS.REALTIME_RNNT],
    STREAMING_PRESETS[STREAMING_PROFILE_IDS.GENERIC_STREAMING],
    STREAMING_PRESETS[STREAMING_PROFILE_IDS.AGGRESSIVE],
    STREAMING_PRESETS[STREAMING_PROFILE_IDS.CONSERVATIVE],
  ];
}

export function mergeStreamingConfig(profileId, overrides = {}) {
  const normalizedOverrides = normalizeStreamingConfig(overrides);
  return {
    ...getStreamingPreset(profileId).config,
    ...normalizedOverrides,
  };
}

function normalizeStreamingConfig(config = {}) {
  if (
    typeof config?.energyThreshold === 'number' &&
    typeof config?.minSpeechLevelDbfs !== 'number'
  ) {
    return {
      ...config,
      minSpeechLevelDbfs: 20 * Math.log10(Math.max(config.energyThreshold, 0.000001)),
    };
  }
  return config;
}

export function isStreamingConfigEqual(left, right) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value]) => right?.[key] === value);
}
