import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FireRedAed,
  FireredVadStreamPacked,
  FireRedStreamVad,
  FireRedVad,
} from '../src/index.js';
import { loadPcm16Wav } from '../src/core/wav.js';

const fireredRoot = process.env.FIRERED_ROOT || 'N:/github/FireRedVAD';
const modelDir = process.env.FIRERED_ONNX_DIR || path.join(fireredRoot, 'pretrained_models', 'onnx_models');
const assetsDir = path.join(fireredRoot, 'assets');

const fixturePaths = {
  model: path.join(modelDir, 'fireredvad_stream_vad_with_cache.onnx'),
  helloEn: path.join(assetsDir, 'hello_en.wav'),
  helloZh: path.join(assetsDir, 'hello_zh.wav'),
  event: path.join(assetsDir, 'event.wav'),
};

const hasFixtures = Object.values(fixturePaths).every((file) => fs.existsSync(file));
const describeIf = hasFixtures ? describe : describe.skip;

function closeTo(actual: number, expected: number, tol = 0.05): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describeIf('native fixture integration', () => {
  let streamVad: FireRedStreamVad;
  let vad: FireRedVad;
  let aed: FireRedAed;

  beforeAll(async () => {
    streamVad = await FireRedStreamVad.from_pretrained(modelDir);
    vad = await FireRedVad.from_pretrained(modelDir);
    aed = await FireRedAed.from_pretrained(modelDir);
  });

  afterAll(async () => {
    await Promise.all([streamVad.dispose(), vad.dispose(), aed.dispose()]);
  });

  it('matches expected stream VAD shape and timing on hello_en', async () => {
    const [frameResults, result] = await streamVad.detect_full(fixturePaths.helloEn);

    expect(frameResults.length).toBe(222);
    expect(result.timestamps.length).toBe(1);
    closeTo(result.timestamps[0]![0], 0.28, 0.02);
    closeTo(result.timestamps[0]![1], 1.83, 0.03);
    closeTo(result.dur, 2.24, 0.01);
  });

  it('matches expected non-stream VAD timestamps on hello_zh', async () => {
    const [result] = await vad.detect(fixturePaths.helloZh);

    expect(result).not.toBeNull();
    expect(result?.timestamps.length).toBe(1);
    closeTo(result!.timestamps[0]![0], 0.44, 0.03);
    closeTo(result!.timestamps[0]![1], 1.82, 0.03);
    closeTo(result!.dur, 2.32, 0.01);
  });

  it('matches expected AED event structure on event.wav', async () => {
    const [result] = await aed.detect(fixturePaths.event);

    expect(result.event2timestamps.speech.length).toBe(4);
    expect(result.event2timestamps.singing.length).toBe(2);
    expect(result.event2timestamps.music.length).toBe(2);
    closeTo(result.event2ratio.speech, 0.853, 0.03);
    closeTo(result.event2ratio.singing, 0.905, 0.03);
    closeTo(result.event2ratio.music, 0.991, 0.02);
  });

  it('preserves C-style stream semantics for 160-sample chunking', async () => {
    const packed = await FireredVadStreamPacked.create({ modelUrl: fixturePaths.model });
    try {
      const wav = await loadPcm16Wav(fixturePaths.helloEn);
      const chunkSize = 160;
      let first: Awaited<ReturnType<typeof packed.process_stream>> | null = null;
      let second: Awaited<ReturnType<typeof packed.process_stream>> | null = null;
      let last: Awaited<ReturnType<typeof packed.process_stream>> | null = null;

      for (let i = 0; i < wav.samples.length; i += chunkSize) {
        const chunk = wav.samples.slice(i, Math.min(wav.samples.length, i + chunkSize));
        const result = await packed.process_stream(chunk);
        if (!first) {
          first = result;
        } else if (!second) {
          second = result;
        }
        last = result;
      }

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.confidence).toBe(0);
      expect(second!.confidence).toBe(0);
      expect(first!.frame_offset).toBe(0);
      expect(second!.frame_offset).toBe(0);
      expect(last!.frame_offset).toBe(222);
    } finally {
      await packed.destroy();
    }
  });
});