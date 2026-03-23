export function formatFixed(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

export function formatMilliseconds(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} ms` : '--';
}

export function formatDbfsValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : '--';
}

export function formatPercentValue(value, digits = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '--';
}

export function formatSecondsValue(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} s` : '--';
}

export function formatSampleRate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value).toLocaleString()} Hz` : '--';
}
