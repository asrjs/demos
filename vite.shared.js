import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { searchForWorkspaceRoot } from 'vite';
import { copyOrtRuntimeAssets } from './scripts/ort-assets.mjs';

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
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function getSourceProvenance(repoRoot) {
  const shortHash = getShortCommitHash(repoRoot);
  if (!shortHash) return 'source-uncommitted';
  try {
    const dirty = execSync('git status --porcelain', {
      encoding: 'utf8',
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return `source-${shortHash}${dirty ? '-dirty' : ''}`;
  } catch {
    return `source-${shortHash}`;
  }
}

function resolveInstalledLibraryRoot(appDir, packageRootOverride) {
  if (packageRootOverride) return path.resolve(packageRootOverride);
  const requireFromApp = createRequire(path.join(appDir, 'package.json'));
  const entry = requireFromApp.resolve('@asrjs/speech-recognition');
  return path.resolve(path.dirname(entry), '..');
}

function sourceAliases(speechRecognitionRoot) {
  return [
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
  ];
}

export function createAsrDemoViteConfig(appDir, options = {}) {
  const monorepoRoot = path.resolve(appDir, '../..');
  const env = options.env || process.env;
  const isSuiteBuild = Boolean(env.ASRJS_SUITE_BASE);
  const sourceMode = env.ASRJS_SOURCE === 'npm' ? 'package' : (env.ASRJS_SOURCE || 'package');
  if (sourceMode !== 'package' && sourceMode !== 'source') {
    throw new Error(`ASRJS_SOURCE must be "package" or "source"; received "${sourceMode}".`);
  }
  const speechRecognitionRoot = sourceMode === 'source'
    ? path.resolve(env.ASRJS_LIB_DIR || path.resolve(monorepoRoot, '../speech-recognition'))
    : resolveInstalledLibraryRoot(appDir, options.libraryPackageRoot);
  const libraryPkg = readJson(path.resolve(speechRecognitionRoot, 'package.json'));
  if (!libraryPkg?.version) {
    throw new Error(`Could not read the installed speech-recognition package version at ${speechRecognitionRoot}.`);
  }
  const asrSource = sourceMode === 'source'
    ? getSourceProvenance(speechRecognitionRoot)
    : 'npm-package';

  const defaultModelsDir = process.env.ASRJS_MODELS_DIR || 'N:/models';
  let resolvedOutDir;

  return {
    plugins: [{
      name: 'asrjs-ort-assets',
      configResolved(config) {
        resolvedOutDir = path.resolve(config.root || appDir, config.build?.outDir || 'dist');
      },
      async buildStart() {
        if (isSuiteBuild) return;
        const requireFromLibrary = createRequire(path.join(speechRecognitionRoot, 'package.json'));
        const runtimeDist = path.dirname(requireFromLibrary.resolve('onnxruntime-web'));
        await copyOrtRuntimeAssets(runtimeDist, path.join(appDir, 'public', 'ort'));
      },
      async closeBundle() {
        if (isSuiteBuild && resolvedOutDir) {
          await fs.promises.rm(path.join(resolvedOutDir, 'ort'), { recursive: true, force: true });
        }
      },
    }],
    worker: {
      format: 'es',
    },
    server: {
      port: options.port || 3000,
      strictPort: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      fs: {
        allow: [
          searchForWorkspaceRoot(appDir),
          monorepoRoot,
          ...(sourceMode === 'source' ? [speechRecognitionRoot] : []),
          defaultModelsDir,
        ],
      },
    },
    resolve: {
      alias: [
        { find: /^@asrjs\/demo-runtime$/, replacement: path.resolve(monorepoRoot, 'packages/demo-runtime/src/index.js') },
        { find: /^@asrjs\/demo-ui$/, replacement: path.resolve(monorepoRoot, 'packages/ui/src/index.js') },
        { find: /^@asrjs\/demo-ui\/theme\.css$/, replacement: path.resolve(monorepoRoot, 'packages/ui/src/theme.css') },
        { find: /^@asrjs\/demo-ui\/(.+)$/, replacement: path.resolve(monorepoRoot, 'packages/ui/src/$1') },
        ...(sourceMode === 'source' ? sourceAliases(speechRecognitionRoot) : []),
      ],
    },
    define: {
      global: 'globalThis',
      __ASRJS_VERSION__: JSON.stringify(libraryPkg.version),
      __ASRJS_SOURCE__: JSON.stringify(asrSource),
      __ASRJS_SUITE_BASE__: JSON.stringify(env.ASRJS_SUITE_BASE || ''),
    },
  };
}
