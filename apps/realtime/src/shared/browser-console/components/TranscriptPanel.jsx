import React from 'react';
import { MonoStat, Widget } from '../../ui/PanelPrimitives.jsx';
import {
  formatFixed,
  formatMilliseconds,
  formatPercentValue,
} from '../../streaming/layout/formatters.js';

function formatSubtitleTime(sec, vtt = false) {
  const s = Math.max(0, Number(sec) || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const sep = vtt ? '.' : ',';
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
}

function buildSubtitleExport(transcriptions, vtt = false) {
  const ordered = [...(transcriptions || [])].reverse();
  let cursorSec = 0;
  const blocks = ordered.map((item, idx) => {
    const words = Array.isArray(item.words) ? item.words : [];
    const startSec = Number.isFinite(words[0]?.start_time ?? words[0]?.startTime)
      ? (words[0].start_time ?? words[0].startTime)
      : cursorSec;
    const durSec = Number.isFinite(item.audioDuration) && item.audioDuration > 0 ? item.audioDuration : 2.5;
    const endSec = Number.isFinite(words[words.length - 1]?.end_time ?? words[words.length - 1]?.endTime)
      ? Math.max(startSec + 0.2, words[words.length - 1].end_time ?? words[words.length - 1].endTime)
      : startSec + durSec;
    cursorSec = endSec + 0.15;
    return `${idx + 1}\n${formatSubtitleTime(startSec, vtt)} --> ${formatSubtitleTime(endSec, vtt)}\n${item.text || ''}`;
  });
  return vtt ? `WEBVTT\n\n${blocks.join('\n\n')}\n` : `${blocks.join('\n\n')}\n`;
}

function downloadText(content, filename, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TranscriptPanel({ app }) {
  const {
    streamingPanel: { latestMetrics, isTranscribing },
    transcriptPanel: { text, copyToClipboard, transcriptions },
  } = app;
  const latestWords = Array.isArray(transcriptions?.[0]?.words) ? transcriptions[0].words : [];

  return (
    <Widget
      title="Transcript & Word Alignment"
      actions={text ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => copyToClipboard(text)} className="compact-button-secondary compact-button--toolbar">
            Copy
          </button>
          {transcriptions?.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => downloadText(buildSubtitleExport(transcriptions, false), 'asrjs-stream.srt')}
                className="compact-button-secondary compact-button--toolbar"
                title="Export SRT subtitles"
              >
                SRT
              </button>
              <button
                type="button"
                onClick={() => downloadText(buildSubtitleExport(transcriptions, true), 'asrjs-stream.vtt')}
                className="compact-button-secondary compact-button--toolbar"
                title="Export WebVTT subtitles"
              >
                VTT
              </button>
              <button
                type="button"
                onClick={() => downloadText(JSON.stringify(transcriptions, null, 2), 'asrjs-stream.json', 'application/json')}
                className="compact-button-secondary compact-button--toolbar"
                title="Export JSON transcript history"
              >
                JSON
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    >
      <div className="transcript-body">
        {text || 'No text yet.'}
      </div>
      {latestWords.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
          {latestWords.map((w, idx) => {
            const wordText = w.text || w.word || '';
            const t0 = w.start_time ?? w.startTime;
            const t1 = w.end_time ?? w.endTime;
            return (
              <span
                key={`${idx}-${wordText}`}
                className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]"
                style={{ borderColor: 'var(--demo-border)', background: 'var(--demo-panel-soft)' }}
              >
                <span className="font-medium">{wordText}</span>
                {Number.isFinite(t0) ? (
                  <span className="font-mono text-[10px] opacity-70">
                    {Number(t0).toFixed(2)}s{Number.isFinite(t1) ? `–${Number(t1).toFixed(2)}s` : ''}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="mono-grid mt-3">
        <MonoStat
          label="Total"
          value={formatMilliseconds(latestMetrics?.total_ms)}
          note={latestMetrics ? `encode ${formatMilliseconds(latestMetrics.encode_ms)}` : 'Awaiting result'}
        />
        <MonoStat
          label="Decode"
          value={formatMilliseconds(latestMetrics?.decode_ms)}
          note={latestMetrics ? `rtf ${formatFixed(latestMetrics.rtf)}x` : 'Awaiting result'}
        />
        <MonoStat
          label="Confidence"
          value={transcriptions[0]?.confidence ? formatPercentValue(transcriptions[0].confidence) : '--'}
          note={transcriptions[0]?.wordCount ? `${transcriptions[0].wordCount} words` : 'No finished utterance'}
        />
        <MonoStat
          label="Queue"
          value={isTranscribing ? 'busy' : 'clear'}
          note={isTranscribing ? 'Decoder is processing audio' : 'Ready'}
        />
      </div>
    </Widget>
  );
}
