#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const fireredRoot = process.env.FIRERED_ROOT || 'N:/github/FireRedVAD';
const onnxDir = path.join(fireredRoot, 'pretrained_models', 'onnx_models');
const requiredFiles = [
  'fireredvad_stream_vad_with_cache.onnx',
  'fireredvad_vad.onnx',
  'fireredvad_aed.onnx',
  'cmvn.ark',
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(onnxDir, file)));
if (missing.length > 0) {
  console.error('Missing upstream artifacts:', missing.join(', '));
  process.exit(1);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  fireredRoot,
  files: {},
  notes: [
    'Stub-only upstream validator.',
    'Next step: automate ONNX export and CMVN JSON regeneration.',
    'Next step: regenerate parity goldens after upstream changes.',
  ],
};

for (const file of requiredFiles) {
  const fullPath = path.join(onnxDir, file);
  const data = fs.readFileSync(fullPath);
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  manifest.files[file] = {
    size: data.length,
    sha256,
    path: fullPath,
  };
}

const outDir = path.resolve('tools/upstream/out');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'upstream-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Upstream check complete: ${outPath}`);