import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createAsrDemoViteConfig } from '../../vite.shared.js';

export default defineConfig(
  mergeConfig(createAsrDemoViteConfig(__dirname, { port: 3000 }), {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
    },
  })
);
