import React from 'react';
import { Widget } from '../../ui/PanelPrimitives.jsx';
import {
  formatFixed,
  formatPercentValue,
} from '../../streaming/layout/formatters.js';

export function HistoryPanel({ app }) {
  const {
    transcriptPanel: { transcriptions, clearTranscriptions },
  } = app;

  if (transcriptions.length < 1) {
    return null;
  }

  return (
    <Widget
      title="History"
      actions={<button type="button" onClick={clearTranscriptions} className="compact-button-secondary !py-2">Clear All</button>}
    >
      <div className="space-y-3">
        {transcriptions.map((trans) => (
          <div key={trans.id} className="demo-soft-box">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[12px] font-semibold text-slate-900">{trans.filename}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {trans.language ? app.getBuiltInModelLanguageName(trans.language) : 'Unknown language'}
                  {trans.targetLanguage && ` -> ${app.getBuiltInModelLanguageName(trans.targetLanguage)}`}
                </div>
              </div>
              <div className="text-[10px] text-slate-400">{trans.timestamp}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
              <span>{trans.duration.toFixed(1)}s</span>
              <span>{trans.wordCount} words</span>
              {trans.confidence ? <span>{formatPercentValue(trans.confidence)}</span> : null}
              {trans.metrics ? <span>RTF {formatFixed(trans.metrics.rtf)}x</span> : null}
            </div>
            {trans.clipUrl ? (
              <div className="mt-3 space-y-2">
                <audio
                  controls
                  preload="none"
                  src={trans.clipUrl}
                  className="w-full"
                />
                <div className="flex justify-end">
                  <a
                    href={trans.clipUrl}
                    download={trans.clipFilename ?? `${trans.filename || 'clip'}.wav`}
                    className="compact-button-secondary !px-3 !py-2 no-underline"
                    title={trans.clipFilename ? `Download ${trans.clipFilename}` : 'Download clip'}
                    aria-label={trans.clipFilename ? `Download ${trans.clipFilename}` : 'Download clip'}
                  >
                    <span className="material-icons-outlined text-[16px]">download</span>
                  </a>
                </div>
              </div>
            ) : null}
            <div className="mt-3 rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-[12px] leading-6 text-slate-800">
              {trans.text}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}
