import { useEffect, useState } from 'react';
import {
  clearPersistedDirectoryHandle,
  persistDirectoryHandle,
  readPersistedDirectoryHandle,
  supportsDirectoryHandlePersistence,
} from './localModelStorage.js';
import {
  buildLocalFolderSelection,
  createLocalFolderEntriesFromFiles,
  getLocalFolderNameFromEntries,
} from './localFolderHelpers.js';
import {
  collectSpeechModelLocalEntries,
} from '@asrjs/speech-recognition/browser';
import { getDemoModelLoadingState } from '@asrjs/demo-runtime';
import { MODEL_SOURCE_OPTIONS } from './constants.js';

export function useLocalModelFolder({
  modelSource,
  selectedModel,
  backend,
  encoderBackend,
  decoderBackend,
  preprocessorBackend,
  currentPreprocessor,
  currentEncoderQuant,
  currentDecoderQuant,
  modelFolderInputRef,
  setStatus,
  setEncoderQuantOptions,
  setDecoderQuantOptions,
  setEncoderQuant,
  setDecoderQuant,
  setEncoderBackend,
  setDecoderBackend,
  setPreprocessor,
  setPreprocessorBackend,
}) {
  const [localEntries, setLocalEntries] = useState([]);
  const [localFolderName, setLocalFolderName] = useState('');
  const [hasPersistedLocalHandle, setHasPersistedLocalHandle] = useState(false);
  const [needsLocalHandleReconnect, setNeedsLocalHandleReconnect] = useState(false);
  const [localHandlePersistenceSupported] = useState(() => supportsDirectoryHandlePersistence());
  const [localTokenizerOptions, setLocalTokenizerOptions] = useState(['vocab.txt']);
  const [localTokenizerName, setLocalTokenizerName] = useState('vocab.txt');
  const [localPreprocessorOptions, setLocalPreprocessorOptions] = useState([]);
  const [localDetectedArtifacts, setLocalDetectedArtifacts] = useState({
    encoder: [], decoder: [], tokenizers: [], preprocessors: [],
  });

  function applyLocalEntries(entries, folderName = '') {
    const loadingState = getDemoModelLoadingState({
      modelId: selectedModel,
      source: modelSource,
      entries,
      backend,
      encoderBackend,
      decoderBackend,
      encoderQuant: currentEncoderQuant,
      decoderQuant: currentDecoderQuant,
    });
    const selection = buildLocalFolderSelection(entries, {
      loadingState,
      selectedModel,
      modelSource,
      backend,
      currentEncoderQuant,
      currentDecoderQuant,
      currentTokenizerName: localTokenizerName,
      currentPreprocessor,
      currentPreprocessorBackend: preprocessorBackend,
    });

    console.log('[LocalFolder] Parsing selected local folder entries…', {
      count: entries.length,
      folderName,
    });
    setLocalEntries(entries);
    setLocalFolderName(folderName);
    setEncoderQuantOptions(selection.encoderQuantOptions);
    setDecoderQuantOptions(selection.decoderQuantOptions);
    setEncoderQuant(selection.encoderQuant);
    setDecoderQuant(selection.decoderQuant);
    setEncoderBackend(selection.encoderBackend);
    setDecoderBackend(selection.decoderBackend);
    setLocalTokenizerOptions(selection.localTokenizerOptions);
    setLocalTokenizerName(selection.localTokenizerName);
    setLocalPreprocessorOptions(selection.localPreprocessorOptions);
    setPreprocessor(selection.preprocessor);
    setPreprocessorBackend(selection.preprocessorBackend);
    setLocalDetectedArtifacts(selection.localDetectedArtifacts);
    setStatus(selection.status);
  }

  // Reinspect only when source/model/backend policy changes, not on every setter render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!localEntries.length) return;
    applyLocalEntries(localEntries, localFolderName);
  }, [selectedModel, backend, modelSource]);

  async function restorePersistedLocalFolder({ requestPermission = false } = {}) {
    if (!localHandlePersistenceSupported) return false;
    try {
      const dirHandle = await readPersistedDirectoryHandle();
      if (!dirHandle) {
        setHasPersistedLocalHandle(false);
        setNeedsLocalHandleReconnect(false);
        return false;
      }

      setHasPersistedLocalHandle(true);
      const queryState = typeof dirHandle.queryPermission === 'function'
        ? await dirHandle.queryPermission({ mode: 'read' })
        : 'granted';

      let permissionState = queryState;
      if (permissionState !== 'granted' && requestPermission && typeof dirHandle.requestPermission === 'function') {
        permissionState = await dirHandle.requestPermission({ mode: 'read' });
      }

      if (permissionState !== 'granted') {
        setNeedsLocalHandleReconnect(true);
        console.log('[LocalFolder] Persisted folder found but permission is not granted yet');
        return false;
      }

      console.log('[LocalFolder] Restoring persisted directory handle', { name: dirHandle.name });
      const entries = await collectSpeechModelLocalEntries(dirHandle);
      applyLocalEntries(entries, dirHandle.name || '');
      setNeedsLocalHandleReconnect(false);
      setStatus(`Restored local folder "${dirHandle.name || ''}"`);
      return true;
    } catch (error) {
      console.warn('[LocalFolder] Failed to restore persisted handle, clearing it', error);
      try {
        await clearPersistedDirectoryHandle();
      } catch (clearError) {
        console.warn('[LocalFolder] Failed to clear persisted handle', clearError);
      }
      setHasPersistedLocalHandle(false);
      setNeedsLocalHandleReconnect(false);
      return false;
    }
  }

  async function pickLocalModelFolder() {
    try {
      console.log('[LocalFolder] Folder selection requested');
      if (supportsDirectoryHandlePersistence()) {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        console.log('[LocalFolder] Directory handle acquired', { name: dirHandle.name });
        const entries = await collectSpeechModelLocalEntries(dirHandle);
        applyLocalEntries(entries, dirHandle.name || '');
        if (localHandlePersistenceSupported) {
          try {
            await persistDirectoryHandle(dirHandle);
            setHasPersistedLocalHandle(true);
            setNeedsLocalHandleReconnect(false);
            console.log('[LocalFolder] Persisted directory handle for future visits');
          } catch (persistError) {
            console.warn('[LocalFolder] Could not persist directory handle', persistError);
          }
        }
        return;
      }

      if (modelFolderInputRef.current) {
        modelFolderInputRef.current.click();
        setStatus('Directory-handle persistence is unavailable in this browser. Folder will need to be reselected next visit.');
        return;
      }

      alert('Directory picker is not available in this browser. Use Chromium-based browser or provide local files via folder input.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[LocalFolder] Failed to read directory', error);
      setStatus(`Failed to read folder: ${error.message}`);
    }
  }

  function handleLocalFolderInput(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    console.log('[LocalFolder] Folder input fallback selected files', { count: files.length });
    const entries = createLocalFolderEntriesFromFiles(files);
    const folderName = getLocalFolderNameFromEntries(entries);
    applyLocalEntries(entries, folderName);
    if (!localHandlePersistenceSupported) {
      setStatus(`Local folder selected (${entries.length} files). This browser cannot persist folder access; reselect next visit.`);
    }
    event.target.value = '';
  }

  async function reconnectPersistedFolder() {
    const restored = await restorePersistedLocalFolder({ requestPermission: true });
    if (!restored) {
      setStatus('Could not restore saved folder access. Please choose folder again.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (modelSource !== MODEL_SOURCE_OPTIONS.LOCAL) return () => {};
    if (!localHandlePersistenceSupported) return () => {};
    if (localEntries.length > 0) return () => {};

    (async () => {
      const restored = await restorePersistedLocalFolder({ requestPermission: false });
      if (cancelled || !restored) return;
      console.log('[LocalFolder] Local folder restored automatically from persisted handle');
    })();

    return () => {
      cancelled = true;
    };
  }, [localEntries.length, localHandlePersistenceSupported, modelSource]);

  return {
    localEntries,
    localFolderName,
    hasPersistedLocalHandle,
    needsLocalHandleReconnect,
    localHandlePersistenceSupported,
    localTokenizerOptions,
    localTokenizerName,
    setLocalTokenizerName,
    localPreprocessorOptions,
    localDetectedArtifacts,
    pickLocalModelFolder,
    handleLocalFolderInput,
    reconnectPersistedFolder,
  };
}
