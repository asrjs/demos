import React from 'react';
import {
  estimateStreamingReleaseMs,
  resolveStreamingControlGroups,
  resolveStreamingForegroundThresholdDbfs,
  resolveStreamingOnsetThresholdDbfs,
  resolveStreamingSnapshotNoiseFloorDbfs,
  STREAMING_TIMELINE_CHUNK_MS,
} from '@asrjs/speech-recognition/realtime';
import {
  DEFAULT_BROWSER_MONITOR_SURFACE_MODE,
  DEFAULT_BROWSER_WAVEFORM_SCALE_MODE,
} from '@asrjs/speech-recognition/browser';
import { StreamingCapturePanel } from './shared/streaming/components/StreamingCapturePanel.jsx';
import { BrowserConsoleTopbar } from './shared/browser-console/components/BrowserConsoleTopbar.jsx';
import { ModelSidebar } from './shared/browser-console/components/ModelSidebar.jsx';
import { TranscriptPanel } from './shared/browser-console/components/TranscriptPanel.jsx';
import { ReferencePanel } from './shared/browser-console/components/ReferencePanel.jsx';
import { HistoryPanel } from './shared/browser-console/components/HistoryPanel.jsx';

export function BrowserConsoleLayout({ app }) {
  const [modelSidebarCollapsed, setModelSidebarCollapsed] = React.useState(false);
  const [waveformDisplayMode, setWaveformDisplayMode] = React.useState(DEFAULT_BROWSER_MONITOR_SURFACE_MODE);
  const [waveformScaleMode, setWaveformScaleMode] = React.useState(DEFAULT_BROWSER_WAVEFORM_SCALE_MODE);
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
  const liveOnsetThresholdDbfs = showSpeechThreshold
    ? resolveStreamingOnsetThresholdDbfs(streamingSnapshot?.config, liveNoiseFloorDbfs)
    : null;

  const layoutClass = modelSidebarCollapsed
    ? 'app-layout app-layout--sidebar-collapsed'
    : 'app-layout app-layout--sidebar';

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

        <div className={layoutClass}>
          <ModelSidebar app={app} hidden={modelSidebarCollapsed} />

          <main className="app-main">
            <div className="app-stack">
              <StreamingCapturePanel
                waveformDisplay={{
                  displayMode: waveformDisplayMode,
                  setDisplayMode: setWaveformDisplayMode,
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
                  liveOnsetThresholdDbfs,
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
              <div className="app-transcript-grid">
                <TranscriptPanel app={app} />
                <div className="app-stack">
                  <ReferencePanel app={app} />
                  <HistoryPanel app={app} />
                </div>
              </div>
            </div>

            {typeof SharedArrayBuffer === 'undefined' && app.backend === 'wasm' ? (
              <div className="sab-notice">
                SharedArrayBuffer unavailable. WASM will run single-threaded.
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
