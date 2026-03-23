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
    <Widget title="Capture" className="overflow-hidden">
      <div className="space-y-6">
        <section className="rounded-[10px] border border-slate-300 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="panel-title">Waveform Workspace</div>
              <div className="mt-1 max-w-[720px] text-[12px] leading-6 text-slate-600">
                Tune the detector while watching candidate speech, accepted segments, and the live foreground threshold in one place.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] text-slate-700">
              <span className="status-chip status-muted">mode {streaming.snapshot?.gate?.effectiveMode ?? '--'}</span>
              <span className="status-chip status-muted">release {formatMilliseconds(streaming.estimatedTailBudgetMs)}</span>
              <span className="status-chip status-muted">noise {formatDbfsValue(streaming.liveNoiseFloorDbfs)}</span>
              <span className="status-chip status-muted">speech {formatDbfsValue(streaming.liveSpeechThresholdDbfs)}</span>
            </div>
          </div>

          <WaveformCanvas
            monitor={streaming.monitor}
            capture={streaming.captureInfo}
            scaleMode={waveformDisplay.scaleMode}
            showSpeechThreshold={waveformDisplay.showSpeechThreshold}
            showTenVadThreshold={waveformDisplay.showTenVadThreshold}
            showPreVadOverlay={waveformDisplay.showPreVadOverlay}
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
              <Field
                label="View"
                hint={WAVEFORM_SCALE_OPTIONS.find((option) => option.value === waveformDisplay.scaleMode)?.note}
              >
                <select
                  value={waveformDisplay.scaleMode}
                  onChange={(event) => waveformDisplay.setScaleMode(event.target.value)}
                  className="compact-control !px-2.5 !py-2 !text-[11px]"
                >
                  {WAVEFORM_SCALE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
              <Field
                label="FG line"
                hint={waveformDisplay.showSpeechThreshold ? formatDbfsValue(streaming.liveSpeechThresholdDbfs) : 'hidden'}
              >
                <select
                  value={waveformDisplay.showSpeechThreshold ? 'on' : 'off'}
                  onChange={(event) => waveformDisplay.setShowSpeechThreshold(event.target.value === 'on')}
                  className="compact-control !px-2.5 !py-2 !text-[11px]"
                >
                  <option value="on">show</option>
                  <option value="off">hide</option>
                </select>
              </Field>
            </div>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
              <Field label="TEN line" hint={formatFixed(streaming.snapshot?.config?.tenVadThreshold)}>
                <select
                  value={waveformDisplay.showTenVadThreshold ? 'on' : 'off'}
                  onChange={(event) => waveformDisplay.setShowTenVadThreshold(event.target.value === 'on')}
                  className="compact-control !px-2.5 !py-2 !text-[11px]"
                >
                  <option value="on">show</option>
                  <option value="off">hide</option>
                </select>
              </Field>
            </div>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
              <Field label="RMS" hint="diagnostic">
                <select
                  value={waveformDisplay.showPreVadOverlay ? 'on' : 'off'}
                  onChange={(event) => waveformDisplay.setShowPreVadOverlay(event.target.value === 'on')}
                  className="compact-control !px-2.5 !py-2 !text-[11px]"
                >
                  <option value="off">hide</option>
                  <option value="on">show</option>
                </select>
              </Field>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.32fr)_minmax(320px,0.68fr)]">
          <Widget title="Detector Tuning">
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                  <Field label="Preset">
                    <select
                      value={streaming.profileId}
                      onChange={(event) => streaming.applyPreset(event.target.value)}
                      className="compact-control !px-2.5 !py-2 !text-[11px]"
                    >
                      {streaming.presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                  </Field>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                  <Field label="Foreground Filter" hint={streaming.snapshot?.gate?.effectiveMode ?? '--'}>
                    <select
                      value={streaming.snapshot?.config?.foregroundFilterEnabled ? 'on' : 'off'}
                      onChange={(event) => streaming.updateConfig({ foregroundFilterEnabled: event.target.value === 'on' })}
                      className="compact-control !px-2.5 !py-2 !text-[11px]"
                    >
                      <option value="on">enabled</option>
                      <option value="off">disabled</option>
                    </select>
                  </Field>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-[11px] text-slate-700">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Default mode</div>
                  <div className="mt-2">{streaming.defaultMode}</div>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-[11px] text-slate-700">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Release / speech line</div>
                  <div className="mt-2">{formatMilliseconds(streaming.estimatedTailBudgetMs)}</div>
                  <div className="mt-1">{formatDbfsValue(streaming.liveSpeechThresholdDbfs)}</div>
                </div>
              </div>

              {streaming.tuningGroups.map((group) => (
                <div key={group.id} className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="panel-title">{group.title}</div>
                    <div className="text-[11px] text-slate-600">{group.description}</div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
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

          <div className="space-y-6">
            <section className="rounded-[10px] border border-slate-300 bg-white p-4">
              <div className="space-y-4">
                <div className="min-w-0">
                  <div className="panel-title">Microphone</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-600">
                    Start capture, switch mode, and send buffered speech.
                  </div>
                  {microphone.error ? <div className="mt-1 text-[11px] text-rose-600">{microphone.error}</div> : null}
                </div>

                <Field label="Mode">
                  <select
                    value={microphone.mode}
                    onChange={(event) => microphone.setMode(event.target.value)}
                    disabled={microphone.isActive}
                    className="compact-control !px-2.5 !py-2 !text-[11px]"
                  >
                    <option value="manual">Manual</option>
                    <option value="speech-detect">Speech Detect</option>
                  </select>
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={microphone.isActive ? () => microphone.stop({ flush: true }) : microphone.start}
                    disabled={microphone.isLoadingSample || !microphone.supportsInput}
                    className={microphone.isActive ? 'compact-button-secondary !px-3 !py-2 !text-[11px]' : 'compact-button-dark !px-3 !py-2 !text-[11px]'}
                  >
                    {microphone.isActive ? 'Stop Mic' : 'Start Mic'}
                  </button>
                  {microphone.isActive || microphone.mode === 'speech-detect' ? (
                    <button type="button" onClick={() => microphone.flush('manual')} className="compact-button-secondary !px-3 !py-2 !text-[11px]">
                      Send
                    </button>
                  ) : null}
                  <button type="button" onClick={() => debugHud.setVisible(!debugHud.isVisible)} className="compact-button-secondary !px-3 !py-2 !text-[11px]">
                    {debugHud.isVisible ? 'Hide Advanced' : 'Advanced'}
                  </button>
                  <span className="status-chip status-muted">{microphone.status}</span>
                </div>
              </div>
            </section>

            <SignalMeter monitor={streaming.monitor} capture={streaming.captureInfo} />

            {streaming.detectorWarnings.length > 0 ? (
              <section className="rounded-[10px] border border-rose-200 bg-rose-50 p-4">
                <div className="mb-2 panel-title !text-rose-700">Warnings</div>
                <div className="space-y-1.5">
                  {streaming.detectorWarnings.map((warning) => (
                    <div key={warning} className="rounded-[10px] border border-rose-200 bg-white px-3 py-2 text-[11px] text-rose-700">
                      {warning}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Widget title="Decisions">
                <div className="space-y-1.5">
                  {streaming.recentDecisionEntries.length > 0 ? streaming.recentDecisionEntries.map((entry) => (
                    <div key={entry.id} className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-medium text-slate-900">{entry.message}</div>
                        <div className="font-mono text-[10px] text-slate-600">{entry.at}</div>
                      </div>
                    </div>
                  )) : <div className="text-[11px] text-slate-600">No decisions yet.</div>}
                </div>
              </Widget>

              <Widget title="Segments">
                <div className="space-y-1.5">
                  {streaming.recentSegmentEntries.length > 0 ? streaming.recentSegmentEntries.map((segment) => {
                    const duration = getStreamingSegmentDurationSeconds(segment, segment.sampleRate);
                    return (
                      <div key={`${segment.startFrame}-${segment.endFrame}`} className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-medium text-slate-900">{segment.reason || 'segment'}</div>
                          <div className="font-mono text-[10px] text-slate-700">{formatSecondsValue(duration)}</div>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-slate-600">
                          {formatSampleRate(segment.sampleRate)} · {segment.startFrame} {'->'} {segment.endFrame}
                        </div>
                      </div>
                    );
                  }) : <div className="text-[11px] text-slate-600">No segments yet.</div>}
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
    </Widget>
  );
}
