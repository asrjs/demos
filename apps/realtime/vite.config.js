import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createAsrDemoViteConfig } from '../../vite.shared.js';

const monorepoRoot = path.resolve(__dirname, '../..');
const speechRecognitionRoot =
  process.env.ASRJS_LIB_DIR || path.resolve(monorepoRoot, '../speech-recognition');
const ortWasmPath = `/@fs/${path
  .resolve(speechRecognitionRoot, 'node_modules/onnxruntime-web/dist')
  .replace(/\\/g, '/')}/`;

export default defineConfig(
  mergeConfig(createAsrDemoViteConfig(__dirname, { port: 3000 }), {
    plugins: [react()],
    define: {
      __ASRJS_ORT_WASM_PATH__: JSON.stringify(ortWasmPath),
    },
  })
);
