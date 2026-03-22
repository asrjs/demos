import React from 'react';
import {
  clampStreamingControlValue,
  formatStreamingControlHint,
  formatStreamingControlValue,
  listStreamingControls,
  normalizeStreamingControlValue,
  resolveStreamingControlConstraints,
  resolveStreamingControlStep,
  STREAMING_GATE_MODES,
  STREAMING_TIMELINE_CHUNK_MS,
} from '@asrjs/speech-recognition/realtime';
import { StreamingDebugHud } from './shared/streaming/components/StreamingDebugHud.jsx';
import { WaveformCanvas } from './shared/streaming/components/WaveformCanvas.jsx';
import { SignalMeter } from './shared/streaming/components/SignalMeter.jsx';

function formatFixed(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatMilliseconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} ms` : '--';
}

function formatDbfsValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : '--';
}

function formatPercentValue(value, digits = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '--';
}

function formatSecondsValue(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} s` : '--';
}

function formatSampleRate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value).toLocaleString()} Hz` : '--';
}

function getSegmentDurationSeconds(segment, sampleRate) {
  if (!segment || typeof sampleRate !== 'number' || sampleRate <= 0) return null;
  return (segment.endFrame - segment.startFrame) / sampleRate;
}

function Widget({ title, children, actions, className = '', titleAttr }) {
  return (
    <section className={`panel-shell ${className}`} title={titleAttr}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="panel-title">{title}</div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="field-label">{label}</span>
        {hint ? <span className="text-[10px] text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function ToggleRow({ id, label, checked, disabled, onChange }) {
  return (
    <div className="compact-toggle">
      <label htmlFor={id}>{label}</label>
      <div className="relative inline-block w-10 align-middle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="toggle-checkbox absolute block h-5 w-5 appearance-none rounded-full border-4 border-slate-300 bg-white cursor-pointer"
        />
        <label htmlFor={id} className="toggle-label block h-5 overflow-hidden rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

function MonoStat({ label, value, note }) {
  return (
    <div className="mono-row">
      <span className="mono-key">{label}</span>
      <span className="mono-value">{value}</span>
      {note ? <span className="mono-note">{note}</span> : null}
    </div>
  );
}

function SliderRow({ definition, value, onChange, resolvedConfig }) {
  const resolvedControlStep = resolveStreamingControlStep(definition, resolvedConfig);
  const resolvedConstraints = resolveStreamingControlConstraints(definition, resolvedConfig);
  const clampedValue = clampStreamingControlValue(
    definition,
    typeof value === 'number' ? value : definition.min,
    resolvedConfig,
  );
  return (
    <label className="demo-soft-box block" title={`${definition.description} ${definition.guide}`}>
      <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] text-slate-500">
        <span>{definition.label}</span>
        <span>{formatStreamingControlValue(definition, value)}</span>
      </div>
      <input
        type="range"
        min={resolvedConstraints.min}
        max={resolvedConstraints.max}
        step={resolvedControlStep}
        value={clampedValue}
        onChange={(event) =>
          onChange(
            normalizeStreamingControlValue(
              definition,
              Number(event.target.value),
              resolvedConfig,
            ),
          )
        }
        className="w-full accent-[#5d7387]"
      />
      <div className="mt-2 font-mono text-[10px] leading-4 text-slate-500">
        {formatStreamingControlHint(definition, resolvedConfig)}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-slate-600">{definition.description}</div>
      <div className="mt-1 text-[10px] leading-4 text-slate-400">{definition.guide}</div>
    </label>
  );
}

export function BrowserConsoleLayout({ app }) {
  const [modelSidebarCollapsed, setModelSidebarCollapsed] = React.useState(false);
  const [waveformScaleMode, setWaveformScaleMode] = React.useState('adaptive');
  const [showTenVadThreshold, setShowTenVadThreshold] = React.useState(true);
  const [showPreVadOverlay, setShowPreVadOverlay] = React.useState(false);
  const streamingControlDefinitions = React.useMemo(() => listStreamingControls(), []);
  const {
    asrjsVersion,
    asrjsSource,
    darkMode,
    setDarkMode,
    status,
    modelSource,
    loadedFromCache,
    isModelReady,
    isLoading,
    liveStatusTone,
    activeModelLabel,
    modelRevision,
    backend,
    threadingStatus,
    progressPct,
    progressText,
    loadModel,
    modelPanel,
    streamingPanel,
    transcriptPanel,
  } = app;

  const {
    MODEL_SOURCE_OPTIONS,
    isInIframe,
    supportsLocalSource,
    modelConfig,
    modelSourceValue,
    handleModelSourceChange,
    selectedModel,
    handleModelChange,
    MODEL_OPTIONS,
    modelFolderInputRef,
    handleLocalFolderInput,
    localFolderName,
    pickLocalModelFolder,
    localHandlePersistenceSupported,
    hasPersistedLocalHandle,
    needsLocalHandleReconnect,
    reconnectPersistedFolder,
    localEntries,
    localDetectedArtifacts,
    encoderBackend,
    setEncoderBackend,
    encoderBackendOptions,
    decoderBackend,
    setDecoderBackend,
    decoderBackendOptions,
    maxCores,
    cpuThreads,
    setCpuThreads,
    frameStride,
    setFrameStride,
    supportsSplitQuantization,
    encoderQuant,
    setEncoderQuant,
    encoderQuantOptions,
    decoderQuant,
    setDecoderQuant,
    decoderQuantOptions,
    supportsPreprocessorBackend,
    preprocessorBackend,
    setPreprocessorBackend,
    preprocessorBackendOptions,
    preprocessor,
    setPreprocessor,
    localPreprocessorOptions,
    hostedModelUsesJsFrontend,
    supportsCanaryPrompting,
    canaryTask,
    setCanaryTask,
    effectiveCanaryTargetLanguage,
    setCanaryTargetLanguage,
    canaryPnc,
    setCanaryPnc,
    canaryTimestamps,
    setCanaryTimestamps,
    selectedLanguageName,
    effectiveTargetLanguageName,
    localTokenizerName,
    setLocalTokenizerName,
    localTokenizerOptions,
    verboseLog,
    setVerboseLog,
    dumpDetail,
    setDumpDetail,
    enableProfiling,
    setEnableProfiling,
  } = modelPanel;

  const {
    statusLabel,
    micStatus,
    micError,
    micMode,
    setMicMode,
    micModeLabel,
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
    activeProfileLabel,
    defaultMode,
    applyPreset,
    updateStreamingConfig,
    resetStreamingDefaults,
    streamingPresets,
    detectorWarnings,
    recentDecisionEntries,
    recentSegmentEntries,
    latestMetrics,
    audioUrl,
    audioRef,
    isPlaying,
    pauseAudio,
    playAudio,
    sampleDownload,
    downloadCurrentSample,
    isDownloadingSample,
    isLoadingSample,
    canLoadSampleForLanguage,
    selectedLanguage,
    testLanguageOptions,
    handleLanguageChange,
    loadRandomSample,
    fileInputRef,
    transcribeFile,
    isTranscribing,
  } = streamingPanel;
  const streamingChunkDurationMs =
    streamingSnapshot?.config?.chunkDurationMs ?? STREAMING_TIMELINE_CHUNK_MS;
  const estimatedRoughSmoothMs = streamingSnapshot?.config?.energySmoothingDurationMs ?? null;
  const estimatedRoughSilenceMs = streamingSnapshot?.config?.minSilenceDurationMs ?? null;
  const estimatedTenSilenceMs =
    typeof streamingSnapshot?.config?.tenVadConfirmationWindowMs === 'number' &&
    typeof streamingSnapshot?.config?.tenVadMinSilenceDurationMs === 'number'
      ? Math.max(
          streamingSnapshot.config.tenVadConfirmationWindowMs,
          streamingSnapshot.config.tenVadMinSilenceDurationMs,
        )
      : null;
  const estimatedTailBudgetMs =
    typeof estimatedRoughSmoothMs === 'number' &&
    typeof estimatedRoughSilenceMs === 'number' &&
    typeof estimatedTenSilenceMs === 'number'
      ? estimatedRoughSmoothMs + estimatedRoughSilenceMs + estimatedTenSilenceMs
      : null;

  const {
    text,
    copyToClipboard,
    referenceText,
    setReferenceText,
    isCanaryTranslationMode,
    transcriptions,
    clearTranscriptions,
  } = transcriptPanel;

  return (
    <div className="demo-shell">
      <div className="demo-container">
        <header className="demo-topbar">
          <div className="demo-tabs">
            <span className="demo-tab demo-tab-idle">Streaming</span>
            <span className="demo-tab demo-tab-active">Realtime Lab</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-600">
            <button
              type="button"
              className="compact-button-secondary !px-3 !py-2"
              onClick={() => setModelSidebarCollapsed((value) => !value)}
              aria-expanded={!modelSidebarCollapsed}
              title={modelSidebarCollapsed ? 'Show model sidebar' : 'Hide model sidebar'}
            >
              {modelSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
            </button>
            <span>{status}</span>
            {loadedFromCache && modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE && isModelReady ? <span>cache</span> : null}
            <span>@asrjs {asrjsVersion}</span>
            <span>{asrjsSource}</span>
            <button type="button" className="demo-gear" onClick={() => setDarkMode(!darkMode)} aria-label="Toggle theme">
              <span className="material-icons-outlined text-[18px]">settings</span>
            </button>
          </div>
        </header>

        <div className={modelSidebarCollapsed ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)]' : 'grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]'}>
          <aside className={modelSidebarCollapsed ? 'hidden' : 'space-y-4'}>
            <Widget
              title="Load"
              titleAttr={modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? 'Loading local artifacts' : `Revision ${modelRevision}`}
              actions={<span className="font-mono text-[10px] text-slate-500">{isModelReady ? 'ready' : isLoading ? 'loading' : 'idle'}</span>}
            >
              <div className="space-y-3">
                <div className="demo-soft-box">
                  <div className="text-[13px] font-semibold text-slate-900">{activeModelLabel}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? 'Local assets' : `Revision ${modelRevision}`}
                  </div>
                </div>
                <button onClick={loadModel} disabled={isLoading || isModelReady} className="compact-button-dark w-full">
                  {isModelReady ? 'Model Loaded' : isLoading ? 'Loading…' : 'Load Model'}
                </button>
                {progressPct !== null ? (
                  <div className="space-y-1.5">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-[#5d7387]" style={{ width: `${progressPct}%` }} />
                    </div>
                    {progressText ? <div className="text-[11px] text-slate-500">{progressText}</div> : null}
                  </div>
                ) : progressText ? (
                  <div className="text-[11px] text-slate-500">{progressText}</div>
                ) : null}
              </div>
            </Widget>

            <Widget title="Validation" titleAttr="Sample audio and file transcription checks">
              <div className="space-y-3">
                <div className="demo-soft-box">
                  <div className="flex flex-col gap-3">
                    <Field label="Input language">
                      <div className="relative">
                        <select value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} disabled={!isModelReady} className="compact-control">
                          {testLanguageOptions.map((lang) => <option key={lang.code} value={lang.code}>{lang.displayName}</option>)}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                      </div>
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      {audioUrl ? (
                        <>
                          <audio
                            ref={audioRef}
                            src={audioUrl}
                            onEnded={() => app.setIsPlaying(false)}
                            onPause={() => app.setIsPlaying(false)}
                            onPlay={() => app.setIsPlaying(true)}
                          />
                          <button type="button" onClick={isPlaying ? pauseAudio : playAudio} className="compact-button-secondary !px-3" title={isPlaying ? 'Pause sample' : 'Play sample'}>
                            <span className="material-icons-outlined text-[16px]">{isPlaying ? 'pause' : 'play_arrow'}</span>
                          </button>
                          {sampleDownload ? (
                            <button type="button" onClick={downloadCurrentSample} disabled={isDownloadingSample || isLoadingSample || isTranscribing} className="compact-button-secondary !px-3" title={sampleDownload.sourceUrl ? `Download original sample: ${sampleDownload.filename}` : 'Download original sample'}>
                              <span className="material-icons-outlined text-[16px]">download</span>
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      <button type="button" onClick={loadRandomSample} disabled={!isModelReady || !canLoadSampleForLanguage || isLoadingSample || isTranscribing || isDownloadingSample} className="compact-button-dark">
                        {isLoadingSample ? 'Loading…' : canLoadSampleForLanguage ? 'Load Sample' : 'No Sample'}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="demo-upload-zone block cursor-pointer" title="Upload .wav, .mp3, or .ogg">
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={transcribeFile} disabled={!isModelReady || isTranscribing} className="hidden" />
                  <span className="material-icons-outlined mb-2 block text-[32px] text-slate-400">upload_file</span>
                  <div className="font-medium text-slate-700">Drop or click to transcribe</div>
                </label>
              </div>
            </Widget>

            <Widget title="Model Settings" titleAttr="Model source, artifact selection, and local folder controls">
              <div className="space-y-3">
                <Field label="Artifact source">
                  <div className="relative">
                    <select
                      value={modelSourceValue}
                      onChange={(e) => handleModelSourceChange(e.target.value)}
                      disabled={isLoading || isModelReady}
                      className="compact-control"
                    >
                      <option value={MODEL_SOURCE_OPTIONS.HUGGINGFACE}>Hugging Face</option>
                      {!isInIframe && supportsLocalSource ? <option value={MODEL_SOURCE_OPTIONS.LOCAL}>Local folder</option> : null}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                  </div>
                </Field>

                {modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE ? (
                  <Field label="Model">
                    <div className="relative">
                      <select
                        value={selectedModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="compact-control"
                      >
                        {MODEL_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.displayName}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                    </div>
                  </Field>
                ) : (
                  <div className="space-y-3">
                    <input
                      ref={modelFolderInputRef}
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleLocalFolderInput}
                      className="hidden"
                    />
                    <Field label="Local folder">
                      <div className="flex gap-2">
                        <div className="compact-control truncate">{localFolderName || 'No folder selected'}</div>
                        <button type="button" onClick={pickLocalModelFolder} disabled={isLoading || isModelReady} className="compact-button-secondary !px-3" title="Pick folder">
                          <span className="material-icons-outlined text-[16px]">folder_open</span>
                        </button>
                      </div>
                    </Field>
                    {localHandlePersistenceSupported && hasPersistedLocalHandle && needsLocalHandleReconnect ? (
                      <button type="button" onClick={reconnectPersistedFolder} disabled={isLoading || isModelReady} className="compact-button-secondary w-full">
                        Restore Saved Folder
                      </button>
                    ) : null}
                    <div className="demo-soft-box space-y-1 text-[11px] text-slate-500">
                      <div>Files: {localEntries.length || 0}</div>
                      <div>Encoder: {localDetectedArtifacts.encoder.length ? localDetectedArtifacts.encoder.join(', ') : 'none'}</div>
                      <div>Decoder: {localDetectedArtifacts.decoder.length ? localDetectedArtifacts.decoder.join(', ') : 'none'}</div>
                      <div>Tokenizer: {localDetectedArtifacts.tokenizers.length ? localDetectedArtifacts.tokenizers.join(', ') : 'none'}</div>
                      <div>Frontend: {localDetectedArtifacts.preprocessors.length ? localDetectedArtifacts.preprocessors.join(', ') : 'none'}</div>
                    </div>
                  </div>
                )}

                {modelConfig?.description ? (
                  <div className="demo-soft-box text-[11px] text-slate-600" title={modelConfig.description}>
                    {modelConfig.displayName}
                  </div>
                ) : null}
              </div>
            </Widget>

            <Widget title="Runtime Settings" titleAttr="Backends, threading, stride, and quantization">
              <div className="space-y-3">
                <Field label="Runtime backend">
                  <div className="relative">
                    <select value={backend} onChange={(e) => app.setBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                      <option value="webgpu-hybrid">WebGPU</option>
                      <option value="wasm">WASM</option>
                    </select>
                    <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Encoder">
                    <div className="relative">
                      <select value={encoderBackend} onChange={(e) => setEncoderBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                        {encoderBackendOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                    </div>
                  </Field>
                  <Field label="Decoder">
                    <div className="relative">
                      <select value={decoderBackend} onChange={(e) => setDecoderBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                        {decoderBackendOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                    </div>
                  </Field>
                  <Field label="Threads">
                    <input type="number" min="1" max={maxCores} value={cpuThreads} onChange={(e) => setCpuThreads(Number(e.target.value))} disabled={isLoading || isModelReady} className="compact-control" />
                  </Field>
                  <Field label="Stride">
                    <input type="number" value={frameStride} onChange={(e) => setFrameStride(Number(e.target.value))} className="compact-control" />
                  </Field>
                </div>
                {supportsSplitQuantization ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Encoder quant">
                      <div className="relative">
                        <select value={encoderQuant} onChange={(e) => setEncoderQuant(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                          {encoderQuantOptions.map((quant) => <option key={quant} value={quant}>{quant}</option>)}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                      </div>
                    </Field>
                    <Field label="Decoder quant">
                      <div className="relative">
                        <select value={decoderQuant} onChange={(e) => setDecoderQuant(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                          {decoderQuantOptions.map((quant) => <option key={quant} value={quant}>{quant}</option>)}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                      </div>
                    </Field>
                  </div>
                ) : null}
              </div>
            </Widget>

            <Widget title="Prompt Settings" titleAttr="Frontend choice, Canary options, tokenizer, and logging flags">
              <div className="space-y-3">
                {supportsPreprocessorBackend ? (
                  <>
                    <Field label="Frontend">
                      <div className="relative">
                        <select value={preprocessorBackend} onChange={(e) => setPreprocessorBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                          {preprocessorBackendOptions.includes('js') ? <option value="js">JS frontend</option> : null}
                          {preprocessorBackendOptions.includes('onnx') ? <option value="onnx" disabled={modelSource === MODEL_SOURCE_OPTIONS.LOCAL && localPreprocessorOptions.length === 0}>ONNX frontend</option> : null}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                      </div>
                    </Field>
                    {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && preprocessorBackend === 'onnx' && localPreprocessorOptions.length > 0 ? (
                      <Field label="Preprocessor">
                        <div className="relative">
                          <select value={preprocessor} onChange={(e) => setPreprocessor(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                            {localPreprocessorOptions.map((name) => <option key={name} value={name}>{name}.onnx</option>)}
                          </select>
                          <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                        </div>
                      </Field>
                    ) : null}
                    {hostedModelUsesJsFrontend ? <div className="text-[11px] text-slate-500">JS default</div> : null}
                  </>
                ) : (
                  <div className="text-[11px] text-slate-500">Built-in MedASR frontend</div>
                )}
                {supportsCanaryPrompting ? (
                  <div className="demo-soft-box space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="panel-title">Canary</div>
                      <span className="font-mono text-[10px] text-slate-500">canary2</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Task">
                        <div className="relative">
                          <select value={canaryTask} onChange={(e) => setCanaryTask(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                            <option value="asr">ASR</option>
                            <option value="translation">Speech Translation</option>
                          </select>
                          <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                        </div>
                      </Field>
                      <Field label="Target">
                        <div className="relative">
                          <select value={effectiveCanaryTargetLanguage} onChange={(e) => setCanaryTargetLanguage(e.target.value)} disabled={isLoading || isModelReady || canaryTask === 'asr'} className="compact-control">
                            {modelConfig?.languages?.map((languageCode) => (
                              <option key={languageCode} value={languageCode}>{app.getBuiltInModelLanguageName(languageCode)}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                        </div>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setCanaryPnc((current) => !current)} disabled={isLoading || isModelReady} className={canaryPnc ? 'compact-button-dark w-full' : 'compact-button-secondary w-full'}>
                        PnC {canaryPnc ? 'On' : 'Off'}
                      </button>
                      <button type="button" onClick={() => setCanaryTimestamps((current) => !current)} disabled={isLoading || isModelReady} className={canaryTimestamps ? 'compact-button-dark w-full' : 'compact-button-secondary w-full'}>
                        Timestamps {canaryTimestamps ? 'On' : 'Off'}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500">{selectedLanguageName} {'->'} {effectiveTargetLanguageName}</div>
                  </div>
                ) : null}

                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? (
                  <Field label="Tokenizer">
                    <div className="relative">
                      <select value={localTokenizerName} onChange={(e) => setLocalTokenizerName(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                        {localTokenizerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-2.5 material-icons-outlined text-[16px] text-slate-400">expand_more</span>
                    </div>
                  </Field>
                ) : null}

                <div className="space-y-2">
                  <ToggleRow id="verbose" label="Verbose logging" checked={verboseLog} disabled={isLoading || isModelReady} onChange={(event) => setVerboseLog(event.target.checked)} />
                  <ToggleRow id="log-results" label="Log results" checked={dumpDetail} disabled={false} onChange={(event) => setDumpDetail(event.target.checked)} />
                  <ToggleRow id="profiling" label="Enable profiling" checked={enableProfiling} disabled={false} onChange={(event) => setEnableProfiling(event.target.checked)} />
                </div>
              </div>
            </Widget>
          </aside>

          <main className="space-y-4">
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
              <div className="space-y-4">
                <Widget title="Capture">
                  <div className="space-y-3">
                    <div className="demo-soft-box">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-full sm:w-[180px]">
                          <Field label="Waveform scale">
                            <select
                              value={waveformScaleMode}
                              onChange={(event) => setWaveformScaleMode(event.target.value)}
                              className="compact-control"
                            >
                              <option value="adaptive">adaptive</option>
                              <option value="physical">physical</option>
                            </select>
                          </Field>
                        </div>
                        <div className="w-full sm:w-[160px]">
                          <Field label="TEN-VAD line">
                            <select
                              value={showTenVadThreshold ? 'on' : 'off'}
                              onChange={(event) => setShowTenVadThreshold(event.target.value === 'on')}
                              className="compact-control"
                            >
                              <option value="on">on</option>
                              <option value="off">off</option>
                            </select>
                          </Field>
                        </div>
                        <div className="w-full sm:w-[180px]">
                          <Field label="RMS overlay">
                            <select
                              value={showPreVadOverlay ? 'on' : 'off'}
                              onChange={(event) => setShowPreVadOverlay(event.target.value === 'on')}
                              className="compact-control"
                            >
                              <option value="off">off</option>
                              <option value="on">on</option>
                            </select>
                          </Field>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">
                          speech {formatDbfsValue(streamingSnapshot?.config?.minSpeechLevelDbfs)} · ten {formatFixed(streamingSnapshot?.config?.tenVadThreshold)} · gate {streamingSnapshot?.gate?.effectiveMode ?? '--'}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <WaveformCanvas
                        monitor={streamingMonitor}
                        capture={streamingCaptureInfo}
                        scaleMode={waveformScaleMode}
                        showTenVadThreshold={showTenVadThreshold}
                        showPreVadOverlay={showPreVadOverlay}
                      />
                      <SignalMeter monitor={streamingMonitor} capture={streamingCaptureInfo} />
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <div className="space-y-3">
                      <div className="demo-soft-box">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="panel-title">Microphone</div>
                            {micError ? <div className="mt-2 text-[11px] text-rose-600">{micError}</div> : null}
                          </div>
                          <div className="w-full md:w-[160px]">
                            <Field label="Mode">
                              <select value={micMode} onChange={(event) => setMicMode(event.target.value)} disabled={isMicActive} className="compact-control">
                                <option value="manual">Manual</option>
                                <option value="speech-detect">Speech Detect</option>
                              </select>
                            </Field>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={isMicActive ? () => handleStopMicrophoneCapture({ flush: true }) : handleStartMicrophoneCapture}
                            disabled={isLoadingSample || !supportsMicrophoneInput}
                            className={isMicActive ? 'compact-button-secondary' : 'compact-button-dark'}
                          >
                            {isMicActive ? 'Stop Mic' : 'Start Mic'}
                          </button>
                          {isMicActive || micMode === 'speech-detect' ? (
                            <button type="button" onClick={() => flushMicrophoneUtterance('manual')} className="compact-button-secondary">
                              Send Now
                            </button>
                          ) : null}
                          <span className="font-mono text-[11px] text-slate-600">{micStatus}</span>
                          <button type="button" onClick={() => setHudVisible(!hudVisible)} className="compact-button-secondary !py-2">
                            {hudVisible ? 'Hide Advanced' : 'Advanced'}
                          </button>
                        </div>
                      </div>
                      {detectorWarnings.length > 0 ? (
                        <div className="demo-soft-box space-y-2">
                          <div className="panel-title">Warnings</div>
                          {detectorWarnings.map((warning) => (
                            <div key={warning} className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                              {warning}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      </div>

                      <div className="space-y-3">
                        <Widget title="Detector Tuning" className="!p-3">
                          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                            <div className="demo-soft-box">
                              <label className="mb-1 block font-mono text-[10px] text-slate-500">preset</label>
                              <select
                                value={profileId}
                                onChange={(event) => applyPreset(event.target.value)}
                                className="compact-control"
                              >
                                {streamingPresets.map((preset) => (
                                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                                ))}
                                <option value="custom">Custom</option>
                              </select>
                            </div>
                            <div className="demo-soft-box font-mono text-[10px] text-slate-500">
                              default {defaultMode}
                            </div>
                          </div>
                          <div className="mb-3 grid gap-2 md:grid-cols-2">
                            <div className="demo-soft-box">
                              <label className="mb-1 block font-mono text-[10px] text-slate-500">gate mode</label>
                              <select
                                value={streamingSnapshot?.config?.gateMode ?? STREAMING_GATE_MODES.ROUGH_AND_TEN_VAD}
                                onChange={(event) => updateStreamingConfig({ gateMode: event.target.value })}
                                className="compact-control"
                              >
                                <option value={STREAMING_GATE_MODES.ROUGH_ONLY}>rough only</option>
                                <option value={STREAMING_GATE_MODES.TEN_VAD_ONLY}>ten-vad only</option>
                                <option value={STREAMING_GATE_MODES.ROUGH_AND_TEN_VAD}>rough + ten-vad</option>
                              </select>
                            </div>
                            <div className="demo-soft-box font-mono text-[10px] text-slate-500">
                              effective {streamingSnapshot?.gate?.effectiveMode ?? '--'}
                            </div>
                          </div>
                          <div className="mb-3 demo-soft-box font-mono text-[10px] text-slate-600">
                            tail est {formatMilliseconds(estimatedTailBudgetMs)} = rough_smooth {formatMilliseconds(estimatedRoughSmoothMs)} + rough_silence {formatMilliseconds(estimatedRoughSilenceMs)} + ten_silence {formatMilliseconds(estimatedTenSilenceMs)}
                          </div>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {streamingControlDefinitions.map((definition) => (
                              <SliderRow
                                key={definition.field}
                                definition={definition}
                                value={streamingSnapshot?.config?.[definition.field]}
                                resolvedConfig={streamingSnapshot?.config ?? { chunkDurationMs: streamingChunkDurationMs }}
                                onChange={(value) => updateStreamingConfig({ [definition.field]: value })}
                              />
                            ))}
                          </div>
                        </Widget>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <Widget title="Decisions" className="!p-3">
                            <div className="space-y-2">
                              {recentDecisionEntries.length > 0 ? recentDecisionEntries.map((entry) => (
                                <div key={entry.id} className="demo-soft-box">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-[12px] font-medium text-slate-900">{entry.message}</div>
                                    <div className="text-[10px] text-slate-400">{entry.at}</div>
                                  </div>
                                </div>
                              )) : <div className="text-[12px] text-slate-500">No decisions yet.</div>}
                            </div>
                          </Widget>
                          <Widget title="Segments" className="!p-3">
                            <div className="space-y-2">
                              {recentSegmentEntries.length > 0 ? recentSegmentEntries.map((segment) => {
                                const duration = getSegmentDurationSeconds(segment, segment.sampleRate);
                                return (
                                  <div key={`${segment.startFrame}-${segment.endFrame}`} className="demo-soft-box">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-[12px] font-medium text-slate-900">{segment.reason || 'segment'}</div>
                                      <div className="text-[10px] text-slate-400">{formatSecondsValue(duration)}</div>
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      {formatSampleRate(segment.sampleRate)} · {segment.startFrame} {'->'} {segment.endFrame}
                                    </div>
                                  </div>
                                );
                              }) : <div className="text-[12px] text-slate-500">No segments yet.</div>}
                            </div>
                          </Widget>
                        </div>
                      </div>
                    </div>
                  </div>

                  {hudVisible ? (
                    <div className="mt-4">
                      <StreamingDebugHud
                        snapshot={streamingSnapshot}
                        isVisible={hudVisible}
                        profileId={profileId}
                        defaultMode={defaultMode}
                        presets={streamingPresets}
                        onClose={() => setHudVisible(false)}
                        onProfileChange={applyPreset}
                        onConfigChange={(field, value) => updateStreamingConfig({ [field]: value })}
                        onReset={resetStreamingDefaults}
                      />
                    </div>
                  ) : null}
                </Widget>
              </div>

              <div className="space-y-4">
                <Widget
                  title="Transcript"
                  actions={text ? <button type="button" onClick={() => copyToClipboard(text)} className="compact-button-secondary !py-2">Copy</button> : null}
                >
                  <div className="demo-soft-box min-h-[180px] text-[14px] leading-7 text-slate-800">
                    {text || 'No text yet.'}
                  </div>
                  <div className="mono-grid mt-3">
                    <MonoStat
                      label="Total"
                      value={formatMilliseconds(latestMetrics?.total_ms)}
                      note={latestMetrics ? `encode ${formatMilliseconds(latestMetrics.encode_ms)}` : 'Awaiting result'}
                    />
                    <MonoStat
                      label="Decode"
                      value={formatMilliseconds(latestMetrics?.decode_ms)}
                      note={latestMetrics ? `rtf ${formatFixed(latestMetrics.rtf)}x` : 'Awaiting result'}
                    />
                    <MonoStat
                      label="Confidence"
                      value={transcriptions[0]?.confidence ? formatPercentValue(transcriptions[0].confidence) : '--'}
                      note={transcriptions[0]?.wordCount ? `${transcriptions[0].wordCount} words` : 'No finished utterance'}
                    />
                    <MonoStat
                      label="Queue"
                      value={isTranscribing ? 'busy' : 'clear'}
                      note={isTranscribing ? 'Decoder is processing audio' : 'Ready'}
                    />
                  </div>
                </Widget>

                <Widget
                  title="Reference"
                  actions={referenceText ? <button type="button" onClick={() => copyToClipboard(referenceText)} className="compact-button-secondary !py-2">Copy</button> : null}
                >
                  <textarea
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    className="compact-control min-h-[180px] resize-y !p-4 !leading-7"
                    placeholder="Paste reference text..."
                  />
                  {isCanaryTranslationMode ? (
                    <div className="mt-2 text-[11px] text-amber-700">
                      Reference is hidden while Canary translates from {selectedLanguageName} to {effectiveTargetLanguageName}.
                    </div>
                  ) : null}
                </Widget>
              </div>
            </div>

            {transcriptions.length > 0 ? (
              <Widget
                title="History"
                actions={<button type="button" onClick={clearTranscriptions} className="compact-button-secondary !py-2">Clear All</button>}
              >
                <div className="grid gap-3 xl:grid-cols-2">
                  {transcriptions.map((trans) => (
                    <div key={trans.id} className="demo-soft-box">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-[12px] font-semibold text-slate-900">{trans.filename}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {trans.language ? app.getBuiltInModelLanguageName(trans.language) : 'Unknown language'}
                            {trans.targetLanguage && ` -> ${app.getBuiltInModelLanguageName(trans.targetLanguage)}`}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400">{trans.timestamp}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                        <span>{trans.duration.toFixed(1)}s</span>
                        <span>{trans.wordCount} words</span>
                        {trans.confidence ? <span>{formatPercentValue(trans.confidence)}</span> : null}
                        {trans.metrics ? <span>RTF {formatFixed(trans.metrics.rtf)}x</span> : null}
                      </div>
                      {trans.clipUrl ? (
                        <div className="mt-3 space-y-2">
                          <audio
                            controls
                            preload="none"
                            src={trans.clipUrl}
                            className="w-full"
                          />
                          <div className="flex justify-end">
                            <a
                              href={trans.clipUrl}
                              download={trans.clipFilename ?? `${trans.filename || 'clip'}.wav`}
                              className="compact-button-secondary !px-3 !py-2 no-underline"
                              title={trans.clipFilename ? `Download ${trans.clipFilename}` : 'Download clip'}
                              aria-label={trans.clipFilename ? `Download ${trans.clipFilename}` : 'Download clip'}
                            >
                              <span className="material-icons-outlined text-[16px]">download</span>
                            </a>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-[12px] leading-6 text-slate-800">
                        {trans.text}
                      </div>
                    </div>
                  ))}
                </div>
              </Widget>
            ) : null}

            {typeof SharedArrayBuffer === 'undefined' && backend === 'wasm' ? (
              <div className="panel-shell text-[12px] text-amber-800">
                SharedArrayBuffer unavailable. WASM will run single-threaded.
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
