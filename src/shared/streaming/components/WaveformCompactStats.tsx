import React from 'react';
import {
  createBrowserCompactStatsRenderer,
  resolveBrowserCompactStatsSnapshot,
} from '@asrjs/speech-recognition/browser';
import { useStreamingMonitor } from '../useStreamingMonitor.js';

function selectCompactStatsSnapshot(snapshot: any) {
  if (!snapshot) {
    return null;
  }
  return {
    rough: snapshot.rough ?? null,
    activeSegment: snapshot.activeSegment ?? null,
    recentSegments: snapshot.recentSegments ?? [],
    recentDecisions: snapshot.recentDecisions ?? [],
    capture: snapshot.capture ?? null,
    plot: snapshot.plot ?? null,
  };
}

export function WaveformCompactStats({
  monitor = null,
  capture = null,
  liveNoiseDbfs = null,
  liveSpeechDbfs = null,
}: {
  monitor?: any;
  capture?: any;
  liveNoiseDbfs?: number | null;
  liveSpeechDbfs?: number | null;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rendererRef = React.useRef<ReturnType<typeof createBrowserCompactStatsRenderer> | null>(null);
  const snapshot = useStreamingMonitor({
    monitor,
    captureInfo: capture,
    selector: selectCompactStatsSnapshot,
  });

  React.useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    const renderer = createBrowserCompactStatsRenderer(containerRef.current);
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    rendererRef.current?.update(
      resolveBrowserCompactStatsSnapshot(snapshot, liveNoiseDbfs, liveSpeechDbfs),
    );
  }, [snapshot, liveNoiseDbfs, liveSpeechDbfs]);

  return <div ref={containerRef} />;
}
