import React from 'react';

export function ScatterPlotSvg({
  points = [],
  xKey = 'x',
  yKey = 'y',
  labelKey = 'label',
  groupKey = 'group',
  xLabel = 'X Axis',
  yLabel = 'Y Axis',
  width = 620,
  height = 260,
  fitLine = null,
  colorMap = {},
}) {
  const valid = points.filter((p) => Number.isFinite(p[xKey]) && Number.isFinite(p[yKey]));
  if (valid.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">No data points available for chart.</div>;
  }

  const padding = { top: 20, right: 30, bottom: 42, left: 54 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const minX = Math.min(...valid.map((p) => p[xKey]));
  const maxX = Math.max(...valid.map((p) => p[xKey]));
  const minY = Math.min(0, Math.min(...valid.map((p) => p[yKey])));
  const maxY = Math.max(...valid.map((p) => p[yKey]));

  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);

  const scaleX = (val) => padding.left + ((val - minX) / spanX) * plotW;
  const scaleY = (val) => padding.top + plotH - ((val - minY) / spanY) * plotH;

  const defaultPalette = ['#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
  const getPointColor = (p, idx) => {
    if (groupKey && p[groupKey] && colorMap[p[groupKey]]) return colorMap[p[groupKey]];
    return defaultPalette[idx % defaultPalette.length];
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="text-slate-600 dark:text-slate-400 select-none">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + plotH * (1 - ratio);
          const val = minY + spanY * ratio;
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={padding.left + plotW} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" />
              <text x={padding.left - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
                {val >= 100 ? val.toFixed(0) : val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* X Axis Ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const x = padding.left + plotW * ratio;
          const val = minX + spanX * ratio;
          return (
            <g key={ratio}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotH} stroke="currentColor" strokeOpacity={0.08} />
              <text x={x} y={padding.top + plotH + 16} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.7}>
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Optional Linear Fit Line */}
        {fitLine && Number.isFinite(fitLine.a) && Number.isFinite(fitLine.b) && (
          <line
            x1={scaleX(minX)}
            y1={scaleY(fitLine.a * minX + fitLine.b)}
            x2={scaleX(maxX)}
            y2={scaleY(fitLine.a * maxX + fitLine.b)}
            stroke="#ef4444"
            strokeWidth="1.75"
            strokeDasharray="4 3"
            opacity="0.8"
          />
        )}

        {/* Scatter Points */}
        {valid.map((p, idx) => {
          const cx = scaleX(p[xKey]);
          const cy = scaleY(p[yKey]);
          const color = getPointColor(p, idx);
          return (
            <g key={idx} className="cursor-pointer group">
              <circle cx={cx} cy={cy} r="4.5" fill={color} fillOpacity="0.85" stroke="#ffffff" strokeWidth="1" className="transition-transform group-hover:scale-125" />
              {labelKey && p[labelKey] && (
                <title>{`${p[labelKey]}: (${p[xKey]}, ${p[yKey]})`}</title>
              )}
            </g>
          );
        })}

        {/* Axis Labels */}
        <text x={padding.left + plotW / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="currentColor" fontWeight="500">
          {xLabel}
        </text>
        <text
          x={14}
          y={padding.top + plotH / 2}
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
          fontWeight="500"
          transform={`rotate(-90 14 ${padding.top + plotH / 2})`}
        >
          {yLabel}
        </text>
      </svg>
    </div>
  );
}

export function StackedBarChartSvg({
  series = [],
  stages = ['prep', 'encode', 'decode'],
  colors = { prep: '#38bdf8', encode: '#10b981', decode: '#f59e0b' },
  yUnit = 'ms',
  width = 620,
  height = 240,
}) {
  if (series.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-400">No series data available.</div>;
  }

  const padding = { top: 20, right: 20, bottom: 45, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxVal = Math.max(
    1,
    ...series.map((s) => stages.reduce((sum, st) => sum + (Number(s[st]) || 0), 0))
  );

  const barW = Math.max(10, Math.min(36, (plotW / series.length) * 0.7));
  const step = plotW / series.length;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="text-slate-600 dark:text-slate-400 select-none">
        {/* Y Axis Grid */}
        {[0, 0.5, 1].map((r) => {
          const y = padding.top + plotH * (1 - r);
          const val = maxVal * r;
          return (
            <g key={r}>
              <line x1={padding.left} y1={y} x2={padding.left + plotW} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" />
              <text x={padding.left - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.7}>
                {val.toFixed(0)}{yUnit}
              </text>
            </g>
          );
        })}

        {/* Stacked Bars */}
        {series.map((item, idx) => {
          const x = padding.left + idx * step + (step - barW) / 2;
          let currentY = padding.top + plotH;

          return (
            <g key={idx}>
              {stages.map((st) => {
                const val = Number(item[st]) || 0;
                const h = (val / maxVal) * plotH;
                currentY -= h;
                return (
                  <rect
                    key={st}
                    x={x}
                    y={currentY}
                    width={barW}
                    height={Math.max(0, h)}
                    fill={colors[st] || '#94a3b8'}
                    rx={1}
                  >
                    <title>{`${item.label || `#${idx + 1}`} ${st}: ${val.toFixed(1)}ms`}</title>
                  </rect>
                );
              })}
              <text x={x + barW / 2} y={padding.top + plotH + 16} textAnchor="middle" fontSize="10" fill="currentColor">
                {item.label || `#${idx + 1}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function StageShareDoughnutSvg({
  shares = [
    { label: 'Encode', value: 75, color: '#10b981' },
    { label: 'Decode', value: 20, color: '#f59e0b' },
    { label: 'Prep', value: 5, color: '#38bdf8' },
  ],
  size = 180,
  thickness = 24,
}) {
  const total = shares.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  if (total <= 0) return null;

  const radius = (size - thickness) / 2;
  const center = size / 2;
  let accumulatedAngle = -Math.PI / 2;

  const paths = shares.map((s) => {
    const fraction = s.value / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angle;
    accumulatedAngle = endAngle;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

    return {
      d,
      color: s.color,
      label: s.label,
      percent: Math.round(fraction * 100),
    };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="select-none">
        {paths.map((p, idx) => (
          <path
            key={idx}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={thickness}
            strokeLinecap="round"
          >
            <title>{`${p.label}: ${p.percent}%`}</title>
          </path>
        ))}
      </svg>
      <div className="space-y-1.5 text-xs">
        {shares.map((s, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-slate-700 dark:text-slate-300">{s.label}:</span>
            <span className="text-slate-500 font-mono">{((s.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
