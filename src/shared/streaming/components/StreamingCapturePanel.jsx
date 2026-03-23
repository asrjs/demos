import React from 'react';
import { getStreamingSegmentDurationSeconds } from '@asrjs/speech-recognition/realtime';
import { StreamingDebugHud } from './StreamingDebugHud.jsx';
import { WaveformCanvas } from './WaveformCanvas.jsx';
import { SignalMeter } from './SignalMeter.jsx';
import { StreamingControlSlider } from './StreamingControlSlider.jsx';
import { Field, Widget } from '../../ui/PanelPrimitives.jsx';
import { WAVEFORM_SCALE_OPTIONS } from '../layout/constants.js';
import {
  formatDbfsValue,
  formatFixed,
  formatMilliseconds,
  formatSampleRate,
  formatSecondsValue,
} from '../layout/formatters.js';

export function StreamingCapturePanel({
  waveformDisplay,
  streaming,
  microphone,
  debugHud,
}) {
  return (
    <div className="panel-shell panel-shell--overflow workspace-main">
      <header className="workspace-main__head">
        <h1 className="page-title">Capture</h1>
      </header>

      <div className="workspace-main__body">
        <section className="app-rail-section app-rail-section--flush-top">
          <div className="widget-header widget-header--rail">
            <h2 className="section-heading">Waveform · detector tuning</h2>
          </div>

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
          />

          <div className="toolbar-divider">
            <div className="waveform-toolbar">
              <label className="waveform-toolbar__group waveform-toolbar__group--wide">
                <span className="type-label-caps">View</span>
                <span className="line-clamp-1 type-micro">
                  {WAVEFORM_SCALE_OPTIONS.find((option) => option.value === waveformDisplay.scaleMode)?.note ?? '-'}
                </span>
                <select
                  value={waveformDisplay.scaleMode}
                  onChange={(event) => waveformDisplay.setScaleMode(event.target.value)}
                  className="compact-control compact-control--dense mt-1"
                >
                  {WAVEFORM_SCALE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="waveform-toolbar__group">
                <span className="type-label-caps">FG line</span>
                <span className="type-mono-micro">
                  {waveformDisplay.showSpeechThreshold ? formatDbfsValue(streaming.liveSpeechThresholdDbfs) : '-'}
                </span>
                <select
                  value={waveformDisplay.showSpeechThreshold ? 'on' : 'off'}
                  onChange={(event) => waveformDisplay.setShowSpeechThreshold(event.target.value === 'on')}
                  className="compact-control compact-control--dense mt-1"
                >
                  <option value="on">show</option>
                  <option value="off">hide</option>
                </select>
              </label>
              <label className="waveform-toolbar__group">
                <span className="type-label-caps">TEN line</span>
                <span className="type-mono-micro">
                  {formatFixed(streaming.snapshot?.config?.tenVadThreshold)}
                </span>
                <select
                  value={waveformDisplay.showTenVadThreshold ? 'on' : 'off'}
                  onChange={(event) => waveformDisplay.setShowTenVadThreshold(event.target.value === 'on')}
                  className="compact-control compact-control--dense mt-1"
                >
                  <option value="on">show</option>
                  <option value="off">hide</option>
                </select>
              </label>
              <label className="waveform-toolbar__group">
                <span className="type-label-caps">RMS</span>
                <span className="type-micro">diagnostic</span>
                <select
                  value={waveformDisplay.showPreVadOverlay ? 'on' : 'off'}
                  onChange={(event) => waveformDisplay.setShowPreVadOverlay(event.target.value === 'on')}
                  className="compact-control compact-control--dense mt-1"
                >
                  <option value="off">hide</option>
                  <option value="on">show</option>
                </select>
              </label>
            </div>
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
                <div className="detector-card">
                  <Field label="Foreground Filter" hint={streaming.snapshot?.gate?.effectiveMode ?? '--'}>
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
                <div className="detector-card detector-card--mono">
                  <div className="detector-card__label">Default mode</div>
                  <div className="mt-2">{streaming.defaultMode}</div>
                </div>
                <div className="detector-card detector-card--mono">
                  <div className="detector-card__label">Release / speech line</div>
                  <div className="mt-2">{formatMilliseconds(streaming.estimatedTailBudgetMs)}</div>
                  <div className="mt-1">{formatDbfsValue(streaming.liveSpeechThresholdDbfs)}</div>
                </div>
              </div>

              {streaming.tuningGroups.map((group) => (
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
