import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BROWSER_WAVEFORM_CANVAS_HEIGHT as WAVEFORM_CANVAS_HEIGHT,
  BROWSER_WAVEFORM_CANVAS_MAX_DPR as WAVEFORM_CANVAS_MAX_DPR,
  renderBrowserRealtimeWaveformFrame as renderWaveformFrame,
} from '@asrjs/speech-recognition/browser';
import { useStreamingMonitor } from '../useStreamingMonitor.js';
import { formatDbfsValue, formatMilliseconds } from '../layout/formatters.js';

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

function formatSegmentReasonLabel(reason) {
  switch (reason) {
    case 'silence':
      return 'sil';
    case 'max-duration':
      return 'max';
    case 'manual':
      return 'man';
    case 'stop':
      return 'stop';
    default:
      return reason ? String(reason).slice(0, 4) : 'seg';
  }
}

function formatSegmentDurationLabel(segment) {
  const sampleRate = Number(segment?.sampleRate);
  const startFrame = Number(segment?.startFrame);
  const endFrame = Number(segment?.endFrame);
  if (
    !Number.isFinite(sampleRate)
    || !Number.isFinite(startFrame)
    || !Number.isFinite(endFrame)
    || sampleRate <= 0
    || endFrame <= startFrame
  ) {
    return null;
  }
  const durationMs = ((endFrame - startFrame) / sampleRate) * 1000;
  return `${Math.round(durationMs)}ms`;
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
    foreground: snapshot.foreground ?? null,
    acceptance: snapshot.acceptance ?? null,
    rough: snapshot.rough ?? null,
    recentSegments: snapshot.recentSegments ?? [],
    recentDecisions: snapshot.recentDecisions ?? [],
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

function renderMetricRow(segments) {
  return segments.map((segment, index) => (
    <React.Fragment key={segment.key}>
      {index > 0 ? (
        <span className="waveform-metrics__sep" aria-hidden>
          ·
        </span>
      ) : null}
      <span className="waveform-metrics__item" title={segment.title}>
        <span className="waveform-metrics__key">{segment.label}</span>
        {' '}
        <span className="waveform-metrics__val">{segment.value}</span>
      </span>
    </React.Fragment>
  ));
}

function WaveformMetricsStrip({ rows }) {
  return (
    <div className="waveform-metrics" role="status" aria-live="polite" aria-label="Waveform metrics">
      {rows.map((segments, rowIndex) => (
        <div
          key={rowIndex}
          className="waveform-metrics__row"
          aria-label={rowIndex === 0 ? 'Capture and timeline' : 'Live gate, thresholds, and display'}
        >
          <div className="waveform-metrics__scroll">{renderMetricRow(segments)}</div>
        </div>
      ))}
    </div>
  );
}

export function WaveformCanvas({
  monitor = null,
  ringCapture = null,
  capture = null,
  scaleMode = 'physical',
  showSpeechThreshold = false,
  showTenVadThreshold = false,
  showPreVadOverlay = false,
  liveReleaseMs = null,
  liveNoiseDbfs = null,
  liveSpeechDbfs = null,
  liveOnsetDbfs = null,
  showFooterMetrics = true,
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
            rough: frame.rough,
            foreground: frame.foreground,
            acceptance: frame.acceptance,
            activeSegment: frame.activeSegment
              ? {
                  ...frame.activeSegment,
                  label: 'live',
                }
              : null,
            recentSegments: (frame.recentSegments ?? []).map((segment, index) => ({
              ...segment,
              logicalStartFrame: segment.metadata?.logicalStartFrame ?? segment.startFrame,
              accepted: segment.metadata?.filter?.accepted ?? true,
              label: (() => {
                const durationLabel = formatSegmentDurationLabel(segment);
                const reasonLabel = formatSegmentReasonLabel(segment.reason);
                return durationLabel
                  ? `${reasonLabel}:${durationLabel}`
                  : reasonLabel;
              })(),
            })),
          }
        : null,
    [frame],
  );
  const foregroundNoiseFloorDbfs =
    typeof frame?.foreground?.noiseFloorDbfs === 'number'
    && Number.isFinite(frame.foreground.noiseFloorDbfs)
      ? frame.foreground.noiseFloorDbfs
      : null;
  const speechThresholdDbfs =
    showSpeechThreshold
      ? liveSpeechDbfs
      : null;
  const onsetThresholdDbfs =
    showSpeechThreshold
      ? liveOnsetDbfs
      : null;
  const absoluteSpeechFloorDbfs =
    showSpeechThreshold
      ? frame?.config?.minSpeechLevelDbfs ?? null
      : null;
  const liveAcceptanceResult = frame?.acceptance ?? frame?.foreground?.activeResult ?? frame?.foreground?.lastResult ?? null;
  const powerValue = liveAcceptanceResult?.normalizedPowerAt16k;
  const powerThreshold = liveAcceptanceResult?.minEnergyPerSecondThreshold;
  const integralValue = liveAcceptanceResult?.normalizedEnergyIntegralAt16k;
  const integralThreshold = liveAcceptanceResult?.minEnergyIntegralThreshold;
  const finalGateLabel =
    typeof powerValue === 'number' && Number.isFinite(powerValue)
      && typeof powerThreshold === 'number' && Number.isFinite(powerThreshold)
      && typeof integralValue === 'number' && Number.isFinite(integralValue)
      && typeof integralThreshold === 'number' && Number.isFinite(integralThreshold)
      ? `p ${powerValue.toFixed(2)}/${powerThreshold.toFixed(2)} · i ${integralValue.toFixed(2)}/${integralThreshold.toFixed(2)}`
      : '--';

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
        showSpeechThreshold,
        noiseFloorDbfs: foregroundNoiseFloorDbfs,
        absoluteSpeechFloorDbfs,
        speechThresholdDbfs,
        onsetThresholdDbfs,
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
  }, [absoluteSpeechFloorDbfs, foregroundNoiseFloorDbfs, onsetThresholdDbfs, paintMode, plot, renderFrame, scaleMode, showPreVadOverlay, showSpeechThreshold, showTenVadThreshold, speechThresholdDbfs]);

  const bufferLabel = plot
    ? `${Math.max(0, plot.livePointIndex + 1)}/${plot.pointCount} pad ${plot.padPoints}`
    : '--';
  const chunkLabel = chunkFrames ? `${formatChunkDuration(chunkDurationMs)}/${chunkFrames}f` : '--';
  const metricsCaptureRow = [
    { key: 'rate', label: 'rate', value: rateLabel, title: contextRate ? `context ${formatRate(contextRate)}` : undefined },
    { key: 'chunk', label: 'chunk', value: chunkLabel },
    { key: 'window', label: 'win', value: formatSeconds(visibleSeconds) },
    { key: 'segment', label: 'seg', value: frame?.activeSegment ? 'active' : 'inactive' },
    { key: 'buffer', label: 'buf', value: bufferLabel },
    { key: 'hz', label: 'pub/paint', value: `${perfStats.publishHz}/s ${perfStats.paintHz}/s` },
  ];
  const metricsDetectorRow = [
    { key: 'mode', label: 'mode', value: String(frame?.gate?.effectiveMode ?? plot?.gateMode ?? '--') },
    { key: 'release', label: 'release', value: formatMilliseconds(liveReleaseMs) },
    { key: 'noise', label: 'noise', value: formatDbfsValue(liveNoiseDbfs) },
    { key: 'speech', label: 'gate', value: formatDbfsValue(liveSpeechDbfs) },
    { key: 'accept', label: 'final gate', value: finalGateLabel },
    {
      key: 'sp',
      label: 'gate lines',
      value: showSpeechThreshold ? 'on' : 'off',
    },
    { key: 'tenln', label: 'firered', value: showTenVadThreshold ? 'on' : 'off' },
    { key: 'scale', label: 'scale', value: scaleMode },
  ];

  return (
    <div className="streaming-waveform-wrap">
      <div className="waveform-strip-head">
        <span className="waveform-strip-head__title">Waveform</span>
        <span className="waveform-strip-head__state min-w-0 truncate">
          {frame?.state || 'idle'} · {paintMode}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        height={WAVEFORM_CANVAS_HEIGHT}
        style={{ width: `${Math.max(1, plot?.pointCount ?? 1)}px`, height: `${WAVEFORM_CANVAS_HEIGHT}px` }}
        className="streaming-waveform-canvas"
      />
      {showFooterMetrics ? <WaveformMetricsStrip rows={[metricsCaptureRow, metricsDetectorRow]} /> : null}
    </div>
  );
}
