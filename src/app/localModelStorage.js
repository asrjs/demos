import {
  LOCAL_MODEL_DB_NAME,
  LOCAL_MODEL_DIR_KEY,
  LOCAL_MODEL_STORE_NAME,
  isInIframe,
} from './constants.js';

export function supportsDirectoryHandlePersistence() {
  if (
    typeof window === 'undefined' ||
    typeof window.showDirectoryPicker !== 'function' ||
    typeof indexedDB === 'undefined'
  ) {
    return false;
  }
  return !isInIframe;
}

function openLocalModelDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_MODEL_DB_NAME, 1);
    request.onerror = () => reject(new Error('Failed to open local model IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LOCAL_MODEL_STORE_NAME)) {
        db.createObjectStore(LOCAL_MODEL_STORE_NAME);
      }
    };
  });
}

function withHandleTransaction(mode, run) {
  return openLocalModelDb().then((db) => new Promise((resolve, reject) => {
    let settled = false;

    const closeDb = () => {
      try {
        db.close();
      } catch {
        // Ignore close errors.
      }
    };

    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      closeDb();
      resolve(value);
    };

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      closeDb();
      reject(error);
    };

    const tx = db.transaction([LOCAL_MODEL_STORE_NAME], mode);
    const store = tx.objectStore(LOCAL_MODEL_STORE_NAME);

    tx.onabort = () => rejectOnce(new Error(`Failed to ${mode} persisted folder handle`));
    tx.onerror = () => rejectOnce(new Error(`Failed to ${mode} persisted folder handle`));

    run({ store, resolveOnce, rejectOnce });
  }));
}

export async function readPersistedDirectoryHandle() {
  return withHandleTransaction('readonly', ({ store, resolveOnce, rejectOnce }) => {
    const request = store.get(LOCAL_MODEL_DIR_KEY);
    request.onerror = () => rejectOnce(new Error('Failed to read persisted folder handle'));
    request.onsuccess = () => resolveOnce(request.result || null);
  });
}

export async function persistDirectoryHandle(dirHandle) {
  return withHandleTransaction('readwrite', ({ store, resolveOnce, rejectOnce }) => {
    const request = store.put(dirHandle, LOCAL_MODEL_DIR_KEY);
    request.onerror = () => rejectOnce(new Error('Failed to persist folder handle'));
    request.onsuccess = () => resolveOnce();
  });
}

export async function clearPersistedDirectoryHandle() {
  return withHandleTransaction('readwrite', ({ store, resolveOnce, rejectOnce }) => {
    const request = store.delete(LOCAL_MODEL_DIR_KEY);
    request.onerror = () => rejectOnce(new Error('Failed to clear persisted folder handle'));
    request.onsuccess = () => resolveOnce();
  });
}
