import React from 'react';
import {
  BROWSER_BINARY_TOGGLE_OPTIONS,
  BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS,
  BROWSER_MONITOR_SURFACE_OPTIONS,
  BROWSER_REVERSED_BINARY_TOGGLE_OPTIONS,
  BROWSER_WAVEFORM_SCALE_OPTIONS,
  shouldDisableBrowserWaveformVisualControls,
  shouldRenderBrowserCompactStats,
  shouldRenderBrowserWaveform,
  shouldRenderBrowserWaveformFooterMetrics,
} from '@asrjs/speech-recognition/browser';
import {
  getStreamingSegmentDurationSeconds,
  STREAMING_VAD_BACKENDS,
} from '@asrjs/speech-recognition/realtime';
import { StreamingDebugHud } from './StreamingDebugHud.jsx';
import { WaveformCanvas } from './WaveformCanvas.jsx';
import { WaveformCompactStats } from './WaveformCompactStats.tsx';
import { SignalMeter } from './SignalMeter.jsx';
import { StreamingControlSlider } from './StreamingControlSlider.jsx';
import { Field, Widget } from '../../ui/PanelPrimitives.jsx';
import {
  formatSampleRate,
  formatSecondsValue,
} from '../layout/formatters.js';

const ACCEPTANCE_PRESETS = [
  {
    id: 'open',
    label: 'Open',
    thresholds: {
      minSpeechDurationMs: 200,
      minEnergyPerSecond: 4,
      minEnergyIntegral: 16,
      adaptiveEnergyPerSecondFactor: 8,
      adaptiveEnergyIntegralFactor: 20,
      minAdaptiveEnergyPerSecond: 0.5,
      minAdaptiveEnergyIntegral: 2,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    thresholds: {
      minSpeechDurationMs: 240,
      minEnergyPerSecond: 5,
      minEnergyIntegral: 22,
      adaptiveEnergyPerSecondFactor: 10,
      adaptiveEnergyIntegralFactor: 25,
      minAdaptiveEnergyPerSecond: 1,
      minAdaptiveEnergyIntegral: 3,
    },
  },
  {
    id: 'strict',
    label: 'Strict',
    thresholds: {
      minSpeechDurationMs: 280,
      minEnergyPerSecond: 6,
      minEnergyIntegral: 28,
      adaptiveEnergyPerSecondFactor: 12,
      adaptiveEnergyIntegralFactor: 30,
      minAdaptiveEnergyPerSecond: 1.5,
      minAdaptiveEnergyIntegral: 4,
    },
  },
];

const VAD_BACKEND_OPTIONS = [
  { value: STREAMING_VAD_BACKENDS.FIRERED_VAD, label: 'FireRed VAD' },
  { value: STREAMING_VAD_BACKENDS.TEN_VAD, label: 'TEN-VAD' },
];

const GATE_MODE_OPTIONS = [
  { value: 'rough-only', label: 'Rough only' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'vad-only', label: 'VAD only' },
];

function formatVadTimingHint(config) {
  const hopMs = Number(config?.vadHopDurationMs);
  const bucketMs = Number(config?.vadVisualBucketDurationMs);
  const hopLabel = Number.isFinite(hopMs) ? `${hopMs} ms hop` : 'auto hop';
  const bucketLabel = Number.isFinite(bucketMs) ? `${bucketMs} ms visual` : 'auto visual';
  return `${hopLabel} / ${bucketLabel}`;
}

function resolveAcceptancePreset(config) {
  const match = ACCEPTANCE_PRESETS.find((preset) => (
    preset.thresholds.minSpeechDurationMs === Number(config?.minSpeechDurationMs)
    && preset.thresholds.minEnergyPerSecond === Number(config?.minEnergyPerSecond)
    && preset.thresholds.minEnergyIntegral === Number(config?.minEnergyIntegral)
    && preset.thresholds.adaptiveEnergyPerSecondFactor === Number(config?.adaptiveEnergyPerSecondFactor)
    && preset.thresholds.adaptiveEnergyIntegralFactor === Number(config?.adaptiveEnergyIntegralFactor)
    && preset.thresholds.minAdaptiveEnergyPerSecond === Number(config?.minAdaptiveEnergyPerSecond)
    && preset.thresholds.minAdaptiveEnergyIntegral === Number(config?.minAdaptiveEnergyIntegral)
  ));
  return match?.id ?? 'custom';
}

export function StreamingCapturePanel({
  waveformDisplay,
  streaming,
  microphone,
  debugHud,
}) {
  const currentVadBackend =
    streaming.snapshot?.config?.vadBackend ?? STREAMING_VAD_BACKENDS.FIRERED_VAD;
  const currentGateMode =
    streaming.snapshot?.config?.gateMode ?? 'rough-only';
  const acceptancePresetId = resolveAcceptancePreset(streaming.snapshot?.config);
  const acceptanceGroup = streaming.tuningGroups.find((group) => group.id === 'acceptance') ?? null;
  const acceptanceAdvancedGroup = streaming.tuningGroups.find((group) => group.id === 'acceptance-advanced') ?? null;
  const remainingTuningGroups = streaming.tuningGroups.filter(
    (group) => group.id !== 'acceptance' && group.id !== 'acceptance-advanced',
  );
  const [showAdvancedAcceptance, setShowAdvancedAcceptance] = React.useState(false);

  return (
    <div className="panel-shell panel-shell--overflow workspace-main">
      <header className="workspace-main__head">
        <h1 className="page-title">Capture</h1>
      </header>

      <div className="workspace-main__body">
        <section className="app-rail-section app-rail-section--flush-top">
          <div className="widget-header widget-header--rail">
          </div>

          <div className="waveform-workbench">
            <div className="waveform-workbench__main">
              {shouldRenderBrowserCompactStats(waveformDisplay.displayMode) ? (
                <WaveformCompactStats
                  monitor={streaming.monitor}
                  capture={streaming.captureInfo}
                  liveNoiseDbfs={streaming.liveNoiseFloorDbfs}
                  liveSpeechDbfs={streaming.liveSpeechThresholdDbfs}
                />
              ) : null}
              {shouldRenderBrowserWaveform(waveformDisplay.displayMode) ? (
                <WaveformCanvas
                  monitor={streaming.monitor}
                  capture={streaming.captureInfo}
                  scaleMode={waveformDisplay.scaleMode}
                  showSpeechThreshold={waveformDisplay.showSpeechThreshold}
                  showTenVadThreshold={waveformDisplay.showTenVadThreshold}
                  showPreVadOverlay={waveformDisplay.showPreVadOverlay}
                  liveReleaseMs={streaming.estimatedTailBudgetMs}
                  liveNoiseDbfs={streaming.liveNoiseFloorDbfs}
                  liveSpeechDbfs={streaming.liveSpeechThresholdDbfs}
                  liveOnsetDbfs={streaming.liveOnsetThresholdDbfs}
                  showFooterMetrics={shouldRenderBrowserWaveformFooterMetrics(waveformDisplay.displayMode)}
                />
              ) : null}
            </div>

            {acceptanceGroup ? (
              <aside className="waveform-workbench__side">
                <div className="detector-card waveform-display-card">
                  <div className="detector-card__label">Waveform display</div>
                  <div className="waveform-toolbar waveform-toolbar--stacked mt-3">
                    <label className="waveform-toolbar__group waveform-toolbar__group--compact">
                      <span className="type-label-caps">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.surface.label}</span>
                      <span className="type-micro">
                        {BROWSER_MONITOR_SURFACE_OPTIONS.find((option) => option.value === waveformDisplay.displayMode)?.note
                          ?? BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.surface.note}
                      </span>
                      <select
                        value={waveformDisplay.displayMode}
                        onChange={(event) => waveformDisplay.setDisplayMode(event.target.value)}
                        className="compact-control compact-control--dense mt-1"
                      >
                        {BROWSER_MONITOR_SURFACE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="waveform-toolbar__group waveform-toolbar__group--compact">
                      <span className="type-label-caps">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.scale.label}</span>
                      <span className="line-clamp-1 type-micro">
                        {BROWSER_WAVEFORM_SCALE_OPTIONS.find((option) => option.value === waveformDisplay.scaleMode)?.note
                          ?? BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.scale.note}
                      </span>
                      <select
                        value={waveformDisplay.scaleMode}
                        onChange={(event) => waveformDisplay.setScaleMode(event.target.value)}
                        disabled={shouldDisableBrowserWaveformVisualControls(waveformDisplay.displayMode)}
                        className="compact-control compact-control--dense mt-1"
                      >
                        {BROWSER_WAVEFORM_SCALE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="waveform-toolbar__group waveform-toolbar__group--compact">
                      <span className="type-label-caps">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.speechThreshold.label}</span>
                      <span className="type-micro">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.speechThreshold.note}</span>
                      <select
                        value={waveformDisplay.showSpeechThreshold ? 'on' : 'off'}
                        onChange={(event) => waveformDisplay.setShowSpeechThreshold(event.target.value === 'on')}
                        disabled={shouldDisableBrowserWaveformVisualControls(waveformDisplay.displayMode)}
                        className="compact-control compact-control--dense mt-1"
                      >
                        {BROWSER_BINARY_TOGGLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="waveform-toolbar__group waveform-toolbar__group--compact">
                      <span className="type-label-caps">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.tenVadThreshold.label}</span>
                      <span className="type-mono-micro">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.tenVadThreshold.note}</span>
                      <select
                        value={waveformDisplay.showTenVadThreshold ? 'on' : 'off'}
                        onChange={(event) => waveformDisplay.setShowTenVadThreshold(event.target.value === 'on')}
                        disabled={shouldDisableBrowserWaveformVisualControls(waveformDisplay.displayMode)}
                        className="compact-control compact-control--dense mt-1"
                      >
                        {BROWSER_BINARY_TOGGLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="waveform-toolbar__group waveform-toolbar__group--compact">
                      <span className="type-label-caps">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.preVadOverlay.label}</span>
                      <span className="type-micro">{BROWSER_MONITOR_DISPLAY_CONTROL_DEFINITIONS.preVadOverlay.note}</span>
                      <select
                        value={waveformDisplay.showPreVadOverlay ? 'on' : 'off'}
                        onChange={(event) => waveformDisplay.setShowPreVadOverlay(event.target.value === 'on')}
                        disabled={shouldDisableBrowserWaveformVisualControls(waveformDisplay.displayMode)}
                        className="compact-control compact-control--dense mt-1"
                      >
                        {BROWSER_REVERSED_BINARY_TOGGLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="tuning-group tuning-group--compact">
                  <div className="tuning-group__head tuning-group__head--compact">
                    <div>
                      <div className="panel-title">{acceptanceGroup.title}</div>
                      <div className="type-caption">{acceptanceGroup.description}</div>
                    </div>
                  </div>

                  <div className="grid-2-loose grid-2-loose--tight">
                    <div className="detector-card">
                      <Field label="Final segment gate" hint={streaming.snapshot?.gate?.effectiveMode ?? '--'}>
                        <select
                          value={streaming.snapshot?.config?.foregroundFilterEnabled ? 'on' : 'off'}
                          onChange={(event) => streaming.updateConfig({ foregroundFilterEnabled: event.target.value === 'on' })}
                          className="compact-control compact-control--dense"
                        >
                          <option value="on">enabled</option>
                          <option value="off">disabled</option>
                        </select>
                      </Field>
                    </div>
                    <div className="detector-card">
                      <Field label="Acceptance preset" hint="Updates the final segment acceptance thresholds together.">
                        <select
                          value={acceptancePresetId}
                          onChange={(event) => {
                            const preset = ACCEPTANCE_PRESETS.find((item) => item.id === event.target.value);
                            if (!preset) {
                              return;
                            }
                            streaming.updateConfig({ ...preset.thresholds });
                          }}
                          className="compact-control compact-control--dense"
                        >
                          {ACCEPTANCE_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                          ))}
                          <option value="custom">Custom</option>
                        </select>
                      </Field>
                    </div>
                  </div>

                  <div className="tuning-sliders tuning-sliders--workbench">
                    {acceptanceGroup.controls.map((definition) => (
                      <StreamingControlSlider
                        key={definition.field}
                        definition={definition}
                        value={streaming.snapshot?.config?.[definition.field]}
                        resolvedConfig={streaming.snapshot?.config ?? { chunkDurationMs: streaming.chunkDurationMs }}
                        onChange={(value) => streaming.updateConfig({ [definition.field]: value })}
                        compact
                      />
                    ))}
                  </div>
                  {acceptanceAdvancedGroup ? (
                    <div className="app-stack--sm mt-3">
                      <div className="flex-row flex-row--between gap-2">
                        <div className="type-caption">
                          Adaptive noise-scaled acceptance controls.
                        </div>
                        <button
                          type="button"
                          className="compact-button-secondary compact-button--sm"
                          onClick={() => setShowAdvancedAcceptance((value) => !value)}
                        >
                          {showAdvancedAcceptance ? 'Hide advanced' : 'Show advanced'}
                        </button>
                      </div>
                      {showAdvancedAcceptance ? (
                        <div className="tuning-sliders tuning-sliders--workbench">
                          {acceptanceAdvancedGroup.controls.map((definition) => (
                            <StreamingControlSlider
                              key={definition.field}
                              definition={definition}
                              value={streaming.snapshot?.config?.[definition.field]}
                              resolvedConfig={streaming.snapshot?.config ?? { chunkDurationMs: streaming.chunkDurationMs }}
                              onChange={(value) => streaming.updateConfig({ [definition.field]: value })}
                              compact
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>
        </section>

        <div className="capture-columns capture-columns--ruled">
          <Widget variant="rail" title="Detector tuning" className="app-rail-section--borderless">
            <div className="app-stack--tight">
              <div className="grid-4-lg">
                <div className="detector-card">
                  <Field label="Preset">
                    <select
                      value={streaming.profileId}
                      onChange={(event) => streaming.applyPreset(event.target.value)}
                      className="compact-control compact-control--dense"
                    >
                      {streaming.presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                  </Field>
                </div>
                <div className="detector-card detector-card--mono">
                  <div className="detector-card__label">Default mode</div>
                  <div className="mt-2">{streaming.defaultMode}</div>
                </div>
                <div className="detector-card">
                  <Field label="VAD backend" hint={formatVadTimingHint(streaming.snapshot?.config)}>
                    <select
                      value={currentVadBackend}
                      onChange={(event) => streaming.updateConfig({ vadBackend: event.target.value })}
                      disabled={microphone.isActive}
                      className="compact-control compact-control--dense"
                    >
                      {VAD_BACKEND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="detector-card">
                  <Field label="Gate mode" hint={streaming.snapshot?.gate?.effectiveMode ?? currentGateMode}>
                    <select
                      value={currentGateMode}
                      onChange={(event) => streaming.updateConfig({ gateMode: event.target.value })}
                      disabled={microphone.isActive}
                      className="compact-control compact-control--dense"
                    >
                      {GATE_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              {remainingTuningGroups.map((group) => (
                <div key={group.id} className="tuning-group">
                  <div className="tuning-group__head">
                    <div className="panel-title">{group.title}</div>
                    <div className="type-caption">{group.description}</div>
                  </div>
                  <div className="tuning-sliders">
                    {group.controls.map((definition) => (
                      <StreamingControlSlider
                        key={definition.field}
                        definition={definition}
                        value={streaming.snapshot?.config?.[definition.field]}
                        resolvedConfig={streaming.snapshot?.config ?? { chunkDurationMs: streaming.chunkDurationMs }}
                        onChange={(value) => streaming.updateConfig({ [definition.field]: value })}
                        compact
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Widget>

          <div className="capture-rail">
            <section className="app-rail-section app-rail-section--flush-top">
              <div className="widget-header widget-header--rail">
                <div>
                  <h2 className="section-heading">Microphone</h2>
                  <p className="section-subtitle">
                    Start capture, switch mode, and send buffered speech.
                  </p>
                  {microphone.error ? <p className="section-subtitle text-danger">{microphone.error}</p> : null}
                </div>
              </div>

              <div className="app-stack--sm">
                <Field label="Mode">
                  <select
                    value={microphone.mode}
                    onChange={(event) => microphone.setMode(event.target.value)}
                    disabled={microphone.isActive}
                    className="compact-control compact-control--dense"
                  >
                    <option value="manual">Manual</option>
                    <option value="speech-detect">Speech Detect</option>
                  </select>
                </Field>

                <div className="flex-row flex-row--wrap gap-2">
                  <button
                    type="button"
                    onClick={microphone.isActive ? () => microphone.stop({ flush: true }) : microphone.start}
                    disabled={microphone.isLoadingSample || !microphone.supportsInput}
                    className={microphone.isActive ? 'compact-button-secondary compact-button--sm' : 'compact-button-dark compact-button--sm'}
                  >
                    {microphone.isActive ? 'Stop Mic' : 'Start Mic'}
                  </button>
                  {microphone.isActive || microphone.mode === 'speech-detect' ? (
                    <button type="button" onClick={() => microphone.flush('manual')} className="compact-button-secondary compact-button--sm">
                      Send
                    </button>
                  ) : null}
                  <button type="button" onClick={() => debugHud.setVisible(!debugHud.isVisible)} className="compact-button-secondary compact-button--sm">
                    {debugHud.isVisible ? 'Hide Advanced' : 'Advanced'}
                  </button>
                  <span className="mic-status-inline">{microphone.status}</span>
                </div>
              </div>
            </section>

            <SignalMeter monitor={streaming.monitor} capture={streaming.captureInfo} />

            {streaming.detectorWarnings.length > 0 ? (
              <section className="alert-warn-banner">
                <div className="panel-title title-danger">Warnings</div>
                <div className="app-stack--2xs mt-2">
                  {streaming.detectorWarnings.map((warning) => (
                    <div key={warning} className="alert-warn-item">
                      {warning}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid-2-loose grid-2-loose--tight">
              <Widget variant="rail" title="Decisions" className="app-rail-section--borderless">
                <div className="app-stack--2xs">
                  {streaming.recentDecisionEntries.length > 0 ? streaming.recentDecisionEntries.map((entry) => (
                    <div key={entry.id} className="list-card">
                      <div className="list-card__row">
                        <div className="list-card__title">{entry.message}</div>
                        <div className="list-card__meta">{entry.at}</div>
                      </div>
                    </div>
                  )) : <div className="type-caption">No decisions yet.</div>}
                </div>
              </Widget>

              <Widget variant="rail" title="Segments" className="app-rail-section--borderless">
                <div className="app-stack--2xs">
                  {streaming.recentSegmentEntries.length > 0 ? streaming.recentSegmentEntries.map((segment) => {
                    const duration = getStreamingSegmentDurationSeconds(segment, segment.sampleRate);
                    return (
                      <div key={`${segment.startFrame}-${segment.endFrame}`} className="list-card">
                        <div className="list-card__row">
                          <div className="list-card__title">{segment.reason || 'segment'}</div>
                          <div className="list-card__meta">{formatSecondsValue(duration)}</div>
                        </div>
                        <div className="list-card__sub">
                          {formatSampleRate(segment.sampleRate)} · {segment.startFrame} {'->'} {segment.endFrame}
                        </div>
                      </div>
                    );
                  }) : <div className="type-caption">No segments yet.</div>}
                </div>
              </Widget>
            </div>
          </div>
        </div>

        {debugHud.isVisible ? (
          <div>
            <StreamingDebugHud
              snapshot={streaming.snapshot}
              latency={streaming.latency}
              isVisible={debugHud.isVisible}
              profileId={streaming.profileId}
              defaultMode={streaming.defaultMode}
              presets={streaming.presets}
              onClose={() => debugHud.setVisible(false)}
              onProfileChange={streaming.applyPreset}
              onConfigChange={(field, value) => streaming.updateConfig({ [field]: value })}
              onReset={streaming.resetDefaults}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
