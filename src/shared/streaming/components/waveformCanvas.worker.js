import {
  BROWSER_WAVEFORM_CANVAS_HEIGHT as WAVEFORM_CANVAS_HEIGHT,
  renderBrowserRealtimeWaveformFrame as renderWaveformFrame,
} from '@asrjs/speech-recognition/browser';

let canvas = null;
let context = null;

function resizeCanvas(width, height, dpr) {
  if (!canvas || !context) {
    return;
  }
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

self.onmessage = (event) => {
  const data = event.data ?? {};
  if (data.type === 'init') {
    canvas = data.canvas;
    context = canvas?.getContext?.('2d', { alpha: false }) ?? null;
    return;
  }

  if (data.type === 'render' && context) {
    const width = Math.max(1, Math.round(data.width ?? 1));
    const height = Math.max(1, Math.round(data.height ?? WAVEFORM_CANVAS_HEIGHT));
    const dpr = Math.max(1, Number(data.dpr ?? 1));
    resizeCanvas(width, height, dpr);
    renderWaveformFrame(context, data.frame, width, height);
  }
};
