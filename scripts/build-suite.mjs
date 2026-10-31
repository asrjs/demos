import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyOrtRuntimeAssets } from './ort-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APPS = Object.freeze(['showcase', 'playground', 'realtime', 'benchmark']);

export function resolveOrtRuntimeDist(env = process.env) {
  const sourceMode = env.ASRJS_SOURCE === 'npm' ? 'package' : (env.ASRJS_SOURCE || 'package');
  if (sourceMode !== 'package' && sourceMode !== 'source') {
    throw new Error(`ASRJS_SOURCE must be "package" or "source"; received "${sourceMode}".`);
  }

  let libraryRoot;
  if (sourceMode === 'source') {
    libraryRoot = path.resolve(
      env.ASRJS_LIB_DIR || path.resolve(root, '../speech-recognition'),
    );
  } else {
    const requireFromApp = createRequire(path.join(root, 'apps', 'showcase', 'package.json'));
    const libraryEntry = requireFromApp.resolve('@asrjs/speech-recognition');
    libraryRoot = path.resolve(path.dirname(libraryEntry), '..');
  }

  const requireFromLibrary = createRequire(path.join(libraryRoot, 'package.json'));
  return path.dirname(requireFromLibrary.resolve('onnxruntime-web'));
}

export function normalizeBasePath(input = '/') {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//') || input.includes('//')) {
    throw new Error('Base path must be an absolute URL path such as / or /nested/.');
  }
  if (/[\\?#%\u0000-\u001f\u007f]/.test(input)) throw new Error('Base path contains unsupported characters.');
  const withSlash = input.endsWith('/') ? input : `${input}/`;
  const segments = withSlash.slice(1, -1).split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))) {
    throw new Error('Base path segments may contain letters, numbers, dot, underscore, or hyphen only.');
  }
  return withSlash;
}

function parseArgs(argv) {
  let base = '/';
  let seenBase = false;
  for (const arg of argv) {
    if (!arg.startsWith('--base=')) throw new Error(`Unknown argument: ${arg}`);
    if (seenBase) throw new Error('--base may be provided only once.');
    seenBase = true;
    base = arg.slice('--base='.length);
  }
  return normalizeBasePath(base);
}

export function createBuildInvocation(app, outDir, appBase, suiteBase = '/') {
  if (!APPS.includes(app)) throw new Error(`Unknown suite app: ${app}`);
  const normalizedAppBase = normalizeBasePath(appBase);
  const normalizedSuiteBase = normalizeBasePath(suiteBase);
  const expectedAppBase = `${normalizedSuiteBase}${app}/`;
  if (normalizedAppBase !== expectedAppBase) {
    throw new Error(`App base must be ${expectedAppBase} for ${app} under suite base ${normalizedSuiteBase}.`);
  }
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: [
    'run', 'build', `--workspace=apps/${app}`, '--',
      `--base=${normalizedAppBase}`, `--outDir=${outDir}`, '--emptyOutDir',
    ],
    env: { ...process.env, ASRJS_SUITE_BASE: normalizedSuiteBase },
  };
}

function runBuild(app, outDir, appBase, suiteBase) {
  const { command, args, env } = createBuildInvocation(app, outDir, appBase, suiteBase);
  console.log(`\n[${app}] npm ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${app} build failed (status ${result.status ?? 'unknown'}).`);
}

async function promote(stage, dist, stamp) {
  const backup = path.join(dist, '.asrjs-backups', stamp);
  const published = [];
  const saved = [];
  await fs.mkdir(backup, { recursive: true });
  try {
    for (const app of [...APPS, 'ort', 'index.html', 'theme.css', 'keet-fonts.css', 'fonts', 'suite.css', 'suite.js']) {
      const stagedPath = path.join(stage, app);
      const finalPath = path.join(dist, app);
      const backupPath = path.join(backup, app);
      try { await fs.access(stagedPath); } catch { continue; }
      try {
        await fs.rename(finalPath, backupPath);
        saved.push([backupPath, finalPath]);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await fs.rename(stagedPath, finalPath);
      published.push(finalPath);
    }
  } catch (error) {
    for (const target of published.reverse()) await fs.rename(target, path.join(stage, path.basename(target))).catch(() => {});
    for (const [oldPath, target] of saved.reverse()) await fs.rename(oldPath, target).catch(() => {});
    throw error;
  }
  if (saved.length) return backup;
  await fs.rm(backup, { recursive: true, force: true }).catch((error) => {
    console.warn(`Could not remove empty backup folder ${backup}: ${error.message}`);
  });
  return null;
}

export async function buildSuite({ base = '/', outRoot = path.join(root, 'dist') } = {}) {
  const normalizedBase = normalizeBasePath(base);
  const dist = path.resolve(outRoot);
  if (dist === root || !dist.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Output directory must be inside the suite repository: ${dist}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stage = path.join(path.dirname(dist), `.asrjs-suite-stage-${process.pid}-${stamp}`);
  await fs.mkdir(stage, { recursive: false });
  try {
    const runtimeDist = resolveOrtRuntimeDist(process.env);
    await copyOrtRuntimeAssets(runtimeDist, path.join(stage, 'ort'));
    for (const app of APPS) {
      const output = path.join(stage, app);
      const appBase = `${normalizedBase}${app}/`;
      runBuild(app, output, appBase, normalizedBase);
      await fs.rm(path.join(output, 'ort'), { recursive: true, force: true });
      const stat = await fs.stat(output);
      if (!stat.isDirectory() || !(await fs.stat(path.join(output, 'index.html')).catch(() => null))) {
        throw new Error(`${app} build did not produce an index.html.`);
      }
    }
    await fs.copyFile(path.join(root, 'scripts', 'suite-portal.html'), path.join(stage, 'index.html'));
    await fs.copyFile(path.join(root, 'packages', 'ui', 'src', 'theme.css'), path.join(stage, 'theme.css'));
    // theme.css imports keet-fonts.css, which loads the self-hosted fonts.
    await fs.copyFile(path.join(root, 'packages', 'ui', 'src', 'keet-fonts.css'), path.join(stage, 'keet-fonts.css'));
    await fs.cp(path.join(root, 'packages', 'ui', 'src', 'fonts'), path.join(stage, 'fonts'), { recursive: true });
    await fs.copyFile(path.join(root, 'scripts', 'suite-portal.css'), path.join(stage, 'suite.css'));
    await fs.copyFile(path.join(root, 'scripts', 'suite-portal.js'), path.join(stage, 'suite.js'));
    await fs.mkdir(dist, { recursive: true });
    const backup = await promote(stage, dist, stamp);
    await fs.rm(stage, { recursive: true, force: true }).catch((error) => {
      console.warn(`Could not remove empty staging folder ${stage}: ${error.message}`);
    });
    console.log(`\nASRJS suite built at ${dist}${backup ? ` (previous output preserved in ${backup})` : ''}`);
    return { dist, base: normalizedBase, backup };
  } catch (error) {
    console.error(`Build staging output kept at ${stage}`);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const base = parseArgs(process.argv.slice(2));
    await buildSuite({ base });
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
