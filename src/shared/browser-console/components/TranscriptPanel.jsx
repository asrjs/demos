import React from 'react';
import { MonoStat, Widget } from '../../ui/PanelPrimitives.jsx';
import {
  formatFixed,
  formatMilliseconds,
  formatPercentValue,
} from '../../streaming/layout/formatters.js';

export function TranscriptPanel({ app }) {
  const {
    streamingPanel: { latestMetrics, isTranscribing },
    transcriptPanel: { text, copyToClipboard, transcriptions },
  } = app;

  return (
    <Widget
      title="Transcript"
      actions={text ? <button type="button" onClick={() => copyToClipboard(text)} className="compact-button-secondary !py-2">Copy</button> : null}
    >
      <div className="demo-soft-box min-h-[220px] text-[15px] leading-8 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        {text || 'No text yet.'}
      </div>
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
