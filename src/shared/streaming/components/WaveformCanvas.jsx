import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BROWSER_WAVEFORM_CANVAS_HEIGHT as WAVEFORM_CANVAS_HEIGHT,
  BROWSER_WAVEFORM_CANVAS_MAX_DPR as WAVEFORM_CANVAS_MAX_DPR,
  renderBrowserRealtimeWaveformFrame as renderWaveformFrame,
} from '@asrjs/speech-recognition/browser';
import { useStreamingMonitor } from '../useStreamingMonitor.js';

// The current plot payload is object-heavy and expensive to structured-clone into a worker.
// Keep painting on the main thread until the raster payload is typed-array based.
const ENABLE_OFFSCREEN_CANVAS = false;

function formatSeconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} s` : '--';
}

function formatRate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} Hz` : '--';
}

function formatChunkDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} ms` : '--';
}

function buildRingCaptureSnapshot(ringCapture, capture) {
  if (!ringCapture?.ringBuffer) {
    return null;
  }

  const sampleRate = ringCapture.ringBuffer.sampleRate;
  const frameSpan = ringCapture.ringBuffer.getSize();
  const chunkFrames = Math.max(1, capture?.chunkFrames ?? 256);
  const pointCount = Math.max(1, Math.floor(frameSpan / chunkFrames));
  const waveform = ringCapture.getWaveform(pointCount, frameSpan);
  const filledPointCount = Math.min(
    pointCount,
    Math.max(0, Math.ceil((waveform.endFrame - waveform.startFrame) / chunkFrames)),
  );
  const padPoints = Math.max(0, pointCount - filledPointCount);
  const columns = Array.from({ length: pointCount }, (_, index) => ({
    index,
    hasData: false,
    waveformMin: 0,
    waveformMax: 0,
    roughEnergy: 0,
    roughSpeechRatio: 0,
    roughIsSpeech: false,
    roughPass: false,
    vadProbability: 0,
    vadSpeechRatio: 0,
    vadSpeaking: false,
    tenVadPass: false,
    detectorPass: false,
    activeSegment: false,
    recentSegment: false,
  }));

  for (let sourceIndex = 0; sourceIndex < filledPointCount; sourceIndex += 1) {
    const targetIndex = padPoints + sourceIndex;
    columns[targetIndex] = {
      ...columns[targetIndex],
      hasData: true,
      waveformMin: waveform.minMax[sourceIndex * 2] ?? 0,
      waveformMax: waveform.minMax[sourceIndex * 2 + 1] ?? 0,
    };
  }

  return {
    state: 'capture-only',
    sampleRate,
    waveform,
    plot: {
      startFrame: waveform.endFrame - pointCount * chunkFrames,
      endFrame: waveform.endFrame,
      chunkFrames,
      chunkDurationMs: capture?.chunkDurationMs ?? (chunkFrames / sampleRate) * 1000,
      pointCount,
      filledPointCount,
      padPoints,
      livePointIndex: filledPointCount > 0 ? padPoints + filledPointCount - 1 : -1,
      gateMode: 'capture-only',
      columns,
    },
    recentSegments: [],
    activeSegment: null,
    capture,
  };
}

function useRingCaptureSnapshot(ringCapture, capture) {
  const [snapshot, setSnapshot] = useState(() => buildRingCaptureSnapshot(ringCapture, capture));

  useEffect(() => {
    if (!ringCapture) {
      setSnapshot(null);
      return undefined;
    }

    const publish = () => {
      setSnapshot(buildRingCaptureSnapshot(ringCapture, capture));
    };

    publish();
    return ringCapture.subscribe(() => {
      publish();
    });
  }, [ringCapture, capture]);

  return snapshot;
}

function selectWaveformFrame(snapshot) {
  if (!snapshot) {
    return null;
  }
  return {
    state: snapshot.state,
    sampleRate: snapshot.sampleRate,
    waveform: snapshot.waveform ?? null,
    plot: snapshot.plot ?? null,
    config: snapshot.config ?? null,
    gate: snapshot.gate ?? null,
    recentSegments: snapshot.recentSegments ?? [],
    activeSegment: snapshot.activeSegment ?? null,
    capture: snapshot.capture ?? null,
  };
}

function canUseOffscreenCanvas() {
  return (
    ENABLE_OFFSCREEN_CANVAS &&
    typeof window !== 'undefined' &&
    typeof Worker === 'function' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  );
}

function formatDbfs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} dBFS` : '--';
}

function formatThreshold(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '--';
}

export function WaveformCanvas({
  monitor = null,
  ringCapture = null,
  capture = null,
  scaleMode = 'adaptive',
  showTenVadThreshold = false,
  showPreVadOverlay = false,
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const workerRef = useRef(null);
  const offscreenActiveRef = useRef(false);
  const publishCountRef = useRef(0);
  const paintCountRef = useRef(0);
  const [paintMode, setPaintMode] = useState('main');
  const [perfStats, setPerfStats] = useState({ publishHz: 0, paintHz: 0 });
  const monitorFrame = useStreamingMonitor({
    monitor,
    captureInfo: capture,
    selector: selectWaveformFrame,
  });
  const ringCaptureFrame = useRingCaptureSnapshot(ringCapture, capture);
  const frame = monitor ? monitorFrame : ringCaptureFrame;
  const waveform = frame?.waveform ?? null;
  const plot = frame?.plot ?? null;
  const visibleSeconds =
    plot && typeof frame?.sampleRate === 'number'
      ? (plot.endFrame - plot.startFrame) / Math.max(1, frame.sampleRate)
      : null;
  const nativeRate = frame?.capture?.inputSampleRate ?? null;
  const contextRate = frame?.capture?.contextSampleRate ?? null;
  const targetRate = frame?.capture?.processingSampleRate ?? frame?.sampleRate ?? null;
  const chunkFrames = frame?.capture?.chunkFrames ?? null;
  const chunkDurationMs = frame?.capture?.chunkDurationMs ?? null;
  const rateLabel =
    nativeRate && targetRate
      ? `native ${formatRate(nativeRate)} -> target ${formatRate(targetRate)}`
      : targetRate
        ? `target ${formatRate(targetRate)}`
        : '--';
  const renderFrame = useMemo(
    () =>
      frame
        ? {
            waveform: frame.waveform,
            plot: frame.plot,
            config: frame.config,
            activeSegment: frame.activeSegment,
            recentSegments: frame.recentSegments,
          }
        : null,
    [frame],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canUseOffscreenCanvas() || offscreenActiveRef.current) {
      return undefined;
    }

    try {
      const worker = new Worker(new URL('./waveformCanvas.worker.js', import.meta.url), {
        type: 'module',
      });
      const offscreenCanvas = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'init', canvas: offscreenCanvas }, [offscreenCanvas]);
      workerRef.current = worker;
      offscreenActiveRef.current = true;
      setPaintMode('worker');

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch (error) {
      console.warn('[WaveformCanvas] OffscreenCanvas disabled, using main-thread paint.', error);
      offscreenActiveRef.current = false;
      setPaintMode('main');
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (monitor) {
      return monitor.subscribe(() => {
        publishCountRef.current += 1;
      });
    }
    if (ringCapture) {
      return ringCapture.subscribe(() => {
        publishCountRef.current += 1;
      });
    }
    return undefined;
  }, [monitor, ringCapture]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setPerfStats({
        publishHz: publishCountRef.current,
        paintHz: paintCountRef.current,
      });
      publishCountRef.current = 0;
      paintCountRef.current = 0;
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plot?.pointCount) return undefined;

    const width = Math.max(1, Math.round(plot.pointCount));
    const height = WAVEFORM_CANVAS_HEIGHT;
    const dpr = Math.min(window.devicePixelRatio || 1, WAVEFORM_CANVAS_MAX_DPR);
    canvas.style.height = `${height}px`;

    if (paintMode === 'worker' && workerRef.current) {
      paintCountRef.current += 1;
      workerRef.current.postMessage({
        type: 'render',
        width,
        height,
        dpr,
        frame: renderFrame,
      });
      return undefined;
    }

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;

    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintCountRef.current += 1;
      renderWaveformFrame(context, renderFrame, width, height, {
        waveformScaleMode: scaleMode,
        showSpeechThreshold: typeof renderFrame?.config?.minSpeechLevelDbfs === 'number',
        speechThresholdDbfs: renderFrame?.config?.minSpeechLevelDbfs ?? null,
        showTenVadThreshold,
        tenVadThreshold: renderFrame?.config?.tenVadThreshold ?? null,
        showPreVadOverlay,
      });
    });

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [paintMode, plot, renderFrame, scaleMode, showPreVadOverlay, showTenVadThreshold]);

  return (
    <div className="streaming-waveform-wrap">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
        <span>waveform</span>
        <span>{frame?.state || 'idle'} · {paintMode}</span>
      </div>
      <canvas
        ref={canvasRef}
        height={WAVEFORM_CANVAS_HEIGHT}
        style={{ width: `${Math.max(1, plot?.pointCount ?? 1)}px`, height: `${WAVEFORM_CANVAS_HEIGHT}px` }}
        className="streaming-waveform-canvas rounded-[8px]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500">
        <span title={contextRate ? `context ${formatRate(contextRate)}` : undefined}>{rateLabel}</span>
        <span>{chunkFrames ? `chunk ${formatChunkDuration(chunkDurationMs)} / ${chunkFrames}f` : '--'}</span>
        <span>{formatSeconds(visibleSeconds)}</span>
        <span>{frame?.activeSegment ? 'segment active' : 'no active segment'}</span>
        <span>
          {plot ? `live ${Math.max(0, plot.livePointIndex + 1)}/${plot.pointCount} · pad ${plot.padPoints}` : '--'}
        </span>
        <span>{`speech ${formatDbfs(frame?.config?.minSpeechLevelDbfs)}`}</span>
        <span>{`ten ${formatThreshold(frame?.config?.tenVadThreshold)}`}</span>
        <span>{`gate ${frame?.gate?.effectiveMode ?? plot?.gateMode ?? '--'}`}</span>
        <span>{`scale ${scaleMode}`}</span>
        <span>{`ten_thr ${showTenVadThreshold ? 'on' : 'off'}`}</span>
        <span>{`rms_overlay ${showPreVadOverlay ? 'on' : 'off'}`}</span>
        <span>{`pub ${perfStats.publishHz}/s · paint ${perfStats.paintHz}/s`}</span>
      </div>
    </div>
  );
}
