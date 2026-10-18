/**
 * Subtitle and JSON transcript export utilities
 */

export function formatSubtitleTime(seconds, isVtt = false) {
  const s = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const sep = isVtt ? '.' : ',';
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
}

export function buildSubtitleExport(transcriptions, isVtt = false) {
  const items = Array.isArray(transcriptions) ? [...transcriptions] : [];
  let cursorSec = 0;
  const blocks = items.map((item, idx) => {
    const words = Array.isArray(item.words) ? item.words : [];
    const startSec = Number.isFinite(words[0]?.startTime ?? words[0]?.start_time)
      ? (words[0].startTime ?? words[0].start_time)
      : cursorSec;
    const durSec = Number.isFinite(item.duration) && item.duration > 0
      ? item.duration
      : Number.isFinite(item.audioDuration) && item.audioDuration > 0
      ? item.audioDuration
      : 2.5;
    const endSec = Number.isFinite(words[words.length - 1]?.endTime ?? words[words.length - 1]?.end_time)
      ? Math.max(startSec + 0.2, words[words.length - 1].endTime ?? words[words.length - 1].end_time)
      : startSec + durSec;
    cursorSec = endSec + 0.15;
    return `${idx + 1}\n${formatSubtitleTime(startSec, isVtt)} --> ${formatSubtitleTime(endSec, isVtt)}\n${item.text || ''}`;
  });
  return isVtt ? `WEBVTT\n\n${blocks.join('\n\n')}\n` : `${blocks.join('\n\n')}\n`;
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
