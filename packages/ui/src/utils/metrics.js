/**
 * ASR Accuracy & Performance Metrics Utilities
 */

export function normalizeTranscript(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1).fill(0).map((_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[n];
}

export function computeWerCer(reference, hypothesis) {
  const normRef = normalizeTranscript(reference);
  const normHyp = normalizeTranscript(hypothesis);

  const refWords = normRef ? normRef.split(/\s+/) : [];
  const hypWords = normHyp ? normHyp.split(/\s+/) : [];

  const wordDist = computeLevenshtein(refWords, hypWords);
  const wer = refWords.length > 0 ? wordDist / refWords.length : 0;

  const refChars = Array.from(normRef);
  const hypChars = Array.from(normHyp);
  const charDist = computeLevenshtein(refChars, hypChars);
  const cer = refChars.length > 0 ? charDist / refChars.length : 0;

  return {
    wer,
    cer,
    refWords: refWords.length,
    hypWords: hypWords.length,
    normRef,
    normHyp,
  };
}

export function mean(values) {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function median(values) {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

export function percentile(values, p) {
  const valid = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const ratio = Math.max(0, Math.min(1, p / 100));
  const index = (valid.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return valid[lower];
  const weight = index - lower;
  return valid[lower] * (1 - weight) + valid[upper] * weight;
}
