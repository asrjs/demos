import React from 'react';
import { StreamingDebugHud } from './shared/streaming/components/StreamingDebugHud.jsx';

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

function toneClasses(tone) {
  const tones = {
    live: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    ready: 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    danger: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
    muted: 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    idle: 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };

  return tones[tone] ?? tones.muted;
}

function StatusTag({ label, tone = 'muted' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClasses(tone)}`}>
      {label}
    </span>
  );
}

function SummaryTile({ label, value, detail, tone = 'muted' }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/85 p-4 dark:border-slate-800 dark:bg-slate-900/55">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClasses(tone)}`}>
          {tone}
        </span>
      </div>
      <div className="mt-3 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  );
}

function ControlSection({ eyebrow, title, description, children }) {
  return (
    <section className="rounded-[26px] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ id, label, checked, disabled, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative inline-block w-10 align-middle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="toggle-checkbox absolute block h-5 w-5 appearance-none rounded-full border-4 border-slate-300 bg-white cursor-pointer dark:border-slate-600"
        />
        <label
          htmlFor={id}
          className="toggle-label block h-5 overflow-hidden rounded-full bg-slate-300 dark:bg-slate-700"
        />
      </div>
    </div>
  );
}

export function BrowserConsoleLayout({ app }) {
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

  const {
    text,
    copyToClipboard,
    referenceText,
    setReferenceText,
    isCanaryTranslationMode,
    transcriptions,
    clearTranscriptions,
  } = transcriptPanel;

  const activeSegmentSeconds = getSegmentDurationSeconds(
    streamingSnapshot?.activeSegment,
    streamingSnapshot?.sampleRate,
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#edf2fb] font-sans text-slate-900 transition-colors duration-300 dark:bg-[#08111b] dark:text-slate-100">
      <div className="dashboard-mesh" />
      <div className="dashboard-grid-overlay" />
      <div className="relative mx-auto max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[30px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-200">
                  Realtime Speech Console
                </span>
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/60">
                  @asrjs/speech-recognition {asrjsVersion}
                </span>
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/60">
                  {asrjsSource}
                </span>
              </div>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                  Streaming, VAD ve transcription akışını aynı yüzeyde izle.
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Model ayarlarını ayrı tutup canlı capture, gate kararları, TEN-VAD durumu ve decode metriklerini
                  operasyon konsolu gibi görünür hale getiren yeni yerleşim.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <StatusTag label={status} tone={liveStatusTone} />
              {modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE && loadedFromCache && isModelReady && (
                <StatusTag label="Loaded from cache" tone="ready" />
              )}
              <a
                href="https://github.com/asrjs/speech-recognition"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
                title="View on GitHub"
              >
                GitHub
              </a>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
                onClick={() => setDarkMode(!darkMode)}
                aria-label="Toggle theme"
              >
                <span className="material-icons-outlined text-[20px]">brightness_4</span>
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="self-start xl:sticky xl:top-4">
            <div className="control-rail space-y-4 rounded-[30px] border border-white/75 bg-white/84 p-4 shadow-[0_22px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80">
              <div className="rounded-[26px] border border-slate-200/80 bg-slate-950 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                      Launch State
                    </div>
                    <div className="mt-2 text-xl font-semibold">{activeModelLabel}</div>
                    <div className="mt-1 text-sm text-slate-300">
                      {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? 'Local assets' : `Revision ${modelRevision}`}
                    </div>
                  </div>
                  <StatusTag
                    label={isModelReady ? 'Ready' : isLoading ? 'Loading' : 'Idle'}
                    tone={isModelReady ? 'ready' : isLoading ? 'warn' : 'muted'}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Runtime</div>
                    <div className="mt-1 font-medium text-slate-100">{backend === 'wasm' ? 'WASM' : 'WebGPU'}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Threads</div>
                    <div className="mt-1 font-medium text-slate-100">{threadingStatus.sab ? threadingStatus.threads : 1}</div>
                  </div>
                </div>

                <button
                  onClick={loadModel}
                  disabled={isLoading || isModelReady}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(16,185,129,0.28)] transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="material-icons-outlined text-[18px]">bolt</span>
                  {isModelReady ? 'Model Loaded' : isLoading ? 'Loading…' : 'Load Model'}
                </button>

                {progressPct !== null && (
                  <div className="mt-4 space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-lime-300 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-300">{progressText}</p>
                  </div>
                )}
                {progressPct === null && progressText && (
                  <p className="mt-4 text-xs text-slate-300">{progressText}</p>
                )}
              </div>

              <ControlSection
                eyebrow="Model"
                title="Source ve yukleme"
                description="Repo veya local klasor secimini burada kilitle."
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Model Source
                  </label>
                  <div className="relative">
                    <select
                      value={modelSourceValue}
                      onChange={(e) => handleModelSourceChange(e.target.value)}
                      disabled={isLoading || isModelReady}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                    >
                      <option value={MODEL_SOURCE_OPTIONS.HUGGINGFACE}>HuggingFace</option>
                      {!isInIframe && supportsLocalSource && (
                        <option value={MODEL_SOURCE_OPTIONS.LOCAL}>Local folder</option>
                      )}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                      expand_more
                    </span>
                  </div>
                </div>

                {modelSource === MODEL_SOURCE_OPTIONS.HUGGINGFACE && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Model
                    </label>
                    <div className="relative">
                      <select
                        value={selectedModel}
                        onChange={e => handleModelChange(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                      >
                        {MODEL_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.displayName}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                        expand_more
                      </span>
                    </div>
                  </div>
                )}

                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && (
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
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Local Model Folder
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 truncate rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
                          {localFolderName || 'No folder selected'}
                        </div>
                        <button
                          onClick={pickLocalModelFolder}
                          disabled={isLoading || isModelReady}
                          title="Browse local model folder"
                          className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-amber-300 bg-amber-100 text-amber-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                        >
                          <span className="material-icons-outlined text-lg">folder_open</span>
                        </button>
                      </div>
                    </div>

                    {localHandlePersistenceSupported && hasPersistedLocalHandle && needsLocalHandleReconnect && (
                      <button
                        onClick={reconnectPersistedFolder}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Restore Saved Folder
                      </button>
                    )}

                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {localEntries.length
                        ? `Selected ${localEntries.length} files${localFolderName ? ` from "${localFolderName}"` : ''}.`
                        : 'Pick encoder/decoder ONNX files plus tokenizer text. Optional nemo*.onnx frontend assets are auto-detected.'}
                    </p>

                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                      <div>Encoder dtypes: {localDetectedArtifacts.encoder.length ? localDetectedArtifacts.encoder.join(', ') : 'none'}</div>
                      <div>Decoder dtypes: {localDetectedArtifacts.decoder.length ? localDetectedArtifacts.decoder.join(', ') : 'none'}</div>
                      <div>Tokenizers: {localDetectedArtifacts.tokenizers.length ? localDetectedArtifacts.tokenizers.join(', ') : 'none'}</div>
                      <div>Frontend ONNX: {localDetectedArtifacts.preprocessors.length ? localDetectedArtifacts.preprocessors.join(', ') : 'none'}</div>
                    </div>
                  </div>
                )}

                {modelConfig?.description && (
                  <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
                    <div className="font-semibold">{modelConfig.displayName}</div>
                    <p className="mt-1">{modelConfig.description}</p>
                  </div>
                )}
              </ControlSection>

              <ControlSection
                eyebrow="Runtime"
                title="Backend ve precision"
                description="Inference yolunu ve bundle ayarlarini burada grupla."
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Runtime Backend
                    </label>
                    <div className="relative">
                      <select
                        value={backend}
                        onChange={e => app.setBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                      >
                        <option value="webgpu-hybrid">WebGPU</option>
                        <option value="wasm">WASM</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Encoder Backend
                    </label>
                    <div className="relative">
                      <select
                        value={encoderBackend}
                        onChange={e => setEncoderBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                      >
                        {encoderBackendOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Decoder Backend
                    </label>
                    <div className="relative">
                      <select
                        value={decoderBackend}
                        onChange={e => setDecoderBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                      >
                        {decoderBackendOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Threads
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={maxCores}
                      value={cpuThreads}
                      onChange={e => setCpuThreads(Number(e.target.value))}
                      disabled={isLoading || isModelReady}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Stride
                    </label>
                    <input
                      type="number"
                      value={frameStride}
                      onChange={e => setFrameStride(Number(e.target.value))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                    />
                  </div>
                </div>

                {supportsSplitQuantization ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Encoder Quant
                      </label>
                      <div className="relative">
                        <select
                          value={encoderQuant}
                          onChange={e => setEncoderQuant(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                        >
                          {encoderQuantOptions.map((quant) => (
                            <option key={quant} value={quant}>{quant}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                          expand_more
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Decoder Quant
                      </label>
                      <div className="relative">
                        <select
                          value={decoderQuant}
                          onChange={e => setDecoderQuant(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                        >
                          {decoderQuantOptions.map((quant) => (
                            <option key={quant} value={quant}>{quant}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                          expand_more
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                    This model ships as a single ONNX bundle. Separate encoder/decoder quantization is not exposed here.
                  </div>
                )}
              </ControlSection>

              <ControlSection
                eyebrow="Frontend"
                title="Preprocessor ve prompts"
                description="Frontend yolunu ve canary prompt kontrollerini ayri tut."
              >
                {supportsPreprocessorBackend ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Frontend
                    </label>
                    <div className="relative">
                      <select
                        value={preprocessorBackend}
                        onChange={e => setPreprocessorBackend(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                      >
                        {preprocessorBackendOptions.includes('js') && (
                          <option value="js">JS frontend</option>
                        )}
                        {preprocessorBackendOptions.includes('onnx') && (
                          <option
                            value="onnx"
                            disabled={
                              modelSource === MODEL_SOURCE_OPTIONS.LOCAL &&
                              localPreprocessorOptions.length === 0
                            }
                          >
                            ONNX frontend
                          </option>
                        )}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                        expand_more
                      </span>
                    </div>
                    {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && preprocessorBackend === 'onnx' && localPreprocessorOptions.length > 0 && (
                      <div className="relative mt-2">
                        <select
                          value={preprocessor}
                          onChange={(e) => setPreprocessor(e.target.value)}
                          disabled={isLoading || isModelReady}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                        >
                          {localPreprocessorOptions.map((name) => (
                            <option key={name} value={name}>{name}.onnx</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                          expand_more
                        </span>
                      </div>
                    )}
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {preprocessorBackend === 'js'
                        ? 'Shared pure-JS NeMo frontend. This is the expected path for hosted RNNT models and local folders without nemo*.onnx.'
                        : 'Optional ONNX frontend. Enable only when the repo or local folder includes a compatible nemo*.onnx asset.'}
                    </p>
                    {hostedModelUsesJsFrontend && (
                      <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                        This hosted model is configured for the shared JS frontend by default. Separate ONNX preprocessors are optional.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                    MedASR uses the built-in LASR CTC frontend path in this demo.
                  </div>
                )}

                {supportsCanaryPrompting && (
                  <div className="rounded-[24px] border border-sky-200/80 bg-sky-50/70 p-4 dark:border-sky-900/70 dark:bg-sky-950/20">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Canary Prompt Controls</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          Source language follows the sample or uploaded file. Decoder prompt tokens are injected here.
                        </p>
                      </div>
                      <StatusTag label="canary2" tone="info" />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          Task
                        </label>
                        <div className="relative">
                          <select
                            value={canaryTask}
                            onChange={(e) => setCanaryTask(e.target.value)}
                            disabled={isLoading || isModelReady}
                            className="w-full rounded-2xl border border-sky-200 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-sky-800 dark:bg-slate-900/80 dark:text-white"
                          >
                            <option value="asr">ASR</option>
                            <option value="translation">Speech Translation</option>
                          </select>
                          <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                            expand_more
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          Target
                        </label>
                        <div className="relative">
                          <select
                            value={effectiveCanaryTargetLanguage}
                            onChange={(e) => setCanaryTargetLanguage(e.target.value)}
                            disabled={isLoading || isModelReady || canaryTask === 'asr'}
                            className="w-full rounded-2xl border border-sky-200 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm disabled:opacity-60 dark:border-sky-800 dark:bg-slate-900/80 dark:text-white"
                          >
                            {modelConfig?.languages?.map((languageCode) => (
                              <option key={languageCode} value={languageCode}>
                                {app.getBuiltInModelLanguageName(languageCode)}
                              </option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                            expand_more
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCanaryPnc((current) => !current)}
                        disabled={isLoading || isModelReady}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          canaryPnc
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100'
                            : 'border-slate-200 bg-white/90 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.16em]">PnC</div>
                        <div className="mt-1 text-sm">{canaryPnc ? 'Enabled' : 'Disabled'}</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCanaryTimestamps((current) => !current)}
                        disabled={isLoading || isModelReady}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          canaryTimestamps
                            ? 'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100'
                            : 'border-slate-200 bg-white/90 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.16em]">Timestamps</div>
                        <div className="mt-1 text-sm">{canaryTimestamps ? 'Requested' : 'Hidden'}</div>
                      </button>
                    </div>

                    <div className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-white">Prompt route:</strong>{' '}
                      {selectedLanguageName} audio {'\u2192'} {effectiveTargetLanguageName}{' '}
                      {canaryTask === 'asr' ? 'transcription' : 'translation'}
                    </div>
                  </div>
                )}

                {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Tokenizer
                    </label>
                    <div className="relative">
                      <select
                        value={localTokenizerName}
                        onChange={(e) => setLocalTokenizerName(e.target.value)}
                        disabled={isLoading || isModelReady}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                      >
                        {localTokenizerOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                        expand_more
                      </span>
                    </div>
                  </div>
                )}
              </ControlSection>

              <ControlSection
                eyebrow="Flags"
                title="Logging ve profiling"
                description="Debug ve sonuc loglarini model yuklemeden once ayarla."
              >
                <div className="space-y-3">
                  <ToggleRow
                    id="verbose"
                    label="Verbose logging"
                    checked={verboseLog}
                    disabled={isLoading || isModelReady}
                    onChange={(event) => setVerboseLog(event.target.checked)}
                  />
                  <ToggleRow
                    id="log-results"
                    label="Log results"
                    checked={dumpDetail}
                    disabled={false}
                    onChange={(event) => setDumpDetail(event.target.checked)}
                  />
                  <ToggleRow
                    id="profiling"
                    label="Enable profiling"
                    checked={enableProfiling}
                    disabled={false}
                    onChange={(event) => setEnableProfiling(event.target.checked)}
                  />
                </div>
              </ControlSection>

              <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/75 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag label={statusLabel} tone={liveStatusTone} />
                  <StatusTag
                    label={threadingStatus.sab ? `Multi-threaded (${threadingStatus.threads} cores)` : 'Single-threaded'}
                    tone={threadingStatus.sab ? 'ready' : 'warn'}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {localHandlePersistenceSupported
                    ? 'Folder access can be persisted in this browser for local models.'
                    : 'This browser cannot persist folder access for local models.'}
                </p>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/84 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(480px,0.95fr)]">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Mission Control
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                      Akis kararlarini, VAD state&apos;ini ve decode performansini tek bakista oku.
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Sol tarafta model ve runtime ayarlari sabit kalirken, canli capture ile transcription sonucu ana
                      alanda birbirine karismadan izleniyor.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusTag label={activeModelLabel} tone="muted" />
                    <StatusTag label={micModeLabel} tone={isMicActive ? 'live' : 'muted'} />
                    <StatusTag label={`Profile ${activeProfileLabel}`} tone="info" />
                    <StatusTag label={streamingSnapshot?.state || 'detector idle'} tone="muted" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <SummaryTile
                    label="Input / Process"
                    value={`${formatSampleRate(streamingSnapshot?.capture?.inputSampleRate)} / ${formatSampleRate(streamingSnapshot?.capture?.processingSampleRate ?? streamingSnapshot?.sampleRate)}`}
                    detail={streamingSnapshot?.capture?.deviceLabel || 'Awaiting microphone device'}
                  />
                  <SummaryTile
                    label="Current Level"
                    value={formatDbfsValue(streamingSnapshot?.rough?.levelDbfs)}
                    detail={`threshold ${formatDbfsValue(streamingSnapshot?.rough?.thresholdDbfs)}`}
                    tone={streamingSnapshot?.rough?.energyPass ? 'live' : 'muted'}
                  />
                  <SummaryTile
                    label="TEN-VAD"
                    value={formatFixed(streamingSnapshot?.tenVad?.probability)}
                    detail={streamingSnapshot?.tenVad?.state || 'idle'}
                    tone={streamingSnapshot?.tenVad?.speaking ? 'live' : 'muted'}
                  />
                  <SummaryTile
                    label="SNR"
                    value={typeof streamingSnapshot?.rough?.snr === 'number' ? `${streamingSnapshot.rough.snr.toFixed(1)} dB` : '--'}
                    detail={streamingSnapshot?.rough?.useSnrGate ? 'active gate' : 'diagnostic only'}
                    tone={streamingSnapshot?.rough?.snrPass ? 'ready' : 'muted'}
                  />
                  <SummaryTile
                    label="Active Segment"
                    value={activeSegmentSeconds !== null ? formatSecondsValue(activeSegmentSeconds) : 'none'}
                    detail={`${recentSegmentEntries.length} recent`}
                    tone={activeSegmentSeconds !== null ? 'live' : 'muted'}
                  />
                  <SummaryTile
                    label="Decode Total"
                    value={formatMilliseconds(latestMetrics?.total_ms)}
                    detail={latestMetrics ? `RTF ${formatFixed(latestMetrics.rtf)}x` : 'No transcription yet'}
                    tone={latestMetrics ? 'ready' : 'muted'}
                  />
                </div>
              </div>
            </section>

            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,0.95fr)]">
              <div className="space-y-6">
                <section className="rounded-[32px] border border-white/70 bg-white/84 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Capture Deck
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Realtime streaming capture
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {micMode === 'speech-detect'
                          ? 'Speech-detect modu rough onset gating ile baslar, TEN-VAD ile dogrular ve dogal bir durakta finalize eder.'
                          : 'Manual mod mikrofondan surekli toplar; stop veya send now ile tek seferde decode eder.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusTag label={micStatus} tone={isMicActive ? 'live' : 'muted'} />
                      <StatusTag label={`Profile ${activeProfileLabel}`} tone="info" />
                      <button
                        type="button"
                        onClick={() => setHudVisible(!hudVisible)}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        {hudVisible ? 'Hide Advanced' : 'Advanced Detector'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                    <div className="space-y-4">
                      <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                          <div className="w-full md:max-w-[220px]">
                            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                              Input Language
                            </label>
                            <div className="relative">
                              <select
                                value={selectedLanguage}
                                onChange={e => handleLanguageChange(e.target.value)}
                                disabled={!isModelReady}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950/80 dark:text-white"
                              >
                                {testLanguageOptions.map((lang) => (
                                  <option key={lang.code} value={lang.code}>
                                    {lang.displayName}
                                  </option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute right-3 top-3 material-icons-outlined text-lg text-slate-400">
                                expand_more
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {audioUrl && (
                              <>
                                <audio
                                  ref={audioRef}
                                  src={audioUrl}
                                  onEnded={() => app.setIsPlaying(false)}
                                  onPause={() => app.setIsPlaying(false)}
                                  onPlay={() => app.setIsPlaying(true)}
                                />
                                <button
                                  onClick={isPlaying ? pauseAudio : playAudio}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/80 dark:text-white"
                                  title={isPlaying ? 'Pause sample' : 'Play sample'}
                                >
                                  <span className="material-icons-outlined text-[20px]">{isPlaying ? 'pause' : 'play_arrow'}</span>
                                </button>
                                {sampleDownload && (
                                  <button
                                    onClick={downloadCurrentSample}
                                    disabled={isDownloadingSample || isLoadingSample || isTranscribing}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/80 dark:text-white"
                                    title={sampleDownload.sourceUrl ? `Download original sample: ${sampleDownload.filename}` : 'Download original sample'}
                                  >
                                    <span className="material-icons-outlined text-[20px]">download</span>
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={loadRandomSample}
                              disabled={!isModelReady || !canLoadSampleForLanguage || isLoadingSample || isTranscribing || isDownloadingSample}
                              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(16,185,129,0.2)] transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span className="material-icons-outlined text-[18px]">library_music</span>
                              {isLoadingSample ? 'Loading…' : canLoadSampleForLanguage ? 'Load Sample' : 'No built-in sample'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <label className="group relative flex min-h-[210px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[28px] border-2 border-dashed border-slate-300 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(241,245,249,0.92))] px-6 py-8 text-center transition hover:-translate-y-0.5 hover:border-emerald-400 dark:border-slate-700 dark:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.2),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.7),rgba(2,6,23,0.92))]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/*"
                          onChange={transcribeFile}
                          disabled={!isModelReady || isTranscribing}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                        />
                        <span className="material-icons-outlined mb-3 text-5xl text-slate-400 transition group-hover:text-emerald-500">
                          upload_file
                        </span>
                        <div className="text-lg font-semibold text-slate-900 dark:text-white">
                          Drop a file to run one-shot transcription
                        </div>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                          Upload `.wav`, `.mp3` veya `.ogg`. Realtime akistan ayri calisir ve son decode metriklerini ayni sag panelde gosterir.
                        </p>
                      </label>

                      <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-4 text-white shadow-[0_22px_70px_rgba(15,23,42,0.18)] dark:border-slate-800">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                                Live Microphone
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-300">{micStatus}</p>
                              {micError && <p className="mt-2 text-sm text-rose-300">{micError}</p>}
                            </div>

                            <div className="w-full md:w-[190px]">
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Mic Mode
                              </label>
                              <select
                                value={micMode}
                                onChange={(event) => setMicMode(event.target.value)}
                                disabled={isMicActive}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white shadow-sm"
                              >
                                <option value="manual">Manual</option>
                                <option value="speech-detect">Speech Detect</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={
                                isMicActive
                                  ? () => handleStopMicrophoneCapture({ flush: true })
                                  : handleStartMicrophoneCapture
                              }
                              disabled={isLoadingSample || !supportsMicrophoneInput}
                              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                                isMicActive ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'
                              }`}
                            >
                              <span className="material-icons-outlined text-[18px]">{isMicActive ? 'stop' : 'mic'}</span>
                              {isMicActive ? 'Stop Mic' : 'Start Mic'}
                            </button>

                            {(isMicActive || micMode === 'speech-detect') && (
                              <button
                                type="button"
                                onClick={() => flushMicrophoneUtterance('manual')}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-600"
                              >
                                <span className="material-icons-outlined text-[18px]">send</span>
                                Send Now
                              </button>
                            )}

                            <StatusTag label={micModeLabel} tone={isMicActive ? 'live' : 'muted'} />
                            <StatusTag label={`Detector ${streamingSnapshot?.state || 'idle'}`} tone="muted" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SummaryTile
                          label="Energy Gate"
                          value={streamingSnapshot?.rough?.energyPass ? 'pass' : 'hold'}
                          detail={`candidate ${streamingSnapshot?.rough?.candidateReason || 'none'}`}
                          tone={streamingSnapshot?.rough?.energyPass ? 'live' : 'muted'}
                        />
                        <SummaryTile
                          label="TEN-VAD State"
                          value={streamingSnapshot?.tenVad?.speaking ? 'speech' : 'idle'}
                          detail={`prob ${formatFixed(streamingSnapshot?.tenVad?.probability)}`}
                          tone={streamingSnapshot?.tenVad?.speaking ? 'live' : 'muted'}
                        />
                        <SummaryTile
                          label="Noise Floor"
                          value={formatDbfsValue(streamingSnapshot?.rough?.noiseFloorDbfs)}
                          detail={`window ${formatDbfsValue(streamingSnapshot?.rough?.levelWindowDbfs)}`}
                        />
                        <SummaryTile
                          label="Last Acceptance"
                          value={streamingSnapshot?.acceptance?.reason || 'none'}
                          detail={streamingSnapshot?.acceptance ? `TEN-VAD ${streamingSnapshot.acceptance.tenVadConfirmed ? 'confirmed' : 'not confirmed'}` : 'No accepted speech yet'}
                          tone={streamingSnapshot?.acceptance ? 'ready' : 'muted'}
                        />
                      </div>

                      {detectorWarnings.length > 0 && (
                        <div className="rounded-[26px] border border-rose-200 bg-rose-50/90 p-4 dark:border-rose-900/70 dark:bg-rose-950/20">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
                            Detector Warnings
                          </div>
                          <div className="mt-3 space-y-2">
                            {detectorWarnings.map((warning) => (
                              <div
                                key={warning}
                                className="rounded-2xl border border-rose-200 bg-white px-3 py-3 text-sm text-rose-950 dark:border-rose-900/60 dark:bg-slate-950/60 dark:text-rose-100"
                              >
                                {warning}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                            Recent Decisions
                          </div>
                          <div className="mt-3 space-y-2">
                            {recentDecisionEntries.length > 0 ? recentDecisionEntries.map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white">{entry.message}</div>
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{entry.at}</div>
                                </div>
                                {Object.keys(entry.meta ?? {}).length > 0 && (
                                  <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-500 dark:text-slate-400">
                                    {JSON.stringify(entry.meta, null, 2)}
                                  </pre>
                                )}
                              </div>
                            )) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                Detector kararlari geldikce burada akacak.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                            Recent Segments
                          </div>
                          <div className="mt-3 space-y-2">
                            {recentSegmentEntries.length > 0 ? recentSegmentEntries.map((segment) => {
                              const duration = getSegmentDurationSeconds(segment, segment.sampleRate);
                              return (
                                <div
                                  key={`${segment.startFrame}-${segment.endFrame}`}
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-slate-900 dark:text-white">{segment.reason || 'segment'}</div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                      {formatSecondsValue(duration)}
                                    </div>
                                  </div>
                                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    {formatSampleRate(segment.sampleRate)} · start {segment.startFrame} · end {segment.endFrame}
                                  </div>
                                </div>
                              );
                            }) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                Henuz finalize edilmis bir segment yok.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {hudVisible && (
                    <div className="mt-5">
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
                  )}
                </section>
              </div>

              <div className="space-y-6">
                <section className="rounded-[32px] border border-white/70 bg-white/84 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Live Transcript
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Decoder output
                      </h3>
                    </div>
                    {text && (
                      <button
                        onClick={() => copyToClipboard(text)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        <span className="material-icons-outlined text-[16px]">content_copy</span>
                        Copy
                      </button>
                    )}
                  </div>

                  <div className="mt-4 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,245,249,0.9))] p-5 dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.92))]">
                    <p className="min-h-[240px] text-[1.05rem] leading-8 text-slate-800 dark:text-slate-100">
                      {text || 'Transcription will appear here after a sample, upload, or microphone segment is decoded.'}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <SummaryTile
                      label="Total"
                      value={formatMilliseconds(latestMetrics?.total_ms)}
                      detail={latestMetrics ? `encode ${formatMilliseconds(latestMetrics.encode_ms)}` : 'Awaiting result'}
                      tone={latestMetrics ? 'ready' : 'muted'}
                    />
                    <SummaryTile
                      label="Decode"
                      value={formatMilliseconds(latestMetrics?.decode_ms)}
                      detail={latestMetrics ? `rtf ${formatFixed(latestMetrics.rtf)}x` : 'Awaiting result'}
                      tone={latestMetrics ? 'info' : 'muted'}
                    />
                    <SummaryTile
                      label="Confidence"
                      value={transcriptions[0]?.confidence ? formatPercentValue(transcriptions[0].confidence) : '--'}
                      detail={transcriptions[0]?.wordCount ? `${transcriptions[0].wordCount} words` : 'No finished utterance'}
                    />
                    <SummaryTile
                      label="Queue"
                      value={isTranscribing ? 'busy' : 'clear'}
                      detail={isTranscribing ? 'Decoder is processing audio' : 'Ready for next utterance'}
                      tone={isTranscribing ? 'warn' : 'ready'}
                    />
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/70 bg-white/84 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Reference
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Comparison text
                      </h3>
                    </div>
                    {referenceText && (
                      <button
                        onClick={() => copyToClipboard(referenceText)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        <span className="material-icons-outlined text-[16px]">content_copy</span>
                        Copy
                      </button>
                    )}
                  </div>

                  <textarea
                    value={referenceText}
                    onChange={e => setReferenceText(e.target.value)}
                    className="mt-4 min-h-[220px] w-full rounded-[28px] border border-emerald-200 bg-white/90 p-5 text-base leading-7 text-slate-800 shadow-sm focus:border-emerald-400 focus:ring-emerald-400 dark:border-emerald-900/70 dark:bg-slate-950/70 dark:text-slate-100"
                    placeholder="Paste or type reference text here for comparison..."
                  />
                  {isCanaryTranslationMode && (
                    <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      Reference comparison is hidden while Canary is translating from {selectedLanguageName} to {effectiveTargetLanguageName}.
                    </p>
                  )}
                </section>
              </div>
            </div>

            {transcriptions.length > 0 && (
              <section className="rounded-[32px] border border-white/70 bg-white/84 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/78">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      History
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                      Completed utterances
                    </h3>
                  </div>
                  <button
                    onClick={clearTranscriptions}
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:-translate-y-0.5 hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300"
                  >
                    Clear All
                  </button>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {transcriptions.map((trans) => (
                    <div
                      key={trans.id}
                      className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/55"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{trans.filename}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {trans.language ? app.getBuiltInModelLanguageName(trans.language) : 'Unknown language'}
                            {trans.targetLanguage && ` -> ${app.getBuiltInModelLanguageName(trans.targetLanguage)}`}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{trans.timestamp}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                          {trans.duration.toFixed(1)}s
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                          {trans.wordCount} words
                        </span>
                        {trans.confidence && (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                            {formatPercentValue(trans.confidence)}
                          </span>
                        )}
                        {trans.metrics && (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70">
                            RTF {formatFixed(trans.metrics.rtf)}x
                          </span>
                        )}
                      </div>

                      <div className="mt-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100">
                        {trans.text}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {typeof SharedArrayBuffer === 'undefined' && backend === 'wasm' && (
              <div className="rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
                <strong>Warning:</strong> SharedArrayBuffer unavailable. WASM will run single-threaded.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
