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
const pkg = readJson(path.resolve(repoRoot, 'package.json'));
const shortHash = getShortCommitHash(repoRoot);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
  resolve: {
    alias: [
      { find: '../../io/node.js', replacement: path.resolve(repoRoot, 'src/io/browser-node-stub.ts') },
      { find: /^@asrjs\/speech-recognition$/, replacement: path.resolve(repoRoot, 'src/index.ts') },
      { find: /^@asrjs\/speech-recognition\/builtins$/, replacement: path.resolve(repoRoot, 'src/builtins.ts') },
      { find: /^@asrjs\/speech-recognition\/io$/, replacement: path.resolve(repoRoot, 'src/io.ts') },
      { find: /^@asrjs\/speech-recognition\/inference$/, replacement: path.resolve(repoRoot, 'src/inference.ts') },
      { find: /^@asrjs\/speech-recognition\/browser$/, replacement: path.resolve(repoRoot, 'src/browser.ts') },
      { find: /^@asrjs\/speech-recognition\/realtime$/, replacement: path.resolve(repoRoot, 'src/realtime.ts') },
      { find: /^@asrjs\/speech-recognition\/bench$/, replacement: path.resolve(repoRoot, 'src/bench.ts') },
      { find: /^@asrjs\/speech-recognition\/datasets$/, replacement: path.resolve(repoRoot, 'src/datasets.ts') },
      { find: /^@asrjs\/speech-recognition\/models\/(.+)$/, replacement: path.resolve(repoRoot, 'src/models/$1.ts') },
      { find: /^@asrjs\/speech-recognition\/presets\/(.+)$/, replacement: path.resolve(repoRoot, 'src/presets/$1.ts') },
    ],
  },
  define: {
    global: 'globalThis',
    __ASRJS_VERSION__: JSON.stringify(pkg?.version || 'unknown'),
    __ASRJS_SOURCE__: JSON.stringify(shortHash ? `dev-${shortHash}` : 'dev'),
  },
});
