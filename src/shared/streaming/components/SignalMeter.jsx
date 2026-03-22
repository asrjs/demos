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
  if (rough?.isSpeech) {
    return 'active';
  }
  if (rough?.energyPass) {
    return 'candidate';
  }
  return 'hold';
}

export function resolveEnergyGateNote(rough) {
  if (rough?.isSpeech && !rough?.energyPass) {
    return 'latched';
  }
  return rough?.candidateReason ?? 'none';
}

function Line({ label, value, note }) {
  return (
    <div className="font-mono text-[11px] leading-5 text-slate-700">
      <span className="mr-2 uppercase tracking-[0.12em] text-[#688098]">{label}</span>
      <span className="text-slate-900">{value}</span>
      {note ? <span className="ml-2 text-[10px] text-slate-500">{note}</span> : null}
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
    tenVad: snapshot.tenVad ?? null,
    vadBuffer: snapshot.vadBuffer ?? null,
  };
}

export function SignalMeter({
  monitor = null,
  capture = null,
  rough = null,
  tenVad = null,
  vadBuffer = null,
}) {
  const monitorState = useStreamingMonitor({
    monitor,
    captureInfo: capture,
    selector: selectSignalMeterState,
  });
  const effectiveRough = monitor ? monitorState?.rough ?? null : rough;
  const effectiveGate = monitor ? monitorState?.gate ?? null : null;
  const effectiveTenVad = monitor ? monitorState?.tenVad ?? null : tenVad;
  const effectiveVadBuffer = monitor ? monitorState?.vadBuffer ?? null : vadBuffer;
  const vadSpeechHopCount = effectiveVadBuffer?.speechHopCount ?? 0;
  const vadTotalHops = effectiveVadBuffer?.totalHops ?? 0;
  const vadMaxProbability = effectiveVadBuffer?.maxProbability ?? 0;

  return (
    <section className="space-y-2">
      <div className="font-mono text-[10px] text-slate-500">realtime metrics</div>
      <div className="space-y-1 rounded-[10px] border border-slate-200 bg-[#fbfcfd] px-3 py-2.5">
        <Line
          label="level"
          value={formatDbfs(effectiveRough?.levelDbfs)}
          note={`window ${formatDbfs(effectiveRough?.levelWindowDbfs)}`}
        />
        <Line
          label="threshold"
          value={formatDbfs(effectiveRough?.thresholdDbfs)}
          note={`noise ${formatDbfs(effectiveRough?.noiseFloorDbfs)}`}
        />
        <Line
          label="bg_model"
          value={formatDbfs(effectiveRough?.backgroundAverageDbfs)}
          note={`floor ${formatDbfs(effectiveRough?.noiseFloorDbfs)}`}
        />
        <Line
          label="bg_sources"
          value={`sil ${formatDbfs(effectiveRough?.confirmedSilenceAverageDbfs)}`}
          note={`rej ${formatDbfs(effectiveRough?.rejectedCandidateAverageDbfs)}`}
        />
        <Line
          label="snr"
          value={formatSigned(effectiveRough?.snr, ' dB')}
          note={effectiveRough?.useSnrGate ? `min ${formatSigned(effectiveRough?.minSnrThreshold, ' dB')}` : 'diagnostic only'}
        />
        <Line
          label="gate_mode"
          value={effectiveGate?.effectiveMode ?? '--'}
          note={effectiveGate?.requestedMode ? `req ${effectiveGate.requestedMode}` : null}
        />
        <Line
          label="ten_vad"
          value={formatFixed(effectiveTenVad?.probability)}
          note={effectiveTenVad?.speaking ? 'speaking' : 'idle'}
        />
        <Line
          label="energy_gate"
          value={resolveEnergyGateState(effectiveRough)}
          note={resolveEnergyGateNote(effectiveRough)}
        />
        <Line
          label="vad_buffer"
          value={vadTotalHops > 0 ? `${vadSpeechHopCount}/${vadTotalHops}` : 'empty'}
          note={`max ${formatFixed(vadMaxProbability)}`}
        />
      </div>
    </section>
  );
}
