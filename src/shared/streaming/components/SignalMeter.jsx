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

export function SignalMeter({ rough, tenVad, vadBuffer }) {
  const vadSpeechHopCount = vadBuffer?.speechHopCount ?? 0;
  const vadTotalHops = vadBuffer?.totalHops ?? 0;
  const vadMaxProbability = vadBuffer?.maxProbability ?? 0;

  return (
    <section className="space-y-2">
      <div className="font-mono text-[10px] text-slate-500">realtime metrics</div>
      <div className="space-y-1 rounded-[10px] border border-slate-200 bg-[#fbfcfd] px-3 py-2.5">
        <Line
          label="level"
          value={formatDbfs(rough?.levelDbfs)}
          note={`window ${formatDbfs(rough?.levelWindowDbfs)}`}
        />
        <Line
          label="threshold"
          value={formatDbfs(rough?.thresholdDbfs)}
          note={`noise ${formatDbfs(rough?.noiseFloorDbfs)}`}
        />
        <Line
          label="snr"
          value={formatSigned(rough?.snr, ' dB')}
          note={rough?.useSnrGate ? `min ${formatSigned(rough?.minSnrThreshold, ' dB')}` : 'diagnostic only'}
        />
        <Line
          label="ten_vad"
          value={formatFixed(tenVad?.probability)}
          note={tenVad?.speaking ? 'speaking' : 'idle'}
        />
        <Line
          label="energy_gate"
          value={resolveEnergyGateState(rough)}
          note={resolveEnergyGateNote(rough)}
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
