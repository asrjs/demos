import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getShortCommitHash(repoRoot) {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd: repoRoot,
    }).trim();
  } catch {
    return null;
  }
}

const repoRoot = path.resolve(__dirname, '../speech-recognition');
const localPkg = readJson(path.resolve(repoRoot, 'package.json'));
const localVersion = localPkg?.version;

const shortHash = getShortCommitHash(repoRoot);
const asrVersion = localVersion || 'unknown';
const asrSource = shortHash ? `dev-${shortHash}` : 'dev';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Allow serving files from the repo root (needed for PARAKEET_LOCAL mode).
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        repoRoot,
        process.env.ASRJS_MODELS_DIR || 'N:/models',
      ],
    },
  },
  resolve: {
    alias: [
      { find: /^@asrjs\/speech-recognition$/, replacement: path.resolve(repoRoot, 'src/index.ts') },
      { find: /^@asrjs\/speech-recognition\/builtins$/, replacement: path.resolve(repoRoot, 'src/builtins.ts') },
      { find: /^@asrjs\/speech-recognition\/io$/, replacement: path.resolve(repoRoot, 'src/io.ts') },
      { find: /^@asrjs\/speech-recognition\/inference$/, replacement: path.resolve(repoRoot, 'src/inference.ts') },
      { find: /^@asrjs\/speech-recognition\/browser$/, replacement: path.resolve(repoRoot, 'src/browser.ts') },
      { find: /^@asrjs\/speech-recognition\/browser\/media$/, replacement: path.resolve(repoRoot, 'src/browser-media.ts') },
      { find: /^@asrjs\/speech-recognition\/realtime$/, replacement: path.resolve(repoRoot, 'src/realtime.ts') },
      { find: /^@asrjs\/speech-recognition\/bench$/, replacement: path.resolve(repoRoot, 'src/bench.ts') },
      { find: /^@asrjs\/speech-recognition\/bench\/browser$/, replacement: path.resolve(repoRoot, 'src/bench-browser.ts') },
      { find: /^@asrjs\/speech-recognition\/datasets$/, replacement: path.resolve(repoRoot, 'src/datasets.ts') },
      { find: /^@asrjs\/speech-recognition\/quality$/, replacement: path.resolve(repoRoot, 'src/quality.ts') },
      { find: /^@asrjs\/speech-recognition\/chunking$/, replacement: path.resolve(repoRoot, 'src/chunking.ts') },
      { find: /^@asrjs\/speech-recognition\/post-processing$/, replacement: path.resolve(repoRoot, 'src/post-processing.ts') },
      { find: /^@asrjs\/speech-recognition\/alignment$/, replacement: path.resolve(repoRoot, 'src/alignment.ts') },
      { find: /^@asrjs\/speech-recognition\/pipeline$/, replacement: path.resolve(repoRoot, 'src/pipeline.ts') },
      { find: /^@asrjs\/speech-recognition\/tokenizers$/, replacement: path.resolve(repoRoot, 'src/tokenizers.ts') },
      { find: /^@asrjs\/speech-recognition\/presets$/, replacement: path.resolve(repoRoot, 'src/presets/index.ts') },
      { find: /^@asrjs\/speech-recognition\/models\/(.+)$/, replacement: path.resolve(repoRoot, 'src/models/$1.ts') },
      { find: /^@asrjs\/speech-recognition\/presets\/(.+)$/, replacement: path.resolve(repoRoot, 'src/presets/$1.ts') },
      { find: /^@asrjs\/speech-recognition\/(.+)$/, replacement: path.resolve(repoRoot, 'src/$1.ts') },
    ],
  },
  define: {
    global: 'globalThis',
    __ASRJS_VERSION__: JSON.stringify(asrVersion),
    __ASRJS_SOURCE__: JSON.stringify(asrSource),
  },
});
