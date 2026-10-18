import { FireRedStreamVad } from '../api/classes.js';
import type { FireRedRuntimeOptions } from '../types.js';

type WorkerRequest =
  | { id: number; type: 'INIT'; payload?: (FireRedRuntimeOptions & { modelDir?: string }) }
  | { id: number; type: 'PROCESS'; payload: { chunk: Int16Array } }
  | { id: number; type: 'RESET'; payload?: {} }
  | { id: number; type: 'DISPOSE'; payload?: {} };

type WorkerResponse =
  | { id: number; type: 'SUCCESS'; payload: unknown }
  | { id: number; type: 'ERROR'; payload: string };

const workerScope = self as unknown as Worker;
let streamVad: FireRedStreamVad | null = null;

function post(response: WorkerResponse): void {
  workerScope.postMessage(response);
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'INIT') {
      const modelDir = message.payload?.modelDir;
      const runtimeOptions = {
        ...message.payload,
      };
      delete (runtimeOptions as { modelDir?: string }).modelDir;
      streamVad = await FireRedStreamVad.from_pretrained(modelDir, runtimeOptions);
      post({ id: message.id, type: 'SUCCESS', payload: { ok: true } });
      return;
    }
    if (!streamVad) {
      throw new Error('Worker is not initialized.');
    }
    if (message.type === 'PROCESS') {
      const results = await streamVad.detect_chunk(message.payload.chunk);
      post({ id: message.id, type: 'SUCCESS', payload: results });
      return;
    }
    if (message.type === 'RESET') {
      streamVad.reset();
      post({ id: message.id, type: 'SUCCESS', payload: { ok: true } });
      return;
    }
    if (message.type === 'DISPOSE') {
      await streamVad.dispose();
      streamVad = null;
      post({ id: message.id, type: 'SUCCESS', payload: { ok: true } });
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    post({ id: message.id, type: 'ERROR', payload: messageText });
  }
};

export {};
