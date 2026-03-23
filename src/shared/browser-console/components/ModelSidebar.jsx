import React from 'react';
import { Field, ToggleRow, Widget } from '../../ui/PanelPrimitives.jsx';

export function ModelSidebar({ app, hidden = false }) {
  const {
    modelPanel,
    streamingPanel,
    status,
    asrjsVersion,
    asrjsSource,
    modelSource,
    loadedFromCache,
    isModelReady,
    isLoading,
    liveStatusTone,
    activeModelLabel,
    modelRevision,
    backend,
    progressPct,
    progressText,
    loadModel,
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

  if (hidden) {
    return null;
  }

  return (
    <aside className="space-y-6">
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
  );
}
