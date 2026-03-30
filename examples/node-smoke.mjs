import {
  FireRedStreamVad,
  FireRedVad,
  FireRedAed,
} from '../dist/index.js';

const modelDir = process.env.FIRERED_ONNX_DIR || 'N:/github/FireRedVAD/pretrained_models/onnx_models';

async function main() {
  const stream = await FireRedStreamVad.from_pretrained(modelDir);
  const vad = await FireRedVad.from_pretrained(modelDir);
  const aed = await FireRedAed.from_pretrained(modelDir);

  try {
    const [streamFrames, streamResult] = await stream.detect_full(
      'N:/github/FireRedVAD/assets/hello_en.wav',
    );
    const [vadResult] = await vad.detect('N:/github/FireRedVAD/assets/hello_zh.wav');
    const [aedResult] = await aed.detect('N:/github/FireRedVAD/assets/event.wav');

    console.log('stream frames:', streamFrames.length);
    console.log('stream result:', streamResult);
    console.log('vad result:', vadResult);
    console.log('aed result:', aedResult);
  } finally {
    await stream.dispose();
    await vad.dispose();
    await aed.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});