import { loadParakeetModelFromLocalEntries } from '@asrjs/speech-recognition/presets/parakeet';
import { fetchRandomSample, hasTestSamples } from '../utils/speechDatasets';
import { loadHubDemoModel } from '../shared/modelLoader.js';
import { decodeAudioBufferToMonoPcm, encodeMonoPcmToWavBlob, getCachedAudioFile } from './audioUtils.js';
import { buildTranscriptionOptions } from './transcriptionHelpers.js';
import { createTranscriptionRecordFromResult } from './transcriptionRecord.js';
import { matchesWarmupResult } from './warmupUtils.js';

export async function loadRandomSampleFlow({
  model,
  selectedLanguage,
  selectedModel,
  getBuiltInModelLanguageName,
  audioRef,
  audioUrl,
  isCanaryTranslationMode,
  dumpDetail,
  supportsCanaryPrompting,
  canaryTask,
  effectiveCanaryTargetLanguage,
  canaryPnc,
  canaryTimestamps,
  frameStride,
  enableProfiling,
  setIsLoadingSample,
  setReferenceText,
  setText,
  setSampleDownload,
  setIsPlaying,
  setAudioUrl,
  setStatus,
  setIsTranscribing,
  setLatestMetrics,
  setTranscriptions,
}) {
  if (!model) return;

  if (!hasTestSamples(selectedLanguage)) {
    alert(`No test dataset available for ${getBuiltInModelLanguageName(selectedLanguage)}.`);
    return;
  }

  setIsLoadingSample(true);
  setReferenceText('');
  setText('');
  setSampleDownload(null);
  if (audioRef.current) {
    audioRef.current.pause();
  }
  setIsPlaying(false);
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  try {
    const sample = await fetchRandomSample(selectedLanguage, {
      targetSampleRate: 16000,
      onProgress: ({ message }) => setStatus(message),
    });

    const wavBlob = encodeMonoPcmToWavBlob(sample.pcm, { sampleRate: 16000 });
    const nextAudioUrl = URL.createObjectURL(wavBlob);
    setAudioUrl(nextAudioUrl);
    setSampleDownload({
      buffer: sample.audioBuffer,
      filename: sample.sourceFilename,
      mimeType: sample.sourceMimeType,
      sourceUrl: sample.sourceAudioUrl,
    });

    const canCompareAgainstReference = !isCanaryTranslationMode;
    setReferenceText(canCompareAgainstReference ? sample.transcription : '');
    console.log(`[Dataset] Reference: "${sample.transcription}"`);

    setStatus('Transcribing…');
    setIsTranscribing(true);

    console.time('Transcribe-Sample');
    const result = await model.transcribe(
      sample.pcm,
      16000,
      buildTranscriptionOptions(selectedModel, {
        sourceLanguage: selectedLanguage,
        targetLanguage: effectiveCanaryTargetLanguage,
        task: canaryTask,
        punctuate: canaryPnc,
        timestamps: supportsCanaryPrompting ? canaryTimestamps : true,
        frameStride,
        enableProfiling,
      }),
    );
    console.timeEnd('Transcribe-Sample');

    if (dumpDetail) {
      console.log('[Dataset] Transcription result:', result);
    }

    setText(result.utterance_text);
    setLatestMetrics(result.metrics);

    const langName = getBuiltInModelLanguageName(selectedLanguage);
    const datasetName = sample.dataset.split('/').pop();
    const newTranscription = createTranscriptionRecordFromResult({
      result,
      filename: `${datasetName}-${langName}-#${sample.sampleIndex}`,
      reference: canCompareAgainstReference ? sample.transcription : '',
      duration: sample.duration,
      task: supportsCanaryPrompting ? canaryTask : 'asr',
      targetLanguage: supportsCanaryPrompting ? effectiveCanaryTargetLanguage : null,
    });

    setTranscriptions((previous) => [newTranscription, ...previous]);
    setStatus('Model ready');
  } catch (error) {
    console.error('[Dataset] Error:', error);
    setStatus(`Error: ${error.message}`);
  } finally {
    setIsLoadingSample(false);
    setIsTranscribing(false);
  }
}

export async function loadModelFlow({
  modelSource,
  modelRef,
  localEntries,
  selectedModel,
  encoderBackend,
  decoderBackend,
  encoderQuant,
  decoderQuant,
  localTokenizerName,
  preprocessor,
  preprocessorBackend,
  backend,
  verboseLog,
  cpuThreads,
  enableProfiling,
  setIsModelLoading,
  setStatus,
  setProgressText,
  setProgressPct,
  setLoadedFromCache,
  releaseCurrentModel,
  modelRevision,
  modelConfig,
  warmupAudioUrl,
  setModelLoaded,
}) {
  const isLocalSource = modelSource === 'local';
  setIsModelLoading(true);
  setStatus(isLocalSource ? 'Preparing local model…' : 'Downloading model…');
  setProgressText(isLocalSource ? '' : 'Resolving model request…');
  setProgressPct(null);
  setLoadedFromCache(false);
  console.time('LoadModel');

  try {
    await releaseCurrentModel();

    if (isLocalSource) {
      console.log('[LocalFolder] Starting model load from local artifacts');
      if (!localEntries.length) {
        throw new Error('Pick a local model folder first.');
      }

      setStatus('Compiling model…');
      setProgressText('Compiling local model artifacts');
      setProgressPct(null);

      const localLoadResult = await loadParakeetModelFromLocalEntries(localEntries, {
        modelId: selectedModel,
        encoderBackend,
        decoderBackend,
        encoderQuant,
        decoderQuant,
        tokenizerName: localTokenizerName,
        preprocessorName: preprocessor,
        preprocessorBackend,
        backend,
        verbose: verboseLog,
        cpuThreads,
        enableProfiling,
      });

      console.log('[LocalFolder] Selected artifacts', {
        encoder: localLoadResult.selection.encoderName,
        decoder: localLoadResult.selection.decoderName,
        tokenizer: localLoadResult.selection.tokenizerName,
        preprocessorBackend,
        preprocessor: localLoadResult.selection.preprocessorName ?? null,
      });
      modelRef.current = localLoadResult.model;
      setLoadedFromCache(false);
      console.log('[LocalFolder] Model sessions created from local artifacts');
    } else {
      console.log('[Hub] Starting model load from HuggingFace');
      const progressCallback = (event) => {
        if (event.phase === 'asset:download') {
          const pct = event.percent ?? (event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0);
          setProgressText(event.file ? `${event.file}: ${pct}%` : event.message || 'Downloading model assets');
          setProgressPct(pct);
          return;
        }

        if (event.phase === 'resolve:start') {
          setProgressText(event.message || 'Resolving model request…');
          setProgressPct(null);
          return;
        }
        if (event.phase === 'resolve:complete') {
          setProgressText(event.message || 'Model request resolved.');
          setProgressPct(null);
          return;
        }
        if (event.phase === 'model-load:start' || event.phase === 'session-create:start') {
          setStatus('Compiling model…');
          setProgressPct(null);
          setProgressText(event.message || 'Compiling model…');
          return;
        }
        if (event.phase === 'model-load:complete' || event.phase === 'session-create:complete') {
          setProgressText(event.message || 'Model compile step complete.');
          setProgressPct(null);
          return;
        }
        if (event.phase === 'ready') {
          setProgressText(event.message || 'Model runtime ready.');
          setProgressPct(null);
          return;
        }
        if (event.message) {
          setProgressText(event.message);
        }
      };

      const modelLoadResult = await loadHubDemoModel({
        modelId: selectedModel,
        revision: modelRevision,
        encoderBackend,
        decoderBackend,
        encoderQuant,
        decoderQuant,
        preprocessor,
        preprocessorBackend,
        backend,
        cpuThreads,
        enableProfiling,
        onProgress: progressCallback,
      });

      modelRef.current = modelLoadResult.model;
      setLoadedFromCache(Boolean(modelLoadResult.fromCache));
      if (modelLoadResult.fromCache) {
        setStatus('Reusing cached model…');
        setProgressText('Loaded from cache. Running warm-up verification…');
        setProgressPct(null);
      }
      console.log('[Hub] Model sessions created from HuggingFace artifacts');
    }

    setStatus('Verifying…');
    setProgressText('Running test transcription');
    console.log('[LoadModel] Running warm-up verification transcription');

    try {
      const warmupUrls = [
        warmupAudioUrl,
        'https://raw.githubusercontent.com/ysdede/parakeet.js/master/examples/demo/public/assets/Harvard-L2-1.ogg',
      ];
      let audioBlob = null;
      let warmupFetchError = null;

      for (const audioUrl of warmupUrls) {
        try {
          audioBlob = await getCachedAudioFile(audioUrl, 'Harvard-L2-1.ogg');
          break;
        } catch (error) {
          warmupFetchError = error;
          console.warn(`[App] Warm-up audio fetch failed for ${audioUrl}: ${error.message}`);
        }
      }

      if (!audioBlob) {
        throw warmupFetchError || new Error('Failed to load warm-up audio.');
      }

      const buffer = await audioBlob.arrayBuffer();
      const pcm = (await decodeAudioBufferToMonoPcm(buffer, { targetSampleRate: 16000 })).pcm;

      const warmupResult = await modelRef.current.transcribe(pcm, 16000, { enableProfiling });
      const utteranceText = warmupResult?.utterance_text ?? '';
      const warmupCandidates = [
        utteranceText,
        warmupResult?.native?.rawUtteranceText,
        warmupResult?.native?.utteranceText,
      ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
      const matchedExpectedText = matchesWarmupResult(modelConfig, warmupCandidates);

      if (matchedExpectedText) {
        console.log('[App] Model verification successful.');
        setStatus('Model ready');
        setModelLoaded(true);
      } else {
        const expectedTexts = modelConfig?.warmup?.expectedTexts || [];
        const requiredKeywordGroups = modelConfig?.warmup?.requiredKeywordGroups || [];
        console.error(
          `[App] Verification failed! Expected one of: "${expectedTexts.join('" | "')}"` +
          `${requiredKeywordGroups.length ? ` or keyword groups ${JSON.stringify(requiredKeywordGroups)}` : ''}, ` +
          `Got: "${utteranceText}"`,
          warmupResult,
        );
        setStatus('Verification failed');
        setModelLoaded(false);
        setLoadedFromCache(false);
        await releaseCurrentModel({ evictHub: true });
      }
    } catch (error) {
      console.error('[App] Warm-up failed', error);
      setStatus('Warm-up failed');
      setModelLoaded(false);
      setLoadedFromCache(false);
      await releaseCurrentModel({ evictHub: true });
    }

    console.timeEnd('LoadModel');
    setProgressText('');
    setProgressPct(null);
  } catch (error) {
    console.error(error);
    setStatus(`Failed: ${error.message}`);
    setModelLoaded(false);
    setLoadedFromCache(false);
    await releaseCurrentModel({ evictHub: true });
  } finally {
    setIsModelLoading(false);
  }
}

export async function transcribeUploadedFileFlow({
  model,
  event,
  dumpDetail,
  selectedLanguage,
  selectedModel,
  supportsCanaryPrompting,
  canaryTask,
  effectiveCanaryTargetLanguage,
  canaryPnc,
  canaryTimestamps,
  frameStride,
  enableProfiling,
  setText,
  setReferenceText,
  setSampleDownload,
  setIsTranscribing,
  setStatus,
  setLatestMetrics,
  setTranscriptions,
  fileInputRef,
}) {
  if (!model) {
    alert('Load model first');
    return;
  }

  const file = event.target.files?.[0];
  if (!file) return;

  setText('');
  setReferenceText('');
  setSampleDownload(null);
  setIsTranscribing(true);
  setStatus(`Transcribing "${file.name}"…`);

  try {
    const buffer = await file.arrayBuffer();
    const decoded = await decodeAudioBufferToMonoPcm(buffer, { targetSampleRate: 16000 });
    const pcm = decoded.pcm;

    console.time(`Transcribe-${file.name}`);
    const result = await model.transcribe(
      pcm,
      16_000,
      buildTranscriptionOptions(selectedModel, {
        sourceLanguage: selectedLanguage,
        targetLanguage: effectiveCanaryTargetLanguage,
        task: canaryTask,
        punctuate: canaryPnc,
        timestamps: supportsCanaryPrompting ? canaryTimestamps : true,
        frameStride,
        enableProfiling,
      }),
    );
    console.timeEnd(`Transcribe-${file.name}`);

    if (dumpDetail) {
      console.log('[ASRJS Demo] Result:', result);
    }

    setLatestMetrics(result.metrics);
    setTranscriptions((previous) => [
      createTranscriptionRecordFromResult({
        result,
        filename: file.name,
        duration: pcm.length / 16000,
        language: selectedLanguage,
        task: supportsCanaryPrompting ? canaryTask : 'asr',
        targetLanguage: supportsCanaryPrompting ? effectiveCanaryTargetLanguage : null,
      }),
      ...previous,
    ]);
    setText(result.utterance_text);
    setStatus('Model ready');
  } catch (error) {
    console.error('Transcription failed:', error);
    setStatus('Transcription failed');
    alert(`Failed: ${error.message}`);
  } finally {
    setIsTranscribing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
}
