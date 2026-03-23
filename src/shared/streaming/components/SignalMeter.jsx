import { useStreamingMonitor } from '../useStreamingMonitor.js';

function formatDbfs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : '--';
}

function formatSigned(value, unit = '') {
  return Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}${unit}` : '--';
}

function formatFixed(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

export function resolveEnergyGateState(rough) {
  if (typeof rough?.isSpeech === 'boolean' || typeof rough?.energyPass === 'boolean') {
    if (rough?.isSpeech) {
      return 'active';
    }
    if (rough?.energyPass) {
      return 'candidate';
    }
    return 'hold';
  }
  if (!rough?.enabled) {
    return 'off';
  }
  if (rough?.lastResult?.accepted === false) {
    return 'rejected';
  }
  if (rough?.lastResult?.accepted === true) {
    return 'accepted';
  }
  return 'armed';
}

export function resolveEnergyGateNote(rough) {
  if (typeof rough?.isSpeech === 'boolean' || typeof rough?.candidateReason === 'string') {
    if (rough?.isSpeech && !rough?.energyPass) {
      return 'latched';
    }
    return rough?.candidateReason ?? 'none';
  }
  if (!rough?.enabled) {
    return 'disabled';
  }
  return rough?.lastResult?.reason ?? 'waiting';
}

function Line({ label, value, note }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <span className="text-right font-mono text-[12px] font-semibold text-slate-950">{value}</span>
      </div>
      {note ? <span className="mt-1 block text-right font-mono text-[10px] text-slate-600">{note}</span> : null}
    </div>
  );
}

function selectSignalMeterState(snapshot) {
  if (!snapshot) {
    return null;
  }
  return {
    gate: snapshot.gate ?? null,
    rough: snapshot.rough ?? null,
    foreground: snapshot.foreground ?? null,
    acceptance: snapshot.acceptance ?? null,
    tenVad: snapshot.tenVad ?? null,
    vadBuffer: snapshot.vadBuffer ?? null,
  };
}

export function SignalMeter({
  monitor = null,
  capture = null,
  rough = null,
  foreground = null,
  tenVad = null,
  vadBuffer = null,
}) {
  const monitorState = useStreamingMonitor({
    monitor,
    captureInfo: capture,
    selector: selectSignalMeterState,
  });
  const effectiveRough = monitor ? monitorState?.rough ?? null : rough;
  const effectiveForeground = monitor ? monitorState?.foreground ?? null : foreground;
  const effectiveAcceptance = monitor ? monitorState?.acceptance ?? null : null;
  const effectiveGate = monitor ? monitorState?.gate ?? null : null;
  const effectiveTenVad = monitor ? monitorState?.tenVad ?? null : tenVad;
  const effectiveVadBuffer = monitor ? monitorState?.vadBuffer ?? null : vadBuffer;
  const vadSpeechHopCount = effectiveVadBuffer?.speechHopCount ?? 0;
  const vadTotalHops = effectiveVadBuffer?.totalHops ?? 0;
  const vadMaxProbability = effectiveVadBuffer?.maxProbability ?? 0;

  return (
    <section className="rounded-[10px] border border-slate-300 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="panel-title">Detector Readout</div>
          <div className="mt-1 text-[11px] text-slate-600">Live foreground metrics and TEN-VAD state.</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Line
          label="level"
          value={formatDbfs(effectiveRough?.levelDbfs)}
          note={`window ${formatDbfs(effectiveRough?.levelWindowDbfs)}`}
        />
        <Line
          label="noise floor"
          value={formatDbfs(effectiveForeground?.noiseFloorDbfs ?? effectiveRough?.noiseFloorDbfs)}
          note={`bg ${formatDbfs(effectiveRough?.backgroundAverageDbfs)}`}
        />
        <Line
          label="foreground"
          value={formatSigned(effectiveAcceptance?.foregroundDb, ' dB')}
          note={`min ${formatSigned(effectiveForeground?.foregroundMinDb, ' dB')}`}
        />
        <Line
          label="onset"
          value={formatSigned(effectiveAcceptance?.onsetDb, ' dB')}
          note={`min ${formatSigned(effectiveForeground?.onsetMinDb, ' dB')}`}
        />
        <Line
          label="long rule"
          value={formatSigned(effectiveForeground?.longMinDb, ' dB')}
          note={effectiveAcceptance?.longSpeech ? 'long segment' : 'inactive'}
        />
        <Line
          label="detector mode"
          value={effectiveGate?.effectiveMode ?? '--'}
          note={effectiveGate?.requestedMode ? `req ${effectiveGate.requestedMode}` : null}
        />
        <Line
          label="ten-vad"
          value={formatFixed(effectiveTenVad?.probability)}
          note={effectiveTenVad?.speaking ? 'speaking' : 'idle'}
        />
        <Line
          label="foreground filter"
          value={resolveEnergyGateState(effectiveForeground)}
          note={resolveEnergyGateNote(effectiveForeground)}
        />
        <Line
          label="vad buffer"
          value={vadTotalHops > 0 ? `${vadSpeechHopCount}/${vadTotalHops}` : 'empty'}
          note={`max ${formatFixed(vadMaxProbability)}`}
        />
      </div>
    </section>
  );
}
