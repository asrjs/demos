export {
  decodeAudioBufferToMonoPcm,
  encodeMonoPcmToWavBlob,
} from '@asrjs/speech-recognition/browser';

export async function getCachedAudioFile(url, cacheKey) {
  const dbName = 'asrjs-streaming-demo-cache';
  const storeName = 'audio-files';

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = async (event) => {
      const db = event.target.result;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const getReq = store.get(cacheKey);

      getReq.onsuccess = async () => {
        if (getReq.result) {
          console.log(`[Cache] Using cached audio: ${cacheKey}`);
          resolve(getReq.result.blob);
          return;
        }

        console.log(`[Cache] Fetching audio from: ${url}`);
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();

          const writeTx = db.transaction(storeName, 'readwrite');
          const writeStore = writeTx.objectStore(storeName);
          writeStore.put({ key: cacheKey, blob, timestamp: Date.now() });
          writeTx.oncomplete = () => {
            console.log(`[Cache] Cached audio: ${cacheKey}`);
            resolve(blob);
          };
          writeTx.onerror = () => resolve(blob);
        } catch (error) {
          reject(error);
        }
      };
      getReq.onerror = () => reject(new Error('Failed to read from cache'));
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'key' });
      }
    };
  });
}
