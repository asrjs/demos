import { useStreamingMonitor } from '../useStreamingMonitor.js';

function formatDbfs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : '--';
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
    <div className="signal-meter__line">
      <div className="flex-row flex-row--between gap-3">
        <span className="signal-meter__label">{label}</span>
        <span className="signal-meter__value">{value}</span>
      </div>
      {note ? <span className="signal-meter__note">{note}</span> : null}
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
  const effectiveAcceptanceResult = effectiveAcceptance ?? effectiveForeground?.activeResult ?? effectiveForeground?.lastResult ?? null;
  const vadSpeechHopCount = effectiveVadBuffer?.speechHopCount ?? 0;
  const vadTotalHops = effectiveVadBuffer?.totalHops ?? 0;
  const vadMaxProbability = effectiveVadBuffer?.maxProbability ?? 0;
  const powerThreshold = effectiveAcceptanceResult?.minEnergyPerSecondThreshold ?? effectiveAcceptanceResult?.minEnergyPerSecond;
  const integralThreshold = effectiveAcceptanceResult?.minEnergyIntegralThreshold ?? effectiveAcceptanceResult?.minEnergyIntegral;

  return (
    <section className="app-rail-section signal-meter signal-meter--flat">
      <div className="widget-header widget-header--rail">
        <div>
          <h2 className="section-heading">Detector readout</h2>
          <p className="section-subtitle">Live rough-gate state, adaptive noise floor, and final segment energy metrics.</p>
        </div>
      </div>
      <div className="signal-meter__grid">
        <Line
          label="level"
          value={formatDbfs(effectiveRough?.levelDbfs)}
          note={`window ${formatDbfs(effectiveRough?.levelWindowDbfs)}`}
        />
        <Line
          label="noise floor"
          value={formatDbfs(effectiveForeground?.noiseFloorDbfs ?? effectiveRough?.noiseFloorDbfs)}
          note={`confirmed ${formatDbfs(effectiveRough?.confirmedSilenceAverageDbfs)} · rejected ${formatDbfs(effectiveRough?.rejectedCandidateAverageDbfs)}`}
        />
        <Line
          label="final power"
          value={formatFixed(effectiveAcceptanceResult?.normalizedPowerAt16k)}
          note={`min ${formatFixed(powerThreshold)}`}
        />
        <Line
          label="final integral"
          value={formatFixed(effectiveAcceptanceResult?.normalizedEnergyIntegralAt16k)}
          note={`min ${formatFixed(integralThreshold)}`}
        />
        <Line
          label="detector mode"
          value={effectiveGate?.effectiveMode ?? '--'}
          note={effectiveGate?.requestedMode ? `req ${effectiveGate.requestedMode}` : null}
        />
        <Line
          label="ten-vad"
          value={formatFixed(effectiveTenVad?.probability)}
          note="diagnostic only"
        />
        <Line
          label="filter"
          value={resolveEnergyGateState(effectiveForeground)}
          note={effectiveAcceptanceResult?.reason ?? resolveEnergyGateNote(effectiveForeground)}
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
