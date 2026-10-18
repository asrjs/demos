import React from 'react';
import { MonoStat, Widget } from '../../ui/PanelPrimitives.jsx';
import { WordPills, buildSubtitleExport, downloadTextFile } from '@asrjs/demo-ui';
import { formatFixed, formatMilliseconds, formatPercentValue } from '../../streaming/layout/formatters.js';

export function TranscriptPanel({ app }) {
  const {
    streamingPanel: { latestMetrics, isTranscribing },
    transcriptPanel: { text, copyToClipboard, transcriptions },
  } = app;
  const latestRecord = transcriptions?.[0];
  const latestWords = Array.isArray(latestRecord?.words) ? latestRecord.words : [];

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
                onClick={() => downloadTextFile(buildSubtitleExport([...transcriptions].reverse(), false), 'asrjs-stream.srt')}
                className="compact-button-secondary compact-button--toolbar"
                title="Export SRT subtitles"
              >
                SRT
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile(buildSubtitleExport([...transcriptions].reverse(), true), 'asrjs-stream.vtt')}
                className="compact-button-secondary compact-button--toolbar"
                title="Export WebVTT subtitles"
              >
                VTT
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile(JSON.stringify(transcriptions, null, 2), 'asrjs-stream.json', 'application/json')}
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
      <WordPills words={latestWords} offsetSeconds={latestRecord?.startTimeSeconds ?? 0} className="mt-3 max-h-36" />
      <div className="mono-grid mt-3">
        <MonoStat
          label="Total"
          value={formatMilliseconds(latestMetrics?.totalMs ?? latestMetrics?.total_ms)}
          note={latestMetrics ? `encode ${formatMilliseconds(latestMetrics.encodeMs ?? latestMetrics.encode_ms)}` : 'Awaiting result'}
        />
        <MonoStat
          label="Decode"
          value={formatMilliseconds(latestMetrics?.decodeMs ?? latestMetrics?.decode_ms)}
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
