import { SignalMeter } from './SignalMeter.jsx';
import { WaveformCanvas } from './WaveformCanvas.jsx';

const CONTROL_FIELDS = [
  ['analysisWindowMs', 'Analysis ms', 40, 160, 40],
  ['prerollMs', 'Preroll ms', 80, 1200, 20],
  ['minSilenceDurationMs', 'Silence ms', 200, 2000, 20],
  ['minSpeechDurationMs', 'Min speech ms', 80, 640, 40],
  ['minSpeechLevelDbfs', 'Speech thr dBFS', -72, -12, 1],
  ['levelWindowMs', 'Level window ms', 200, 2000, 100],
  ['energyRiseThreshold', 'Rise thr', 0.01, 0.4, 0.01],
  ['maxOnsetLookbackChunks', 'Lookback', 1, 12, 1],
  ['tenVadThreshold', 'TEN thr', 0.05, 0.95, 0.01],
  ['tenVadConfirmationWindowMs', 'TEN confirm', 64, 800, 16],
  ['tenVadHangoverMs', 'TEN hangover', 64, 1200, 16],
  ['maxSegmentDurationMs', 'Max seg ms', 400, 12000, 100],
];

export function StreamingDebugHud({
  snapshot,
  isVisible,
  profileId,
  defaultMode,
  presets,
  onClose,
  onProfileChange,
  onConfigChange,
  onReset,
}) {
  if (!isVisible || !snapshot) {
    return null;
  }

  return (
    <section className="streaming-debug-hud mt-4 rounded-3xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Streaming Diagnostics
          </div>
          <div className="mt-1 text-sm text-slate-700">
            {snapshot.state} · {snapshot.sampleRate} Hz · TEN-VAD {snapshot.tenVad?.state}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
            <StatusPill
              label="Input"
              value={snapshot.capture?.inputSampleRate ? `${snapshot.capture.inputSampleRate} Hz` : 'unknown'}
            />
            <StatusPill
              label="Processing"
              value={snapshot.capture?.processingSampleRate ? `${snapshot.capture.processingSampleRate} Hz` : `${snapshot.sampleRate} Hz`}
            />
            <StatusPill label="Mode" value={defaultMode === 'speech-detect' ? 'Speech Detect default' : 'Manual default'} />
            <StatusPill label="Analysis" value={`${formatValue(snapshot.config?.analysisWindowMs)} ms`} />
            <StatusPill label="Speech thr" value={`${formatValue(snapshot.config?.minSpeechLevelDbfs)} dBFS`} />
            <StatusPill label="Min speech" value={`${formatValue(snapshot.config?.minSpeechDurationMs)} ms`} />
            <StatusPill label="TEN thr" value={formatValue(snapshot.config?.tenVadThreshold)} />
          </div>
          {snapshot.capture?.deviceLabel && (
            <div className="mt-2 text-xs text-slate-500">
              {snapshot.capture.deviceLabel}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="streaming-debug-grid">
        <section className="space-y-3">
          <WaveformCanvas snapshot={snapshot} />
          <SignalMeter rough={snapshot.rough} tenVad={snapshot.tenVad} />

          {snapshot.acceptance && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Accepted Because
              </div>
              <div className="mt-1 text-sm font-medium text-emerald-900">
                {snapshot.acceptance.reason}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-800">
                <StatusPill label="Energy" value={formatValue(snapshot.acceptance.energy)} />
                <StatusPill label="Level" value={`${formatValue(snapshot.acceptance.levelDbfs)} dBFS`} />
                <StatusPill label="Threshold" value={`${formatValue(snapshot.acceptance.thresholdDbfs)} dBFS`} />
                <StatusPill label="TEN-VAD" value={snapshot.acceptance.tenVadConfirmed ? 'confirmed' : 'not confirmed'} />
              </div>
            </div>
          )}

          {snapshot.warnings?.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                Warnings
              </div>
              <div className="mt-2 space-y-2">
                {snapshot.warnings.map((warning) => (
                  <div key={warning} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-[12px] text-rose-900">
                    {warning}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-700 md:grid-cols-4">
            <MetricCard
              label="Active segment"
              value={
                snapshot.activeSegment
                  ? `${((snapshot.activeSegment.endFrame - snapshot.activeSegment.startFrame) / snapshot.sampleRate).toFixed(2)} s`
                  : 'none'
              }
            />
            <MetricCard
              label="Pending onset"
              value={
                snapshot.pendingSegmentStartFrame !== null
                  ? 'armed'
                  : 'none'
              }
            />
            <MetricCard
              label="Recent segments"
              value={String(snapshot.recentSegments?.length ?? 0)}
            />
            <MetricCard
              label="Last error"
              value={snapshot.error ?? 'none'}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Energy rise" value={formatValue(snapshot.config?.energyRiseThreshold)} />
            <MetricCard label="Lookback" value={String(snapshot.config?.maxOnsetLookbackChunks ?? 0)} />
            <MetricCard label="TEN confirm" value={`${formatValue(snapshot.config?.tenVadConfirmationWindowMs)} ms`} />
            <MetricCard label="TEN hangover" value={`${formatValue(snapshot.config?.tenVadHangoverMs)} ms`} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Decision Log
            </div>
            <div className="streaming-log-list space-y-2 overflow-y-auto pr-1">
              {(snapshot.recentDecisions?.length
                ? [...snapshot.recentDecisions].reverse()
                : [{ id: 'empty', at: '--:--:--', message: 'No detector decisions yet', meta: {} }]
              ).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-medium text-slate-900">{entry.message}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{entry.at}</div>
                  </div>
                  {Object.keys(entry.meta ?? {}).length > 0 && (
                    <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] text-slate-500">
                      {JSON.stringify(entry.meta, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Preset
            </label>
            <select
              value={profileId}
              onChange={(event) => onProfileChange(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="streaming-control-list space-y-3 overflow-y-auto pr-1">
            {CONTROL_FIELDS.map(([field, label, min, max, step]) => (
              <label key={field} className="block rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] text-slate-700">
                  <span>{label}</span>
                  <span className="font-mono text-slate-500">
                    {formatValue(snapshot.config?.[field])}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={snapshot.config?.[field] ?? min}
                  onChange={(event) => onConfigChange(field, Number(event.target.value))}
                  className="w-full accent-emerald-500"
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 text-[12px] font-medium text-slate-900">{value}</div>
    </div>
  );
}

function StatusPill({ label, value }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
      <span className="font-semibold text-slate-500">{label}:</span> {value}
    </span>
  );
}

function formatValue(value) {
  if (typeof value !== 'number') return String(value ?? '');
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
