/**
 * Subtitle and JSON transcript export utilities
 */

export function formatSubtitleTime(seconds, isVtt = false) {
  const totalMs = Math.max(0, Math.round((Number.isFinite(Number(seconds)) ? Number(seconds) : 0) * 1000));
  const hrs = Math.floor(totalMs / 3_600_000);
  const mins = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const sep = isVtt ? '.' : ',';
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
}

export function buildSubtitleExport(transcriptions, isVtt = false) {
  const items = Array.isArray(transcriptions) ? [...transcriptions] : [];
  let cursorSec = 0;
  const blocks = items.flatMap((item) => {
    const words = Array.isArray(item.words) ? item.words : [];
    const wordStart = words[0]?.startTime ?? words[0]?.start_time;
    const wordEnd = words[words.length - 1]?.endTime ?? words[words.length - 1]?.end_time;
    const explicitOffset = Number.isFinite(item.startTimeSeconds) ? item.startTimeSeconds : null;
    const duration = Number.isFinite(item.audioDuration) && item.audioDuration > 0
      ? item.audioDuration
      : Number.isFinite(item.duration) && item.duration > 0
      ? item.duration
      : null;
    const localStart = Number.isFinite(wordStart) ? wordStart : null;
    const localEnd = Number.isFinite(wordEnd) ? wordEnd : null;
    const captureStart = explicitOffset ?? cursorSec;
    const startSec = captureStart + (localStart ?? 0);
    const endSec = localEnd !== null
      ? captureStart + localEnd
      : duration !== null
        ? captureStart + duration
        : null;
    if (endSec === null || endSec < startSec || !item.text) return [];
    cursorSec = duration === null ? endSec : captureStart + duration;
    return [`${formatSubtitleTime(startSec, isVtt)} --> ${formatSubtitleTime(endSec, isVtt)}\n${item.text}`];
  });
  const numberedBlocks = blocks.map((block, idx) => `${idx + 1}\n${block}`);
  return isVtt ? `WEBVTT\n\n${numberedBlocks.join('\n\n')}\n` : `${numberedBlocks.join('\n\n')}\n`;
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
