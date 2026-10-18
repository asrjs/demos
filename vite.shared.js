import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { searchForWorkspaceRoot } from 'vite';

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

export function createAsrDemoViteConfig(appDir, options = {}) {
  const monorepoRoot = path.resolve(appDir, '../..');
  const speechRecognitionRoot =
    process.env.ASRJS_LIB_DIR || path.resolve(monorepoRoot, '../speech-recognition');
  const localPkg = readJson(path.resolve(speechRecognitionRoot, 'package.json'));
  const localVersion = localPkg?.version || 'dev';
  const shortHash = getShortCommitHash(speechRecognitionRoot);
  const asrSource = shortHash ? `dev-${shortHash}` : 'dev';

  const defaultModelsDir = process.env.ASRJS_MODELS_DIR || 'N:/models';

  return {
    worker: {
      format: 'es',
    },
    server: {
      port: options.port || 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      fs: {
        allow: [
          searchForWorkspaceRoot(appDir),
          monorepoRoot,
          speechRecognitionRoot,
          defaultModelsDir,
        ],
      },
    },
    resolve: {
      alias: [
        { find: /^@asrjs\/demo-ui$/, replacement: path.resolve(monorepoRoot, 'packages/ui/src/index.js') },
        { find: /^@asrjs\/demo-ui\/theme\.css$/, replacement: path.resolve(monorepoRoot, 'packages/ui/src/theme.css') },
        { find: /^@asrjs\/demo-ui\/(.+)$/, replacement: path.resolve(monorepoRoot, 'packages/ui/src/$1') },
        { find: /^@asrjs\/speech-recognition$/, replacement: path.resolve(speechRecognitionRoot, 'src/index.ts') },
        { find: /^@asrjs\/speech-recognition\/builtins$/, replacement: path.resolve(speechRecognitionRoot, 'src/builtins.ts') },
        { find: /^@asrjs\/speech-recognition\/worker$/, replacement: path.resolve(speechRecognitionRoot, 'src/worker.ts') },
        { find: /^@asrjs\/speech-recognition\/io$/, replacement: path.resolve(speechRecognitionRoot, 'src/io.ts') },
        { find: /^@asrjs\/speech-recognition\/inference$/, replacement: path.resolve(speechRecognitionRoot, 'src/inference.ts') },
        { find: /^@asrjs\/speech-recognition\/browser$/, replacement: path.resolve(speechRecognitionRoot, 'src/browser.ts') },
        { find: /^@asrjs\/speech-recognition\/browser\/media$/, replacement: path.resolve(speechRecognitionRoot, 'src/browser-media.ts') },
        { find: /^@asrjs\/speech-recognition\/realtime$/, replacement: path.resolve(speechRecognitionRoot, 'src/realtime.ts') },
        { find: /^@asrjs\/speech-recognition\/bench$/, replacement: path.resolve(speechRecognitionRoot, 'src/bench.ts') },
        { find: /^@asrjs\/speech-recognition\/bench\/browser$/, replacement: path.resolve(speechRecognitionRoot, 'src/bench-browser.ts') },
        { find: /^@asrjs\/speech-recognition\/datasets$/, replacement: path.resolve(speechRecognitionRoot, 'src/datasets.ts') },
        { find: /^@asrjs\/speech-recognition\/quality$/, replacement: path.resolve(speechRecognitionRoot, 'src/quality.ts') },
        { find: /^@asrjs\/speech-recognition\/chunking$/, replacement: path.resolve(speechRecognitionRoot, 'src/chunking.ts') },
        { find: /^@asrjs\/speech-recognition\/post-processing$/, replacement: path.resolve(speechRecognitionRoot, 'src/post-processing.ts') },
        { find: /^@asrjs\/speech-recognition\/alignment$/, replacement: path.resolve(speechRecognitionRoot, 'src/alignment.ts') },
        { find: /^@asrjs\/speech-recognition\/pipeline$/, replacement: path.resolve(speechRecognitionRoot, 'src/pipeline.ts') },
        { find: /^@asrjs\/speech-recognition\/tokenizers$/, replacement: path.resolve(speechRecognitionRoot, 'src/tokenizers.ts') },
        { find: /^@asrjs\/speech-recognition\/presets$/, replacement: path.resolve(speechRecognitionRoot, 'src/presets/index.ts') },
        { find: /^@asrjs\/speech-recognition\/models\/(.+)$/, replacement: path.resolve(speechRecognitionRoot, 'src/models/$1.ts') },
        { find: /^@asrjs\/speech-recognition\/presets\/(.+)$/, replacement: path.resolve(speechRecognitionRoot, 'src/presets/$1.ts') },
        { find: /^@asrjs\/speech-recognition\/(.+)$/, replacement: path.resolve(speechRecognitionRoot, 'src/$1.ts') },
      ],
    },
    define: {
      global: 'globalThis',
      __ASRJS_VERSION__: JSON.stringify(localVersion),
      __ASRJS_SOURCE__: JSON.stringify(asrSource),
    },
  };
}
