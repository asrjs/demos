import React from 'react';
import {
  estimateStreamingReleaseMs,
  resolveStreamingControlGroups,
  resolveStreamingForegroundThresholdDbfs,
  resolveStreamingSnapshotNoiseFloorDbfs,
  STREAMING_TIMELINE_CHUNK_MS,
} from '@asrjs/speech-recognition/realtime';
import { StreamingCapturePanel } from './shared/streaming/components/StreamingCapturePanel.jsx';
import { BrowserConsoleTopbar } from './shared/browser-console/components/BrowserConsoleTopbar.jsx';
import { ModelSidebar } from './shared/browser-console/components/ModelSidebar.jsx';
import { TranscriptPanel } from './shared/browser-console/components/TranscriptPanel.jsx';
import { ReferencePanel } from './shared/browser-console/components/ReferencePanel.jsx';
import { HistoryPanel } from './shared/browser-console/components/HistoryPanel.jsx';

export function BrowserConsoleLayout({ app }) {
  const [modelSidebarCollapsed, setModelSidebarCollapsed] = React.useState(false);
  const [waveformScaleMode, setWaveformScaleMode] = React.useState('focus');
  const [showSpeechThreshold, setShowSpeechThreshold] = React.useState(true);
  const [showTenVadThreshold, setShowTenVadThreshold] = React.useState(true);
  const [showPreVadOverlay, setShowPreVadOverlay] = React.useState(false);
  const {
    micStatus,
    micError,
    micMode,
    setMicMode,
    isMicActive,
    supportsMicrophoneInput,
    handleStartMicrophoneCapture,
    handleStopMicrophoneCapture,
    flushMicrophoneUtterance,
    hudVisible,
    setHudVisible,
    streamingMonitor,
    streamingCaptureInfo,
    streamingSnapshot,
    profileId,
    defaultMode,
    applyPreset,
    updateStreamingConfig,
    resetStreamingDefaults,
    streamingPresets,
    detectorWarnings,
    recentDecisionEntries,
    recentSegmentEntries,
    isLoadingSample,
  } = app.streamingPanel;
  const streamingChunkDurationMs =
    streamingSnapshot?.config?.chunkDurationMs ?? STREAMING_TIMELINE_CHUNK_MS;
  const tuningGroups = React.useMemo(
    () => resolveStreamingControlGroups(),
    [],
  );
  const estimatedTailBudgetMs = estimateStreamingReleaseMs(streamingSnapshot?.config);
  const liveNoiseFloorDbfs = resolveStreamingSnapshotNoiseFloorDbfs(streamingSnapshot);
  const liveSpeechThresholdDbfs = showSpeechThreshold
    ? resolveStreamingForegroundThresholdDbfs(streamingSnapshot?.config, liveNoiseFloorDbfs)
    : null;

  return (
    <div className="demo-shell">
      <div className="demo-container">
        <BrowserConsoleTopbar
          asrjsVersion={app.asrjsVersion}
          asrjsSource={app.asrjsSource}
          darkMode={app.darkMode}
          setDarkMode={app.setDarkMode}
          status={app.status}
          backend={app.backend}
          micStatus={micStatus}
          isMicActive={isMicActive}
          modelSource={app.modelSource}
          loadedFromCache={app.loadedFromCache}
          isModelReady={app.isModelReady}
          modelSourceOptions={app.modelPanel.MODEL_SOURCE_OPTIONS}
          modelSidebarCollapsed={modelSidebarCollapsed}
          setModelSidebarCollapsed={setModelSidebarCollapsed}
        />

        <div className={modelSidebarCollapsed ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)]' : 'grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]'}>
          <ModelSidebar app={app} hidden={modelSidebarCollapsed} />

          <main className="space-y-6">
            <div className="space-y-6">
              <StreamingCapturePanel
                waveformDisplay={{
                  scaleMode: waveformScaleMode,
                  setScaleMode: setWaveformScaleMode,
                  showSpeechThreshold,
                  setShowSpeechThreshold,
                  showTenVadThreshold,
                  setShowTenVadThreshold,
                  showPreVadOverlay,
                  setShowPreVadOverlay,
                }}
                streaming={{
                  monitor: streamingMonitor,
                  captureInfo: streamingCaptureInfo,
                  snapshot: streamingSnapshot,
                  chunkDurationMs: streamingChunkDurationMs,
                  estimatedTailBudgetMs,
                  liveNoiseFloorDbfs,
                  liveSpeechThresholdDbfs,
                  profileId,
                  presets: streamingPresets,
                  defaultMode,
                  tuningGroups,
                  applyPreset,
                  updateConfig: updateStreamingConfig,
                  resetDefaults: resetStreamingDefaults,
                  detectorWarnings,
                  recentDecisionEntries,
                  recentSegmentEntries,
                }}
                microphone={{
                  error: micError,
                  mode: micMode,
                  setMode: setMicMode,
                  isActive: isMicActive,
                  start: handleStartMicrophoneCapture,
                  stop: handleStopMicrophoneCapture,
                  flush: flushMicrophoneUtterance,
                  status: micStatus,
                  isLoadingSample,
                  supportsInput: supportsMicrophoneInput,
                }}
                debugHud={{
                  isVisible: hudVisible,
                  setVisible: setHudVisible,
                }}
              />
              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <TranscriptPanel app={app} />
                <div className="space-y-6">
                  <ReferencePanel app={app} />
                  <HistoryPanel app={app} />
                </div>
              </div>
            </div>

            {typeof SharedArrayBuffer === 'undefined' && app.backend === 'wasm' ? (
              <div className="panel-shell border-amber-200/80 bg-amber-50/90 text-[12px] text-amber-900">
                SharedArrayBuffer unavailable. WASM will run single-threaded.
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
