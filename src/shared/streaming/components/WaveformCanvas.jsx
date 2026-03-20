import React, { useEffect, useMemo, useRef, useState } from 'react';

const MAX_DPR = 2;
const HEIGHT = 156;
const LANE_HEIGHT = 22;
const LANE_INSET = 8;
const LANE_GAP = 8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatSeconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} s` : '--';
}

function formatRate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} Hz` : '--';
}

function formatChunkDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} ms` : '--';
}

function amplitudeToDbfs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return -100;
  }
  return 20 * Math.log10(value);
}

function mapWaveformExtent(value) {
  const clamped = clamp(value, 0, 1);
  // A mild power curve boosts normal speech without making the display too jumpy.
  return clamped <= 0 ? 0 : clamped ** 0.55;
}

function getLaneLayout(height) {
  const topLaneTop = LANE_INSET;
  const topLaneBottom = topLaneTop + LANE_HEIGHT;
  const bottomLaneTop = height - LANE_INSET - LANE_HEIGHT;
  const bottomLaneBottom = bottomLaneTop + LANE_HEIGHT;
  const waveformTop = topLaneBottom + LANE_GAP;
  const waveformBottom = bottomLaneTop - LANE_GAP;

  return {
    topLaneTop,
    topLaneBottom,
    bottomLaneTop,
    bottomLaneBottom,
    waveformTop,
    waveformBottom,
  };
}

function drawGrid(context, width, height) {
  context.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  context.lineWidth = 1;

  for (let row = 1; row < 4; row += 1) {
    const y = (height / 4) * row;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  for (let column = 1; column < 7; column += 1) {
    const x = (width / 7) * column;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}

function drawSpans(context, waveform, segments, activeSegment, width, height) {
  const totalFrames = Math.max(1, waveform.endFrame - waveform.startFrame);
  const toX = (frame) => ((frame - waveform.startFrame) / totalFrames) * width;

  if (Array.isArray(segments)) {
    context.fillStyle = 'rgba(148, 163, 184, 0.08)';
    for (const segment of segments) {
      const x0 = clamp(toX(segment.startFrame), 0, width);
      const x1 = clamp(toX(segment.endFrame), 0, width);
      if (x1 > x0) {
        context.fillRect(x0, 0, x1 - x0, height);
      }
    }
  }

  if (activeSegment) {
    const x0 = clamp(toX(activeSegment.startFrame), 0, width);
    const x1 = clamp(toX(activeSegment.endFrame), 0, width);
    context.fillStyle = 'rgba(93, 115, 135, 0.12)';
    context.fillRect(x0, 0, Math.max(2, x1 - x0), height);
  }
}

function drawCenteredChunkEnvelope(context, minMax, width, height) {
  const { waveformTop, waveformBottom } = getLaneLayout(height);
  const laneHeight = Math.max(8, waveformBottom - waveformTop);
  const centerY = waveformTop + laneHeight / 2;
  const amplitude = laneHeight * 0.49;
  const pointCount = Math.max(1, Math.floor(minMax.length / 2));
  const bucketWidth = width / pointCount;

  const bodyGradient = context.createLinearGradient(0, waveformTop, 0, waveformBottom);
  bodyGradient.addColorStop(0, 'rgba(59, 130, 246, 0.82)');
  bodyGradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.82)');
  bodyGradient.addColorStop(1, 'rgba(59, 130, 246, 0.82)');

  context.fillStyle = 'rgba(44, 106, 214, 0.08)';
  context.fillRect(0, waveformTop, width, laneHeight);

  context.fillStyle = bodyGradient;
  for (let index = 0; index < pointCount; index += 1) {
    const min = clamp(Number(minMax[index * 2] ?? 0), -1, 1);
    const max = clamp(Number(minMax[index * 2 + 1] ?? 0), -1, 1);
    const extent = mapWaveformExtent(Math.max(Math.abs(min), Math.abs(max)));
    const halfHeight = Math.max(1, extent * amplitude);
    const x0 = Math.floor(index * bucketWidth);
    const x1 =
      index === pointCount - 1 ? width : Math.ceil((index + 1) * bucketWidth);
    context.fillRect(x0, centerY - halfHeight, Math.max(1, x1 - x0), halfHeight * 2);
  }

  context.strokeStyle = 'rgba(93, 115, 135, 0.24)';
  context.beginPath();
  context.moveTo(0, centerY + 0.5);
  context.lineTo(width, centerY + 0.5);
  context.stroke();
}

function drawTenVadOverlay(context, waveform, recent, width, height) {
  if (!Array.isArray(recent) || recent.length === 0) {
    return;
  }

  const totalFrames = Math.max(1, waveform.endFrame - waveform.startFrame);
  const toX = (frame) => ((frame - waveform.startFrame) / totalFrames) * width;
  const { topLaneTop } = getLaneLayout(height);
  const laneTop = topLaneTop;
  const laneHeight = LANE_HEIGHT;

  context.save();
  context.fillStyle = 'rgba(37, 99, 235, 0.08)';
  context.fillRect(0, laneTop, width, laneHeight);

  for (const entry of recent) {
    const x0 = clamp(toX(entry.startFrame), 0, width);
    const x1 = clamp(toX(entry.endFrame), 0, width);
    if (x1 <= x0) continue;

    const probability = clamp(Number(entry.probability ?? 0), 0, 1);
    const barHeight = Math.max(1, probability * laneHeight);
    context.fillStyle = entry.speaking ? 'rgba(37, 99, 235, 0.82)' : 'rgba(37, 99, 235, 0.3)';
    context.fillRect(x0, laneTop + laneHeight - barHeight, Math.max(1, x1 - x0), barHeight);
  }

  context.fillStyle = 'rgba(37, 99, 235, 0.8)';
  context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillText('ten-vad', 8, laneTop + 10);
  context.restore();
}

function drawEnergyOverlay(context, waveform, recent, width, height) {
  if (!Array.isArray(recent) || recent.length === 0) {
    return;
  }

  const totalFrames = Math.max(1, waveform.endFrame - waveform.startFrame);
  const toX = (frame) => ((frame - waveform.startFrame) / totalFrames) * width;
  const { bottomLaneTop, bottomLaneBottom } = getLaneLayout(height);
  const laneHeight = LANE_HEIGHT;
  const laneTop = bottomLaneTop;
  const laneBottom = bottomLaneBottom;

  context.save();
  context.fillStyle = 'rgba(217, 119, 6, 0.08)';
  context.fillRect(0, laneTop, width, laneHeight);
  context.beginPath();
  context.moveTo(0, laneBottom);

  for (let index = 0; index < recent.length; index += 1) {
    const entry = recent[index];
    const x0 = clamp(toX(entry.startFrame), 0, width);
    const x1 = clamp(toX(entry.endFrame), 0, width);
    const centerX = x0 + Math.max(1, x1 - x0) / 2;
    const energyDbfs = amplitudeToDbfs(Number(entry.energy ?? 0));
    const normalizedEnergy = clamp((energyDbfs + 72) / 42, 0, 1);
    const y = laneBottom - normalizedEnergy * (laneHeight - 2);
    context.lineTo(centerX, y);
  }

  context.lineTo(width, laneBottom);
  context.closePath();
  context.fillStyle = 'rgba(217, 119, 6, 0.18)';
  context.fill();

  context.beginPath();
  for (let index = 0; index < recent.length; index += 1) {
    const entry = recent[index];
    const x0 = clamp(toX(entry.startFrame), 0, width);
    const x1 = clamp(toX(entry.endFrame), 0, width);
    const centerX = x0 + Math.max(1, x1 - x0) / 2;
    const energyDbfs = amplitudeToDbfs(Number(entry.energy ?? 0));
    const normalizedEnergy = clamp((energyDbfs + 72) / 42, 0, 1);
    const y = laneBottom - normalizedEnergy * (laneHeight - 2);
    if (index === 0) {
      context.moveTo(centerX, y);
    } else {
      context.lineTo(centerX, y);
    }
  }
  context.strokeStyle = 'rgba(217, 119, 6, 0.95)';
  context.lineWidth = 1.5;
  context.stroke();

  context.fillStyle = 'rgba(180, 83, 9, 0.85)';
  context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillText('pre-vad energy', 8, laneTop + 10);
  context.restore();
}

function getWaveformStats(snapshot) {
  const waveform = snapshot?.waveform ?? null;
  const minMax = waveform?.minMax ?? null;
  const visibleSeconds =
    waveform && typeof snapshot?.sampleRate === 'number'
      ? (waveform.endFrame - waveform.startFrame) / Math.max(1, snapshot.sampleRate)
      : null;

  return {
    waveform,
    minMax: minMax instanceof Float32Array || Array.isArray(minMax) ? minMax : null,
    visibleSeconds,
    roughTimeline: Array.isArray(snapshot?.rough?.timeline) ? snapshot.rough.timeline : [],
    vadTimeline: Array.isArray(snapshot?.vadBuffer?.timeline) ? snapshot.vadBuffer.timeline : [],
  };
}

export function WaveformCanvas({ snapshot }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const { waveform, minMax, visibleSeconds, roughTimeline, vadTimeline } = useMemo(() => getWaveformStats(snapshot), [snapshot]);
  const nativeRate = snapshot?.capture?.inputSampleRate ?? null;
  const contextRate = snapshot?.capture?.contextSampleRate ?? null;
  const targetRate = snapshot?.capture?.processingSampleRate ?? snapshot?.sampleRate ?? null;
  const chunkFrames = snapshot?.capture?.chunkFrames ?? null;
  const chunkDurationMs = snapshot?.capture?.chunkDurationMs ?? null;
  const rateLabel =
    nativeRate && targetRate
      ? `native ${formatRate(nativeRate)} -> target ${formatRate(targetRate)}`
      : targetRate
        ? `target ${formatRate(targetRate)}`
        : '--';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = Math.round(entry?.contentRect?.width ?? 0);
      setCanvasWidth((current) => (current === nextWidth ? current : nextWidth));
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasWidth) return undefined;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.max(1, Math.round(canvasWidth));
    const height = HEIGHT;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.height = `${height}px`;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#fbfcfd';
      context.fillRect(0, 0, width, height);

      drawGrid(context, width, height);

      if (!waveform || !minMax || minMax.length < 2) {
        context.fillStyle = '#94a3b8';
        context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.fillText('Waiting for waveform data…', 12, 20);
        return;
      }

      drawSpans(context, waveform, snapshot?.recentSegments, snapshot?.activeSegment, width, height);
      drawTenVadOverlay(context, waveform, vadTimeline, width, height);
      drawEnergyOverlay(context, waveform, roughTimeline, width, height);
      drawCenteredChunkEnvelope(context, minMax, width, height);
    });

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [canvasWidth, minMax, roughTimeline, snapshot?.activeSegment, snapshot?.recentSegments, vadTimeline, waveform]);

  return (
    <div className="streaming-waveform-wrap">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
        <span>waveform</span>
        <span>{snapshot?.state || 'idle'}</span>
      </div>
      <canvas ref={canvasRef} height={HEIGHT} className="streaming-waveform-canvas w-full rounded-[8px]" />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500">
        <span title={contextRate ? `context ${formatRate(contextRate)}` : undefined}>{rateLabel}</span>
        <span>{chunkFrames ? `chunk ${formatChunkDuration(chunkDurationMs)} / ${chunkFrames}f` : '--'}</span>
        <span>{formatSeconds(visibleSeconds)}</span>
        <span>{snapshot?.activeSegment ? 'segment active' : 'no active segment'}</span>
      </div>
    </div>
  );
}
