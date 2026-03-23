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
      actions={(
        <button type="button" onClick={clearTranscriptions} className="compact-button-secondary compact-button--toolbar">
          Clear All
        </button>
      )}
    >
      <div className="app-stack--sm">
        {transcriptions.map((trans) => (
          <div key={trans.id} className="demo-soft-box">
            <div className="history-card-head">
              <div>
                <div className="type-body-lg font-semibold">{trans.filename}</div>
                <div className="mt-1 type-caption">
                  {trans.language ? app.getBuiltInModelLanguageName(trans.language) : 'Unknown language'}
                  {trans.targetLanguage && ` -> ${app.getBuiltInModelLanguageName(trans.targetLanguage)}`}
                </div>
              </div>
              <div className="type-micro shrink-0">{trans.timestamp}</div>
            </div>
            <div className="flex-row flex-row--wrap gap-2 type-micro mt-2">
              <span>{trans.duration.toFixed(1)}s</span>
              <span>{trans.wordCount} words</span>
              {trans.confidence ? <span>{formatPercentValue(trans.confidence)}</span> : null}
              {trans.metrics ? <span>RTF {formatFixed(trans.metrics.rtf)}x</span> : null}
            </div>
            {trans.clipUrl ? (
              <div className="app-stack--xs mt-3">
                <audio
                  controls
                  preload="none"
                  src={trans.clipUrl}
                  className="w-full"
                />
                <div className="flex-row flex-row--end">
                  <a
                    href={trans.clipUrl}
                    download={trans.clipFilename ?? `${trans.filename || 'clip'}.wav`}
                    className="compact-button-secondary compact-button--icon compact-button--link"
                    title={trans.clipFilename ? `Download ${trans.clipFilename}` : 'Download clip'}
                    aria-label={trans.clipFilename ? `Download ${trans.clipFilename}` : 'Download clip'}
                  >
                    <span className="material-icons-outlined icon-sm">download</span>
                  </a>
                </div>
              </div>
            ) : null}
            <div className="history-text-block">
              {trans.text}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}
