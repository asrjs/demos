import { RollingAudioRingBuffer } from './ringBuffer.js';
import { RoughSpeechGate } from './roughSpeechGate.js';
import { TenVadAdapter } from './tenVadAdapter.js';
import { mergeStreamingConfig, resolveStreamingProfileId } from './presets.js';

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
}

export class StreamingSpeechDetector {
  constructor(options = {}) {
    this.createTenVad = options.tenVadFactory ?? ((config, adapterOptions) => new TenVadAdapter(config, adapterOptions));
    this.profileId =
      options.profileId ?? resolveStreamingProfileId(options.isRealtimeEouModel === true);
    this.config = mergeStreamingConfig(this.profileId, options.config);
    this.listeners = new Set();
    this.sampleRate = this.config.sampleRate;
    this.ringBuffer = new RollingAudioRingBuffer(
      this.sampleRate,
      this.config.ringBufferDurationMs / 1000,
    );
    this.roughGate = new RoughSpeechGate(this.buildRoughGateConfig());
    this.tenVad = this.config.tenVadEnabled
      ? this.createTenVad(this.buildTenVadConfig(), options.tenVadOptions)
      : null;
    this.state = 'idle';
    this.activeSegment = null;
    this.pendingSegmentStartFrame = null;
    this.recentSegments = [];
    this.recentDecisions = [];
    this.lastMetrics = null;
    this.lastAcceptanceInfo = null;
    this.lastError = null;
    this.disposed = false;

    this.tenVadUnsubscribe = this.tenVad?.subscribe((event) => {
      if (event.type === 'result') {
        this.emit({
          type: 'metrics',
          payload: this.getSnapshot(),
        });
      }
    });
  }

  buildRoughGateConfig() {
    return {
      sampleRate: this.sampleRate,
      analysisWindowMs: this.config.analysisWindowMs,
      energySmoothingWindows: this.config.energySmoothingWindows,
      minSpeechLevelDbfs: this.config.minSpeechLevelDbfs,
      useSnrGate: this.config.useSnrGate,
      snrThreshold: this.config.snrThreshold,
      minSnrThreshold: this.config.minSnrThreshold,
      energyRiseThreshold: this.config.energyRiseThreshold,
      maxOnsetLookbackChunks: this.config.maxOnsetLookbackChunks,
      defaultOnsetLookbackChunks: this.config.defaultOnsetLookbackChunks,
      maxHistoryChunks: this.config.maxHistoryChunks,
      minSpeechDurationMs: this.config.minSpeechDurationMs,
      minSilenceDurationMs: this.config.minSilenceDurationMs,
      initialNoiseFloor: this.config.initialNoiseFloor,
      fastAdaptationRate: this.config.fastAdaptationRate,
      slowAdaptationRate: this.config.slowAdaptationRate,
      minBackgroundDurationSec: this.config.minBackgroundDurationSec,
      levelWindowMs: this.config.levelWindowMs,
    };
  }

  buildTenVadConfig() {
    return {
      threshold: this.config.tenVadThreshold,
      confirmationWindowMs: this.config.tenVadConfirmationWindowMs,
      hangoverMs: this.config.tenVadHangoverMs,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  recordDecision(message, meta = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toLocaleTimeString(),
      message,
      meta,
    };
    this.recentDecisions = [...this.recentDecisions.slice(-19), entry];
    console.debug(`[StreamingSpeechDetector] ${message}`, meta);
  }

  async start({ sampleRate } = {}) {
    if (this.disposed) {
      throw new Error('StreamingSpeechDetector has been disposed.');
    }

    if (sampleRate && sampleRate !== this.sampleRate) {
      this.sampleRate = sampleRate;
      this.ringBuffer = new RollingAudioRingBuffer(
        this.sampleRate,
        this.config.ringBufferDurationMs / 1000,
      );
      this.roughGate = new RoughSpeechGate(this.buildRoughGateConfig());
    }

    this.state = 'listening';
    this.activeSegment = null;
    this.pendingSegmentStartFrame = null;
    this.lastError = null;
    this.ringBuffer.reset();
    this.roughGate.reset();

    if (this.tenVad) {
      try {
        await this.tenVad.init();
        await this.tenVad.reset();
        this.recordDecision('TEN-VAD ready', this.tenVad.getStatus());
      } catch (error) {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        this.recordDecision('TEN-VAD degraded, falling back to rough gate', {
          error: this.lastError.message,
        });
        this.emit({
          type: 'error',
          payload: this.lastError,
        });
      }
    }

    this.emit({
      type: 'metrics',
      payload: this.getSnapshot(),
    });
  }

  processChunk(chunk, meta = {}) {
    if (!chunk?.length) return;

    const chunkStartFrame =
      meta.startFrame ??
      this.ringBuffer.getCurrentFrame();

    this.ringBuffer.write(chunk);
    this.tenVad?.process(chunk, chunkStartFrame);

    const rough = this.roughGate.process(chunk);
    this.lastMetrics = rough;

    const nowFrame = this.ringBuffer.getCurrentFrame();
    const isNearSpeechThreshold =
      rough.levelDbfs >= this.config.minSpeechLevelDbfs - 6 ||
      rough.snr >= this.config.minSnrThreshold - 1;

    if (rough.speechStart) {
      const fallbackStart = Math.max(
        this.ringBuffer.getBaseFrameOffset(),
        rough.onsetFrame ?? nowFrame - chunk.length,
      );
      const roughStart = Math.max(
        this.ringBuffer.getBaseFrameOffset(),
        fallbackStart - Math.ceil((this.config.prerollMs / 1000) * this.sampleRate),
      );
      const tenVadSummary = this.tenVad?.getWindowSummary(
        nowFrame,
        this.config.tenVadConfirmationWindowMs,
        this.sampleRate,
      );
      const tenVadStart = this.tenVad?.findFirstSpeechFrame(
        roughStart,
        nowFrame,
      );
      const startFrame = Math.max(
        this.ringBuffer.getBaseFrameOffset(),
        tenVadStart ?? roughStart,
      );
      if (
        this.tenVad &&
        this.tenVad.getStatus().state === 'ready' &&
        tenVadStart === null &&
        !this.tenVad.hasRecentSpeech(
          nowFrame,
          this.config.tenVadConfirmationWindowMs,
          this.sampleRate,
        )
      ) {
        this.pendingSegmentStartFrame = startFrame;
        this.state = 'candidate';
        this.recordDecision('Rough onset waiting for TEN-VAD confirmation', {
          startFrame,
          reason: rough.candidateReason,
          energy: Number(rough.energy.toFixed(4)),
          levelDbfs: Number(rough.levelDbfs.toFixed(1)),
          snr: Number(rough.snr.toFixed(2)),
          tenVadState: this.tenVad.getStatus(),
          tenVadSummary,
        });
      } else {
        this.activateSegment(startFrame, nowFrame, rough, tenVadStart, tenVadSummary);
      }
    }

    if (
      !this.activeSegment &&
      this.pendingSegmentStartFrame !== null &&
      rough.isSpeech &&
      (
        !this.tenVad ||
        this.tenVad.getStatus().state !== 'ready' ||
        this.tenVad.hasRecentSpeech(
          nowFrame,
          this.config.tenVadConfirmationWindowMs,
          this.sampleRate,
        )
      )
    ) {
      this.activateSegment(
        this.pendingSegmentStartFrame,
        nowFrame,
        rough,
        this.pendingSegmentStartFrame,
        this.tenVad?.getWindowSummary(
          nowFrame,
          this.config.tenVadConfirmationWindowMs,
          this.sampleRate,
        ),
      );
    }

    if (
      this.pendingSegmentStartFrame !== null &&
      !rough.isSpeech &&
      !rough.speechStart &&
      (
        !this.tenVad ||
        this.tenVad.getStatus().state !== 'ready' ||
        !this.tenVad.hasRecentSpeech(
          nowFrame,
          this.config.tenVadConfirmationWindowMs,
          this.sampleRate,
        )
      )
    ) {
      this.recordDecision('Candidate rejected by TEN-VAD / duration guard', {
        startFrame: this.pendingSegmentStartFrame,
        reason: rough.candidateReason,
        energy: Number(rough.energy.toFixed(4)),
        levelDbfs: Number(rough.levelDbfs.toFixed(1)),
        snr: Number(rough.snr.toFixed(2)),
        tenVadSummary: this.tenVad?.getWindowSummary(
          nowFrame,
          this.config.tenVadConfirmationWindowMs,
          this.sampleRate,
        ),
      });
      this.pendingSegmentStartFrame = null;
    }

    if (this.activeSegment) {
      this.activeSegment.lastFrame = nowFrame;

      const segmentFrames = nowFrame - this.activeSegment.startFrame;
      const segmentDurationMs = (segmentFrames / this.sampleRate) * 1000;
      if (segmentDurationMs >= this.config.maxSegmentDurationMs) {
        this.finalizeSegment('max-duration', nowFrame);
      } else if (rough.isSpeech) {
        this.state = 'speaking';
        this.emit({
          type: 'speech-update',
          payload: {
            startFrame: this.activeSegment.startFrame,
            endFrame: nowFrame,
            sampleRate: this.sampleRate,
          },
        });
      } else if (rough.speechEnd) {
        const tenVadAllowsEnd =
          !this.tenVad ||
          this.tenVad.getStatus().state !== 'ready' ||
          this.tenVad.hasRecentSilence(
            nowFrame,
            this.config.tenVadConfirmationWindowMs,
            this.sampleRate,
          );

        if (tenVadAllowsEnd) {
          this.recordDecision('Speech finalized after silence', {
            endFrame: nowFrame,
            energy: Number(rough.energy.toFixed(4)),
            levelDbfs: Number(rough.levelDbfs.toFixed(1)),
            snr: Number(rough.snr.toFixed(2)),
          });
          this.finalizeSegment('silence', nowFrame);
        } else {
          this.state = 'candidate';
          this.recordDecision('Silence rejected by TEN-VAD hangover', {
            endFrame: nowFrame,
            probability: this.tenVad?.getStatus().probability ?? 0,
          });
        }
      } else if (
        this.tenVad &&
        this.tenVad.getStatus().state === 'ready' &&
        this.tenVad.hasRecentSpeech(
          nowFrame,
          this.config.tenVadHangoverMs,
          this.sampleRate,
        )
      ) {
        this.state = 'candidate';
        this.recordDecision('Speech tail held by TEN-VAD hangover', {
          endFrame: nowFrame,
          probability: this.tenVad?.getStatus().probability ?? 0,
        });
      }
    } else if (isNearSpeechThreshold && !rough.speechStart && !rough.isSpeech) {
      this.recordDecision('Candidate rejected before speech start', {
        reason: rough.candidateReason,
        energy: Number(rough.energy.toFixed(4)),
        levelDbfs: Number(rough.levelDbfs.toFixed(1)),
        snr: Number(rough.snr.toFixed(2)),
        energyThresholdDbfs: this.config.minSpeechLevelDbfs,
        useSnrGate: this.config.useSnrGate,
        snrThreshold: this.config.snrThreshold,
        minSpeechDurationMs: this.config.minSpeechDurationMs,
      });
    }

    this.emit({
      type: 'metrics',
      payload: this.getSnapshot(),
    });
  }

  activateSegment(startFrame, nowFrame, rough, tenVadStart, tenVadSummary = null) {
    this.pendingSegmentStartFrame = null;
    this.activeSegment = {
      startFrame,
      lastFrame: nowFrame,
      reason: 'speech-start',
    };
    this.state = 'speaking';
    this.lastAcceptanceInfo = {
      reason:
        rough.candidateReason === 'energy-threshold'
          ? (tenVadStart !== null && tenVadStart !== undefined
              ? 'Accepted because energy crossed threshold and TEN-VAD confirmed speech'
              : 'Accepted because energy crossed threshold')
          : 'Accepted by rough speech gate',
      energy: rough.energy,
      threshold: rough.threshold,
      thresholdDbfs: rough.thresholdDbfs,
      levelDbfs: rough.levelDbfs,
      levelWindowDbfs: rough.levelWindowDbfs,
      energyPass: rough.energyPass,
      snr: rough.snr,
      snrPass: rough.snrPass,
      useSnrGate: this.config.useSnrGate,
      tenVadConfirmed: tenVadStart !== null && tenVadStart !== undefined,
      tenVadState: this.tenVad?.getStatus()?.state ?? 'disabled',
    };
    this.recordDecision('Speech accepted', {
      startFrame,
      reason: rough.candidateReason,
      energy: Number(rough.energy.toFixed(4)),
      levelDbfs: Number(rough.levelDbfs.toFixed(1)),
      snr: Number(rough.snr.toFixed(2)),
      tenVadStart,
      tenVadSummary,
    });
    this.emit({
      type: 'speech-start',
      payload: {
        startFrame,
        sampleRate: this.sampleRate,
      },
    });
  }

  finalizeSegment(reason, endFrame = this.ringBuffer.getCurrentFrame()) {
    if (!this.activeSegment) {
      return null;
    }

    const segment = {
      startFrame: this.activeSegment.startFrame,
      endFrame,
      sampleRate: this.sampleRate,
      reason,
      metadata: {
        profileId: this.profileId,
        rough: this.lastMetrics,
        tenVad: this.tenVad?.getStatus() ?? {
          state: 'disabled',
          error: null,
          probability: 0,
          speaking: false,
          threshold: this.config.tenVadThreshold,
        },
      },
      readPcm: () => this.ringBuffer.read(this.activeSegment.startFrame, endFrame),
    };

    this.recentSegments = [...this.recentSegments.slice(-11), segment];
    this.recordDecision(`Segment ready: ${reason}`, {
      startFrame: segment.startFrame,
      endFrame: segment.endFrame,
      durationSec: Number(
        ((segment.endFrame - segment.startFrame) / segment.sampleRate).toFixed(2),
      ),
    });
    this.emit({
      type: 'speech-end',
      payload: {
        startFrame: segment.startFrame,
        endFrame: segment.endFrame,
        sampleRate: segment.sampleRate,
      },
    });
    this.emit({
      type: 'segment-ready',
      payload: segment,
    });

    this.activeSegment = null;
    this.pendingSegmentStartFrame = null;
    this.state = 'listening';
    return segment;
  }

  flush(reason = 'manual') {
    return this.finalizeSegment(reason);
  }

  async stop({ flush = true } = {}) {
    let segment = null;
    if (flush) {
      segment = this.finalizeSegment('stop');
    } else {
      this.activeSegment = null;
      this.pendingSegmentStartFrame = null;
    }
    this.state = 'idle';
    this.emit({
      type: 'metrics',
      payload: this.getSnapshot(),
    });
    return segment;
  }

  updateConfig(partial = {}) {
    this.config = {
      ...this.config,
      ...partial,
    };
    this.roughGate.updateConfig(this.buildRoughGateConfig());
    this.tenVad?.updateConfig(this.buildTenVadConfig());
    this.profileId = partial.profileId ?? this.profileId;
    this.emit({
      type: 'metrics',
      payload: this.getSnapshot(),
    });
  }

  getSnapshot() {
    const waveform = this.ringBuffer.getMinMaxPairs(
      this.config.waveformPointCount,
      Math.ceil((this.config.ringBufferDurationMs / 1000) * this.sampleRate),
    );

    return {
      state: this.state,
      sampleRate: this.sampleRate,
      profileId: this.profileId,
      config: { ...this.config },
      waveform,
      activeSegment: this.activeSegment
        ? {
            startFrame: this.activeSegment.startFrame,
            endFrame: this.ringBuffer.getCurrentFrame(),
          }
        : null,
      pendingSegmentStartFrame: this.pendingSegmentStartFrame,
      recentSegments: cloneSegments(this.recentSegments),
      recentDecisions: cloneSegments(this.recentDecisions),
      acceptance: this.lastAcceptanceInfo,
      rough: this.lastMetrics
        ? {
            energy: this.lastMetrics.energy,
            snr: this.lastMetrics.snr,
            noiseFloor: this.lastMetrics.noiseFloor,
            noiseFloorDbfs: this.lastMetrics.noiseFloorDbfs,
            threshold: this.lastMetrics.threshold,
            thresholdDbfs: this.lastMetrics.thresholdDbfs,
            levelDbfs: this.lastMetrics.levelDbfs,
            levelWindowRms: this.lastMetrics.levelWindowRms,
            levelWindowDbfs: this.lastMetrics.levelWindowDbfs,
            levelWindowMs: this.lastMetrics.levelWindowMs,
            energyPass: this.lastMetrics.energyPass,
            candidateReason: this.lastMetrics.candidateReason,
            snrThreshold: this.lastMetrics.snrThreshold,
            minSnrThreshold: this.lastMetrics.minSnrThreshold,
            useSnrGate: this.config.useSnrGate,
            snrPass: this.lastMetrics.snrPass,
            isSpeech: this.lastMetrics.isSpeech,
          }
        : {
            energy: 0,
            snr: 0,
            noiseFloor: this.config.initialNoiseFloor,
            noiseFloorDbfs: 20 * Math.log10(Math.max(this.config.initialNoiseFloor, 0.000001)),
            threshold: 10 ** (this.config.minSpeechLevelDbfs / 20),
            thresholdDbfs: this.config.minSpeechLevelDbfs,
            levelDbfs: -100,
            levelWindowRms: 0,
            levelWindowDbfs: -100,
            levelWindowMs: this.config.levelWindowMs,
            energyPass: false,
            candidateReason: 'none',
            snrThreshold: this.config.snrThreshold,
            minSnrThreshold: this.config.minSnrThreshold,
            useSnrGate: this.config.useSnrGate,
            snrPass: false,
            isSpeech: false,
          },
      tenVad: this.tenVad?.getStatus() ?? {
        state: this.config.tenVadEnabled ? 'idle' : 'disabled',
        error: this.lastError?.message ?? null,
        probability: 0,
        speaking: false,
        threshold: this.config.tenVadThreshold,
      },
      warnings: this.buildWarnings(),
      error: this.lastError?.message ?? null,
    };
  }

  buildWarnings() {
    const warnings = [];
    const tenVadStatus = this.tenVad?.getStatus();

    if (tenVadStatus?.state === 'degraded') {
      warnings.push('TEN-VAD is degraded. Speech detection is running on rough energy gating only.');
    }

    if (this.state === 'candidate' && tenVadStatus?.state === 'ready' && !tenVadStatus.speaking) {
      warnings.push('TEN-VAD has not confirmed speech yet. Candidate onset is still being held.');
    }

    if (this.lastAcceptanceInfo && !this.lastAcceptanceInfo.tenVadConfirmed && tenVadStatus?.state !== 'degraded') {
      warnings.push('Latest accepted speech came from the rough gate without TEN-VAD confirmation.');
    }

    if (this.lastMetrics && !this.config.useSnrGate) {
      warnings.push('SNR is shown for diagnostics only. Speech triggering currently uses the dBFS speech-level threshold.');
    }

    return warnings;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tenVadUnsubscribe?.();
    await this.tenVad?.dispose();
    this.listeners.clear();
  }
}
