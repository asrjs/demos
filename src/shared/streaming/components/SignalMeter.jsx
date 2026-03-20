function toDbfsPercent(value) {
  const minDbfs = -72;
  const maxDbfs = 0;
  const safeValue = Math.max(minDbfs, Math.min(maxDbfs, value ?? minDbfs));
  return ((safeValue - minDbfs) / (maxDbfs - minDbfs)) * 100;
}

function formatSigned(value, unit = '') {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}${unit}`;
}

function formatDbfs(value) {
  return `${value.toFixed(1)} dBFS`;
}

function formatRms(value) {
  return value.toFixed(4);
}

export function SignalMeter({ rough, tenVad }) {
  const energy = rough?.energy ?? 0;
  const noiseFloor = rough?.noiseFloor ?? 0;
  const threshold = rough?.threshold ?? 0;
  const levelDbfs = rough?.levelDbfs ?? -100;
  const levelWindowDbfs = rough?.levelWindowDbfs ?? -100;
  const levelWindowMs = rough?.levelWindowMs ?? 1000;
  const noiseFloorDbfs = rough?.noiseFloorDbfs ?? -100;
  const thresholdDbfs = rough?.thresholdDbfs ?? -100;
  const snr = rough?.snr ?? 0;
  const snrThreshold = rough?.snrThreshold ?? 0;
  const minSnrThreshold = rough?.minSnrThreshold ?? 0;
  const energyPass = Boolean(rough?.energyPass);
  const snrPass = Boolean(rough?.snrPass);
  const useSnrGate = Boolean(rough?.useSnrGate);
  const thresholdPercent = toDbfsPercent(thresholdDbfs);
  const noisePercent = toDbfsPercent(noiseFloorDbfs);
  const energyPercent = toDbfsPercent(levelDbfs);
  const levelWindowPercent = toDbfsPercent(levelWindowDbfs);

  const primaryRows = [
    ['window_level', formatDbfs(levelDbfs), `${formatRms(energy)} rms`],
    ['speech_thresh', formatDbfs(thresholdDbfs), `${formatRms(threshold)} rms`],
    ['noise_floor', formatDbfs(noiseFloorDbfs), `${formatRms(noiseFloor)} rms`],
    ['rolling_level', formatDbfs(levelWindowDbfs), `${(levelWindowMs / 1000).toFixed(1)} s window`],
    ['snr', `${formatSigned(snr, ' dB')}`, `threshold ${formatSigned(snrThreshold, ' dB')}`],
    ['ten_vad', `${(tenVad?.probability ?? 0).toFixed(2)} / ${(tenVad?.threshold ?? 0.5).toFixed(2)}`, tenVad?.speaking ? 'speaking' : 'idle'],
  ];

  const gateRows = [
    ['state', rough?.isSpeech ? 'speech' : 'silence', 'detector state'],
    ['energy_gate', energyPass ? 'pass' : 'hold', useSnrGate ? 'amplitude threshold' : 'primary trigger'],
    ['snr_gate', useSnrGate ? (snrPass ? 'pass' : 'hold') : 'off', useSnrGate ? `min ${formatSigned(minSnrThreshold, ' dB')}` : 'diagnostic only'],
    ['candidate', rough?.candidateReason ?? 'none', 'latest reason'],
  ];

  return (
    <section className="rounded-[28px] border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
            Signal Console
          </div>
          <div className="mt-1 font-mono text-[13px] text-slate-300">
            Read left to right: current speech level, threshold, then noise floor.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConsoleBadge label="energy" value={energyPass ? 'pass' : 'hold'} tone={energyPass ? 'good' : 'muted'} />
          <ConsoleBadge
            label="snr"
            value={useSnrGate ? (snrPass ? 'pass' : 'hold') : 'off'}
            tone={useSnrGate ? (snrPass ? 'good' : 'muted') : 'warn'}
          />
          <ConsoleBadge label="ten-vad" value={tenVad?.speaking ? 'speech' : 'idle'} tone={tenVad?.speaking ? 'good' : 'muted'} />
          <ConsoleBadge label="state" value={rough?.isSpeech ? 'speech' : 'silence'} tone={rough?.isSpeech ? 'good' : 'muted'} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] text-slate-400">
            <span>scale -72 dBFS .. 0 dBFS</span>
            <span>current {formatDbfs(levelDbfs)}</span>
          </div>
          <div className="relative h-8 overflow-hidden rounded-full border border-slate-800 bg-slate-950">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500/55 via-cyan-400/70 to-cyan-200/90" style={{ width: `${energyPercent}%` }} />
            <div className="absolute inset-y-1 left-0 rounded-full bg-cyan-100/70" style={{ width: `${levelWindowPercent}%` }} />
            <div className="absolute inset-y-0 w-[2px] bg-amber-300" style={{ left: `${noisePercent}%` }} />
            <div className="absolute inset-y-0 w-[3px] bg-rose-400" style={{ left: `${thresholdPercent}%` }} />
            <ScaleTick left="25%" />
            <ScaleTick left="50%" />
            <ScaleTick left="75%" />
          </div>
          <div className="mt-3 grid gap-2 font-mono text-[12px] text-slate-300 md:grid-cols-3">
            <LegendItem label="current" value={formatDbfs(levelDbfs)} tone="text-cyan-200" />
            <LegendItem label="threshold" value={formatDbfs(thresholdDbfs)} tone="text-rose-300" />
            <LegendItem label="noise floor" value={formatDbfs(noiseFloorDbfs)} tone="text-amber-200" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <MetricTable title="Primary Metrics" rows={primaryRows} />
          <MetricTable title="Gate Status" rows={gateRows} />
        </div>
      </div>
    </section>
  );
}

function ScaleTick({ left }) {
  return <div className="absolute inset-y-0 w-px bg-white/10" style={{ left }} />;
}

function LegendItem({ label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-[13px] ${tone}`}>{value}</div>
    </div>
  );
}

function MetricTable({ title, rows }) {
  return (
    <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </div>
      <div className="mt-3 space-y-2 font-mono">
        {rows.map(([label, value, note]) => (
          <div key={label} className="grid grid-cols-[11rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              {label}
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-[13px] text-slate-100">{value}</div>
              <div className="truncate text-[11px] text-slate-400">{note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsoleBadge({ label, value, tone }) {
  const tones = {
    good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    warn: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    muted: 'border-slate-700 bg-slate-900 text-slate-300',
  };

  return (
    <div className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] ${tones[tone] ?? tones.muted}`}>
      <span className="text-slate-500">{label}</span> {value}
    </div>
  );
}
