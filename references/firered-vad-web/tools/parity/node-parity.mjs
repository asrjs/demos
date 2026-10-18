#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  FireRedStreamVad,
  FireRedVad,
  FireRedAed,
} from '../../dist/index.js';

const fireredRoot = process.env.FIRERED_ROOT || 'N:/github/FireRedVAD';
const modelDir = process.env.FIRERED_ONNX_DIR || path.join(fireredRoot, 'pretrained_models', 'onnx_models');
const assetsDir = path.join(fireredRoot, 'assets');

async function run() {
  const stream = await FireRedStreamVad.from_pretrained(modelDir);
  const vad = await FireRedVad.from_pretrained(modelDir);
  const aed = await FireRedAed.from_pretrained(modelDir);

  try {
    const [streamFrames, streamResult] = await stream.detect_full(path.join(assetsDir, 'hello_en.wav'));
    const [vadResult] = await vad.detect(path.join(assetsDir, 'hello_zh.wav'));
    const [aedResult] = await aed.detect(path.join(assetsDir, 'event.wav'));

    const out = {
      generatedAt: new Date().toISOString(),
      modelDir,
      stream: {
        frameCount: streamFrames.length,
        result: streamResult,
      },
      vad: vadResult,
      aed: aedResult,
    };

    const outDir = path.resolve('tools/parity/out');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'node-parity-latest.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`Node parity output written to ${outPath}`);
  } finally {
    await Promise.all([stream.dispose(), vad.dispose(), aed.dispose()]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});