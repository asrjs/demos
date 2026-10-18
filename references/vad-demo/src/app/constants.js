export const SETTINGS_STORAGE_KEY = 'asrjs.streaming-demo.settings.v1';
export const LOCAL_MODEL_DB_NAME = 'asrjs-streaming-demo-local-model';
export const LOCAL_MODEL_STORE_NAME = 'handles';
export const LOCAL_MODEL_DIR_KEY = 'directory-handle';

export const MODEL_SOURCE_OPTIONS = {
  HUGGINGFACE: 'huggingface',
  LOCAL: 'local',
};

export const REALTIME_EOU_MODEL_ID = 'parakeet-realtime-eou-120m-v1';
export const MIC_MIN_UTTERANCE_MS = 250;

export const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
