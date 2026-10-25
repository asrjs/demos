import React from 'react';
import { Field, ToggleRow, Widget } from '../../ui/PanelPrimitives.jsx';

export function ModelSidebar({ app, hidden = false }) {
  const {
    modelPanel,
    streamingPanel,
    modelSource,
    isModelReady,
    isLoading,
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
    modelSourceOptions = [],
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
    <aside className="sidebar-rail">
      <Widget
        variant="rail"
        title="Load"
        titleAttr={modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? 'Loading local artifacts' : `Revision ${modelRevision}`}
        actions={<span className="type-caption shrink-0">{isModelReady ? 'ready' : isLoading ? 'loading' : 'idle'}</span>}
      >
        <div className="app-stack--sm">
          <div className="demo-soft-box">
            <div className="font-semibold type-body-lg">{activeModelLabel}</div>
            <div className="mt-1 type-caption">
              {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? 'Local assets' : `Revision ${modelRevision}`}
            </div>
          </div>
          <button onClick={loadModel} disabled={isLoading || isModelReady || (modelSource === MODEL_SOURCE_OPTIONS.LOCAL && (!localEntries.length || !encoderQuantOptions.length || !decoderQuantOptions.length))} type="button" className="compact-button-dark compact-button--block">
            {isModelReady ? 'Model Loaded' : isLoading ? 'Loading…' : 'Load Model'}
          </button>
          {progressPct !== null ? (
            <div className="app-stack--2xs">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              {progressText ? <div className="type-caption">{progressText}</div> : null}
            </div>
          ) : progressText ? (
            <div className="type-caption">{progressText}</div>
          ) : null}
        </div>
      </Widget>

      <Widget variant="rail" title="Validation" titleAttr="Sample audio and file transcription checks">
        <div className="app-stack--sm">
          <div className="demo-soft-box">
            <div className="flex-col gap-3">
              <Field label="Input language">
                <div className="select-wrap">
                  <select value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} disabled={!isModelReady} className="compact-control">
                    {testLanguageOptions.map((lang) => <option key={lang.code} value={lang.code}>{lang.displayName}</option>)}
                  </select>
                  <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                </div>
              </Field>
              <div className="flex-row flex-row--wrap gap-2">
                {audioUrl ? (
                  <>
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      onEnded={() => app.setIsPlaying(false)}
                      onPause={() => app.setIsPlaying(false)}
                      onPlay={() => app.setIsPlaying(true)}
                    />
                    <button type="button" onClick={isPlaying ? pauseAudio : playAudio} className="compact-button-secondary compact-button--icon" title={isPlaying ? 'Pause sample' : 'Play sample'}>
                      <span className="material-icons-outlined icon-sm">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>
                    {sampleDownload ? (
                      <button type="button" onClick={downloadCurrentSample} disabled={isDownloadingSample || isLoadingSample || isTranscribing} className="compact-button-secondary compact-button--icon" title={sampleDownload.sourceUrl ? `Download original sample: ${sampleDownload.filename}` : 'Download original sample'}>
                        <span className="material-icons-outlined icon-sm">download</span>
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

          <label className="demo-upload-zone" title="Upload .wav, .mp3, or .ogg">
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={transcribeFile} disabled={!isModelReady || isTranscribing} className="hidden" />
            <span className="material-icons-outlined icon-lg">upload_file</span>
            <div className="upload-zone-title">Drop or click to transcribe</div>
          </label>
        </div>
      </Widget>

      <Widget variant="rail" title="Model Settings" titleAttr="Model source, artifact selection, and local folder controls">
        <div className="app-stack--sm">
          <Field label="Artifact source">
            <div className="select-wrap">
              <select
                value={modelSourceValue}
                onChange={(e) => handleModelSourceChange(e.target.value)}
                disabled={isLoading || isModelReady}
                className="compact-control"
              >
                {modelSourceOptions.map((source) => (
                  <option key={source} value={source}>{source === MODEL_SOURCE_OPTIONS.LOCAL ? 'Local folder' : 'Hugging Face'}</option>
                ))}
              </select>
              <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
            </div>
          </Field>

          <Field label="Model">
            <div className="select-wrap">
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
              <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
            </div>
          </Field>

          {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? (
            <div className="app-stack--sm">
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
                <div className="flex-row gap-2">
                  <div className="compact-control compact-control--truncate flex-1">{localFolderName || 'No folder selected'}</div>
                  <button type="button" onClick={pickLocalModelFolder} disabled={isLoading || isModelReady} className="compact-button-secondary compact-button--icon" title="Pick folder">
                    <span className="material-icons-outlined icon-sm">folder_open</span>
                  </button>
                </div>
              </Field>
              {localHandlePersistenceSupported && hasPersistedLocalHandle && needsLocalHandleReconnect ? (
                <button type="button" onClick={reconnectPersistedFolder} disabled={isLoading || isModelReady} className="compact-button-secondary compact-button--block">
                  Restore Saved Folder
                </button>
              ) : null}
              <div className="demo-soft-box app-stack--2xs type-caption">
                <div>Files: {localEntries.length || 0}</div>
                <div>Encoder: {localDetectedArtifacts.encoder.length ? localDetectedArtifacts.encoder.join(', ') : 'none'}</div>
                <div>Decoder: {localDetectedArtifacts.decoder.length ? localDetectedArtifacts.decoder.join(', ') : 'none'}</div>
                <div>Tokenizer: {localDetectedArtifacts.tokenizers.length ? localDetectedArtifacts.tokenizers.join(', ') : 'none'}</div>
                <div>Frontend: {localDetectedArtifacts.preprocessors.length ? localDetectedArtifacts.preprocessors.join(', ') : 'none'}</div>
              </div>
            </div>
          ) : null}

          {modelConfig?.description ? (
            <div className="demo-soft-box type-caption text-ink" title={modelConfig.description}>
              {modelConfig.displayName}
            </div>
          ) : null}
        </div>
      </Widget>

      <Widget variant="rail" title="Runtime Settings" titleAttr="Backends, threading, stride, and quantization">
        <div className="app-stack--sm">
          <Field label="Runtime backend">
            <div className="select-wrap">
              <select value={backend} onChange={(e) => app.setBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                <option value="webgpu-hybrid">WebGPU</option>
                <option value="wasm">WASM</option>
              </select>
              <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
            </div>
          </Field>
          <div className="grid-2">
            <Field label="Encoder">
              <div className="select-wrap">
                <select value={encoderBackend} onChange={(e) => setEncoderBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                  {encoderBackendOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
              </div>
            </Field>
            <Field label="Decoder">
              <div className="select-wrap">
                <select value={decoderBackend} onChange={(e) => setDecoderBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                  {decoderBackendOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
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
            <div className="grid-2">
              <Field label="Encoder quant">
                <div className="select-wrap">
                  <select value={encoderQuant} onChange={(e) => setEncoderQuant(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                    {encoderQuantOptions.map((quant) => <option key={quant} value={quant}>{quant}</option>)}
                  </select>
                  <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                </div>
              </Field>
              <Field label="Decoder quant">
                <div className="select-wrap">
                  <select value={decoderQuant} onChange={(e) => setDecoderQuant(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                    {decoderQuantOptions.map((quant) => <option key={quant} value={quant}>{quant}</option>)}
                  </select>
                  <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                </div>
              </Field>
            </div>
          ) : null}
        </div>
      </Widget>

      <Widget variant="rail" title="Prompt Settings" titleAttr="Frontend choice, Canary options, tokenizer, and logging flags">
        <div className="app-stack--sm">
          {supportsPreprocessorBackend ? (
            <>
              <Field label="Frontend">
                <div className="select-wrap">
                  <select value={preprocessorBackend} onChange={(e) => setPreprocessorBackend(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                    {preprocessorBackendOptions.includes('js') ? <option value="js">JS frontend</option> : null}
                    {preprocessorBackendOptions.includes('onnx') ? <option value="onnx" disabled={modelSource === MODEL_SOURCE_OPTIONS.LOCAL && localPreprocessorOptions.length === 0}>ONNX frontend</option> : null}
                  </select>
                  <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                </div>
              </Field>
              {modelSource === MODEL_SOURCE_OPTIONS.LOCAL && preprocessorBackend === 'onnx' && localPreprocessorOptions.length > 0 ? (
                <Field label="Preprocessor">
                  <div className="select-wrap">
                    <select value={preprocessor} onChange={(e) => setPreprocessor(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                      {localPreprocessorOptions.map((name) => <option key={name} value={name}>{name}.onnx</option>)}
                    </select>
                    <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                  </div>
                </Field>
              ) : null}
              {hostedModelUsesJsFrontend ? <div className="type-caption">JS default</div> : null}
            </>
          ) : null}
          {supportsCanaryPrompting ? (
            <div className="demo-soft-box app-stack--xs">
              <div className="flex-row flex-row--between gap-2">
                <div className="panel-title">Canary</div>
                <span className="type-mono-micro">canary2</span>
              </div>
              <div className="grid-2">
                <Field label="Task">
                  <div className="select-wrap">
                    <select value={canaryTask} onChange={(e) => setCanaryTask(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                      <option value="asr">ASR</option>
                      <option value="translation">Speech Translation</option>
                    </select>
                    <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                  </div>
                </Field>
                <Field label="Target">
                  <div className="select-wrap">
                    <select value={effectiveCanaryTargetLanguage} onChange={(e) => setCanaryTargetLanguage(e.target.value)} disabled={isLoading || isModelReady || canaryTask === 'asr'} className="compact-control">
                      {modelConfig?.languages?.map((languageCode) => (
                        <option key={languageCode} value={languageCode}>{app.getBuiltInModelLanguageName(languageCode)}</option>
                      ))}
                    </select>
                    <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
                  </div>
                </Field>
              </div>
              <div className="grid-2">
                <button type="button" onClick={() => setCanaryPnc((current) => !current)} disabled={isLoading || isModelReady} className={canaryPnc ? 'compact-button-dark compact-button--block' : 'compact-button-secondary compact-button--block'}>
                  PnC {canaryPnc ? 'On' : 'Off'}
                </button>
                <button type="button" onClick={() => setCanaryTimestamps((current) => !current)} disabled={isLoading || isModelReady} className={canaryTimestamps ? 'compact-button-dark compact-button--block' : 'compact-button-secondary compact-button--block'}>
                  Timestamps {canaryTimestamps ? 'On' : 'Off'}
                </button>
              </div>
              <div className="type-caption">{selectedLanguageName} {'->'} {effectiveTargetLanguageName}</div>
            </div>
          ) : null}

          {modelSource === MODEL_SOURCE_OPTIONS.LOCAL ? (
            <Field label="Tokenizer">
              <div className="select-wrap">
                <select value={localTokenizerName} onChange={(e) => setLocalTokenizerName(e.target.value)} disabled={isLoading || isModelReady} className="compact-control">
                  {localTokenizerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <span className="material-icons-outlined select-wrap__chevron icon-sm">expand_more</span>
              </div>
            </Field>
          ) : null}

          <div className="app-stack--xs">
            <ToggleRow id="verbose" label="Verbose logging" checked={verboseLog} disabled={isLoading || isModelReady} onChange={(event) => setVerboseLog(event.target.checked)} />
            <ToggleRow id="log-results" label="Log results" checked={dumpDetail} disabled={false} onChange={(event) => setDumpDetail(event.target.checked)} />
            <ToggleRow id="profiling" label="Enable profiling" checked={enableProfiling} disabled={false} onChange={(event) => setEnableProfiling(event.target.checked)} />
          </div>
        </div>
      </Widget>
    </aside>
  );
}
