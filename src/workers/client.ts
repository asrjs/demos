import type { StreamVadFrameResult } from '../types.js';
import type { FireRedRuntimeOptions } from '../types.js';

interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./browser-worker.js', import.meta.url), { type: 'module' });
}

export interface FireRedBrowserWorkerClient {
  init(options?: string | (FireRedRuntimeOptions & { readonly modelDir?: string })): Promise<void>;
  process(chunk: Int16Array): Promise<StreamVadFrameResult[]>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export function createFireRedBrowserWorkerClient(
  workerFactory: () => WorkerLike = defaultWorkerFactory,
): FireRedBrowserWorkerClient {
  let worker: WorkerLike | null = null;
  let requestId = 0;
  const pending = new Map<number, PendingRequest>();

  const ensureWorker = (): WorkerLike => {
    if (worker) {
      return worker;
    }
    worker = workerFactory();
    worker.onmessage = (event: MessageEvent<{ id: number; type: string; payload: unknown }>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (!request) {
        return;
      }
      pending.delete(response.id);
      if (response.type === 'ERROR') {
        request.reject(new Error(String(response.payload)));
      } else {
        request.resolve(response.payload);
      }
    };
    worker.onerror = (event) => {
      for (const [, request] of pending) {
        request.reject(new Error(event.message || 'Worker error'));
      }
      pending.clear();
    };
    return worker;
  };

  const send = <T>(type: string, payload: unknown): Promise<T> => {
    const target = ensureWorker();
    const id = ++requestId;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      target.postMessage({ id, type, payload });
    });
  };

  return {
    async init(
      options?: string | (FireRedRuntimeOptions & { readonly modelDir?: string }),
    ): Promise<void> {
      if (typeof options === 'string' || options === undefined) {
        await send<void>('INIT', { modelDir: options });
        return;
      }
      await send<void>('INIT', options);
    },
    async process(chunk: Int16Array): Promise<StreamVadFrameResult[]> {
      const transfer = chunk.buffer as ArrayBuffer;
      const target = ensureWorker();
      const id = ++requestId;
      return new Promise<StreamVadFrameResult[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        target.postMessage({ id, type: 'PROCESS', payload: { chunk } }, [transfer]);
      });
    },
    async reset(): Promise<void> {
      await send<void>('RESET', {});
    },
    async dispose(): Promise<void> {
      if (!worker) {
        return;
      }
      try {
        await send<void>('DISPOSE', {});
      } finally {
        worker.terminate();
        worker = null;
      }
    },
  };
}
