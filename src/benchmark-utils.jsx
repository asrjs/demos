import React from 'react';

export const roundValue = (value, digits = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const mean = (values) => {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
};

export const median = (values) => {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
};

export const percentile = (values, p) => {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const ratio = Math.max(0, Math.min(1, p / 100));
  const index = (valid.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return valid[lower];
  const weight = index - lower;
  return valid[lower] * (1 - weight) + valid[upper] * weight;
};

export const stddev = (values) => {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (valid.length < 2) return 0;
  const avg = mean(valid);
  const variance = valid.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (valid.length - 1);
  return Math.sqrt(variance);
};

export function summarizeSeries(values) {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (valid.length === 0) {
    return { count: 0, min: null, p25: null, median: null, mean: null, p75: null, p90: null, max: null, stddev: null };
  }
  return {
    count: valid.length,
    min: Math.min(...valid),
    p25: percentile(valid, 25),
    median: median(valid),
    mean: mean(valid),
    p75: percentile(valid, 75),
    p90: percentile(valid, 90),
    max: Math.max(...valid),
    stddev: stddev(valid),
  };
}

export function linearFit(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const a = denX > 0 ? num / denX : 0;
  const b = my - a * mx;
  const r2 = denX > 0 && denY > 0 ? (num * num) / (denX * denY) : 0;
  return { a, b, r2 };
}

export function buildHistogram(values, binCount = 8) {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (valid.length === 0) return { labels: [], counts: [] };
  const minVal = Math.min(...valid);
  const maxVal = Math.max(...valid);
  const span = Math.max(1e-6, maxVal - minVal);
  const step = span / Math.max(1, binCount);
  const counts = new Array(binCount).fill(0);
  const labels = new Array(binCount).fill('').map((_, idx) => {
    const lo = minVal + idx * step;
    const hi = lo + step;
    return `${lo.toFixed(1)}–${hi.toFixed(1)}`;
  });
  for (const v of valid) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - minVal) / step)));
    counts[idx] += 1;
  }
  return { labels, counts };
}

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function editDistance(seqA, seqB) {
  const m = seqA.length;
  const n = seqB.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = seqA[i - 1] === seqB[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
  }
  return prev[n];
}

export function computeWerCer(reference, hypothesis) {
  const refNorm = normalizeText(reference);
  const hypNorm = normalizeText(hypothesis);
  if (!refNorm) return { wer: null, cer: null, similarity: null };
  const refWords = refNorm.split(' ').filter(Boolean);
  const hypWords = hypNorm ? hypNorm.split(' ').filter(Boolean) : [];
  const wordDist = editDistance(refWords, hypWords);
  const wer = refWords.length > 0 ? wordDist / refWords.length : null;
  const charDist = editDistance(Array.from(refNorm), Array.from(hypNorm));
  const cer = refNorm.length > 0 ? charDist / refNorm.length : null;
  const maxLen = Math.max(refNorm.length, hypNorm.length);
  const similarity = maxLen > 0 ? 1 - charDist / maxLen : 1;
  return { wer, cer, similarity };
}

export function formatSeconds(value) {
  if (!Number.isFinite(value)) return '-';
  if (value < 60) return `${value.toFixed(1)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds.toFixed(1)}s`;
}

export function getDurationBucket(seconds, bucketSize = 15) {
  const safeBucket = Math.max(2, Number(bucketSize) || 15);
  const start = Math.floor(Math.max(seconds, 0) / safeBucket) * safeBucket;
  const end = start + safeBucket;
  return {
    start,
    end,
    label: `${start}–${end}s`,
  };
}

export function parseDurationTargets(value) {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[\s,;]+/)
        .map((part) => Number(part.trim()))
        .filter((part) => Number.isFinite(part) && part > 0)
        .map((part) => Math.round(part * 1000) / 1000),
    ),
  ).sort((a, b) => a - b);
}

export function suggestDurationTargets(catalog, { minSec = 2, maxPoints = 16 } = {}) {
  const durations = (Array.isArray(catalog) ? catalog : [])
    .map((e) => e?.durationSec)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (durations.length === 0) return [3, 5, 8, 12, 20, 30, 45, 60];
  const maxSec = durations[durations.length - 1];
  const base = [2, 4, 6, 8, 10, 15, 20, 30, 45, 60, 90, 120].filter((v) => v >= minSec && v <= maxSec);
  const quantiles = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
  for (const q of quantiles) {
    const idx = Math.min(durations.length - 1, Math.floor((durations.length - 1) * q));
    base.push(Math.max(1, Math.round(durations[idx])));
  }
  return Array.from(new Set(base)).sort((a, b) => a - b).slice(0, maxPoints);
}

export function buildTargetSamplePlan(catalog, targets, samplesPerTarget = 1) {
  const requestedTargets = Array.isArray(targets) ? targets : [];
  const safeSamples = Math.max(1, Math.floor(Number(samplesPerTarget) || 1));
  const used = new Set();
  const plan = [];
  for (const targetSec of requestedTargets) {
    const ranked = (Array.isArray(catalog) ? catalog : [])
      .filter((entry) => Number.isFinite(entry?.durationSec))
      .map((entry) => ({
        ...entry,
        deltaSec: Math.abs(entry.durationSec - targetSec),
      }))
      .sort((a, b) => a.deltaSec - b.deltaSec);
    let picked = 0;
    for (const candidate of ranked) {
      const key = candidate.path || candidate.name;
      if (used.has(key)) continue;
      used.add(key);
      plan.push({ targetSec, ...candidate });
      picked += 1;
      if (picked >= safeSamples) break;
    }
  }
  return plan;
}

export function simulateOverlappedWindowInference({ totalAudioSec, windowSec, overlapSec, rawRtfx }) {
  const safeTotal = Math.max(0, Number(totalAudioSec) || 0);
  const safeWin = Number(windowSec);
  const safeOverlap = Math.max(0, Number(overlapSec) || 0);
  const safeRtfx = Number(rawRtfx);
  if (!Number.isFinite(safeWin) || safeWin <= 0 || !Number.isFinite(safeRtfx) || safeRtfx <= 0) return null;
  const advanceSec = safeWin - safeOverlap;
  if (advanceSec <= 0) return null;
  let coveredSec = 0;
  let processedSec = 0;
  let steps = 0;
  while (coveredSec < safeTotal) {
    processedSec += safeWin;
    coveredSec += advanceSec;
    steps += 1;
  }
  const totalTimeSec = processedSec / safeRtfx;
  const effectiveRtfx = totalTimeSec > 0 ? safeTotal / totalTimeSec : null;
  return {
    windowSec: roundValue(safeWin, 1),
    overlapSec: roundValue(safeOverlap, 1),
    steps,
    rawRtfx: roundValue(safeRtfx, 2),
    effectiveRtfx: roundValue(effectiveRtfx, 2),
    overheadPct: roundValue(safeTotal > 0 ? ((processedSec - safeTotal) / safeTotal) * 100 : 0, 1),
  };
}

export function summarizeBenchmarkBuckets(runs, bucketSize = 10, overlapSec = 4) {
  const grouped = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (run?.error || !Number.isFinite(run?.audioDurationSec)) continue;
    const bucket = getDurationBucket(run.audioDurationSec, bucketSize);
    const key = `${bucket.start}-${bucket.end}`;
    if (!grouped.has(key)) grouped.set(key, { ...bucket, runs: [] });
    grouped.get(key).runs.push(run);
  }
  return Array.from(grouped.values())
    .map((b) => {
      const rtfxs = b.runs.map((r) => r.rtfx ?? r.metrics?.rtfx).filter(Number.isFinite);
      const totals = b.runs.map((r) => r.metrics?.total_ms).filter(Number.isFinite);
      const encodes = b.runs.map((r) => r.metrics?.encode_ms).filter(Number.isFinite);
      const decodes = b.runs.map((r) => r.metrics?.decode_ms).filter(Number.isFinite);
      const preprocs = b.runs.map((r) => r.metrics?.preprocess_ms).filter(Number.isFinite);
      const avgDur = mean(b.runs.map((r) => r.audioDurationSec));
      const avgRtfx = mean(rtfxs);
      const sim = simulateOverlappedWindowInference({
        totalAudioSec: 3600,
        windowSec: avgDur,
        overlapSec,
        rawRtfx: avgRtfx,
      });
      return {
        label: b.label,
        start: b.start,
        end: b.end,
        count: b.runs.length,
        avgDurationSec: roundValue(avgDur, 2),
        avgRtfx: roundValue(avgRtfx, 2),
        medianRtfx: roundValue(median(rtfxs), 2),
        effectiveRtfx: sim?.effectiveRtfx ?? roundValue(avgRtfx, 2),
        overheadPct: sim?.overheadPct ?? 0,
        avgPreprocessMs: roundValue(mean(preprocs), 1),
        avgEncodeMs: roundValue(mean(encodes), 1),
        avgDecodeMs: roundValue(mean(decodes), 1),
        avgTotalMs: roundValue(mean(totals), 1),
      };
    })
    .sort((a, b) => a.start - b.start);
}

export function findSweetSpotBucket(buckets) {
  const valid = (Array.isArray(buckets) ? buckets : []).filter((b) => Number.isFinite(b.effectiveRtfx));
  if (valid.length === 0) return null;
  return [...valid].sort((a, b) => b.effectiveRtfx - a.effectiveRtfx)[0];
}

export function runsToMarkdownLeaderboard(snapshots) {
  const headers = [
    '| Snapshot / Config | Model | Backend | Quant | Runs | Mean Total (ms) | Encode (ms) | Decode (ms) | Median RTFx | Exact % | Sim % |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];
  const rows = (Array.isArray(snapshots) ? snapshots : []).map((s) => {
    const sum = s.summary || {};
    const cfg = s.settings || {};
    const fmt = (v, d = 1, sfx = '') => (Number.isFinite(v) ? `${v.toFixed(d)}${sfx}` : '-');
    return `| ${s.label || s.id} | \`${cfg.modelKey || '-'}\` | \`${cfg.backend || '-'}\` | \`e:${cfg.encoderQuant || '-'} d:${cfg.decoderQuant || '-'}\` | ${sum.okCount ?? sum.runCount ?? 0} | ${fmt(sum.totalMean)} | ${fmt(sum.encodeMean)} | ${fmt(sum.decodeMean)} | **${fmt(sum.rtfxMedian, 2, 'x')}** | ${fmt((sum.exactRate ?? 0) * 100, 1, '%')} | ${fmt((sum.similarityMean ?? 0) * 100, 1, '%')} |`;
  });
  return [...headers, ...rows].join('\n');
}

/* ============================================================================
   Zero-Dependency Interactive SVG Chart Primitives (Dark & Light Theme Ready)
   ============================================================================ */

export function ScatterPlotSvg({
  series = [],
  fitLine = null,
  xLabel = 'X',
  yLabel = 'Y',
  height = 220,
}) {
  const allPoints = series.flatMap((s) => s.data || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (allPoints.length === 0) {
    return <div className="chart-empty">No data points available for this chart yet.</div>;
  }
  const width = 520;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.min(0, ...allPoints.map((p) => p.y));
  const maxY = Math.max(...allPoints.map((p) => p.y));
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  const sx = (x) => padL + ((x - minX) / spanX) * plotW;
  const sy = (y) => padT + plotH - ((y - minY) / spanY) * plotH;

  return (
    <div className="svg-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yVal = minY + t * spanY;
          const yPos = sy(yVal);
          return (
            <g key={t}>
              <line x1={padL} y1={yPos} x2={width - padR} y2={yPos} className="svg-grid-line" />
              <text x={padL - 6} y={yPos + 3} textAnchor="end" className="svg-axis-tick">
                {yVal >= 100 ? Math.round(yVal) : yVal.toFixed(1)}
              </text>
            </g>
          );
        })}
        {[0, 0.5, 1].map((t) => {
          const xVal = minX + t * spanX;
          const xPos = sx(xVal);
          return (
            <text key={t} x={xPos} y={height - 14} textAnchor="middle" className="svg-axis-tick">
              {xVal.toFixed(1)}
            </text>
          );
        })}
        <text x={padL + plotW / 2} y={height - 2} textAnchor="middle" className="svg-axis-label">
          {xLabel}
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
          className="svg-axis-label"
        >
          {yLabel}
        </text>

        {fitLine && Number.isFinite(fitLine.a) && (
          <line
            x1={sx(minX)}
            y1={sy(fitLine.a * minX + fitLine.b)}
            x2={sx(maxX)}
            y2={sy(fitLine.a * maxX + fitLine.b)}
            stroke="#e0a94e"
            strokeWidth="2"
            strokeDasharray="5,4"
          />
        )}

        {series.map((s, sIdx) =>
          (s.data || []).map((pt, pIdx) => {
            if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
            return (
              <circle
                key={`${sIdx}-${pIdx}`}
                cx={sx(pt.x)}
                cy={sy(pt.y)}
                r={4.2}
                fill={s.color || '#4d8fd9'}
                fillOpacity="0.82"
              >
                <title>{`${s.label || 'Point'}: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) ${pt.label || ''}`}</title>
              </circle>
            );
          }),
        )}
      </svg>
      <div className="svg-legend">
        {series.map((s, idx) => (
          <span key={idx} className="svg-legend-item">
            <span className="svg-legend-dot" style={{ background: s.color || '#4d8fd9' }} />
            {s.label}
          </span>
        ))}
        {fitLine && (
          <span className="svg-legend-item">
            <span className="svg-legend-dot" style={{ background: '#e0a94e' }} />
            {`Fit: ${fitLine.a.toFixed(1)}x + ${fitLine.b.toFixed(0)} (R²=${fitLine.r2.toFixed(2)})`}
          </span>
        )}
      </div>
    </div>
  );
}

export function StackedBarChartSvg({
  labels = [],
  datasets = [],
  yLabel = 'ms',
  stacked = true,
  height = 220,
}) {
  if (!labels.length || !datasets.length) {
    return <div className="chart-empty">No bar data available yet.</div>;
  }
  const width = 520;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 38;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const totalsPerLabel = labels.map((_, i) => {
    if (stacked) {
      return datasets.reduce((sum, ds) => sum + (Number(ds.data?.[i]) || 0), 0);
    }
    return Math.max(0, ...datasets.map((ds) => Number(ds.data?.[i]) || 0));
  });
  const maxY = Math.max(1e-6, ...totalsPerLabel);
  const slotW = plotW / labels.length;
  const barW = Math.min(34, Math.max(8, slotW * 0.62));

  return (
    <div className="svg-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const val = t * maxY;
          const y = padT + plotH - t * plotH;
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} className="svg-grid-line" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="svg-axis-tick">
                {val >= 100 ? Math.round(val) : val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {labels.map((lbl, i) => {
          const centerX = padL + i * slotW + slotW / 2;
          let yCursor = padT + plotH;
          return (
            <g key={i}>
              {stacked
                ? datasets.map((ds, dIdx) => {
                    const val = Math.max(0, Number(ds.data?.[i]) || 0);
                    const h = (val / maxY) * plotH;
                    yCursor -= h;
                    return (
                      <rect
                        key={dIdx}
                        x={centerX - barW / 2}
                        y={yCursor}
                        width={barW}
                        height={Math.max(0, h)}
                        fill={ds.color || '#4d8fd9'}
                        rx={2}
                      >
                        <title>{`${lbl} — ${ds.label}: ${val.toFixed(1)} ${yLabel}`}</title>
                      </rect>
                    );
                  })
                : datasets.map((ds, dIdx) => {
                    const val = Math.max(0, Number(ds.data?.[i]) || 0);
                    const h = (val / maxY) * plotH;
                    const subW = barW / datasets.length;
                    const x = centerX - barW / 2 + dIdx * subW;
                    return (
                      <rect
                        key={dIdx}
                        x={x}
                        y={padT + plotH - h}
                        width={Math.max(2, subW - 1)}
                        height={Math.max(0, h)}
                        fill={ds.color || '#4d8fd9'}
                        rx={2}
                      >
                        <title>{`${lbl} — ${ds.label}: ${val.toFixed(1)} ${yLabel}`}</title>
                      </rect>
                    );
                  })}
              <text x={centerX} y={height - 12} textAnchor="middle" className="svg-axis-tick">
                {String(lbl).slice(0, 12)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="svg-legend">
        {datasets.map((ds, idx) => (
          <span key={idx} className="svg-legend-item">
            <span className="svg-legend-dot" style={{ background: ds.color || '#4d8fd9' }} />
            {ds.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StageShareDoughnutSvg({ stages = [] }) {
  const valid = stages.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = valid.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <div className="chart-empty">No stage timing breakdown available yet.</div>;
  }
  const cx = 105;
  const cy = 105;
  const r = 68;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="svg-doughnut-layout">
      <svg viewBox="0 0 210 210" className="svg-doughnut">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="26" />
        {valid.map((s, idx) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="26"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-currentOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{`${s.label}: ${s.value.toFixed(1)} ms (${(frac * 100).toFixed(1)}%)`}</title>
            </circle>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="svg-doughnut-total">
          {`${total.toFixed(0)}ms`}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="svg-axis-tick">
          mean sum
        </text>
      </svg>
      <div className="svg-doughnut-legend">
        {valid.map((s, idx) => (
          <div key={idx} className="svg-doughnut-row">
            <span className="svg-legend-dot" style={{ background: s.color }} />
            <span className="svg-doughnut-name">{s.label}</span>
            <strong className="svg-doughnut-val">{`${s.value.toFixed(1)} ms`}</strong>
            <span className="svg-doughnut-pct">{`${((s.value / total) * 100).toFixed(1)}%`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
