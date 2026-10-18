import React from 'react';

export function WordPills({ words = [], onWordClick, audioRef, className = '' }) {
  if (!Array.isArray(words) || words.length === 0) {
    return null;
  }

  const handleWordClick = (word) => {
    const t0 = word.startTime ?? word.start_time ?? word.start;
    if (Number.isFinite(t0)) {
      if (audioRef && audioRef.current) {
        audioRef.current.currentTime = Math.max(0, Number(t0));
        audioRef.current.play().catch(() => {});
      }
    }
    if (typeof onWordClick === 'function') {
      onWordClick(word);
    }
  };

  return (
    <div className={`word-pills-container flex flex-wrap gap-1.5 overflow-y-auto ${className}`}>
      {words.map((word, index) => {
        const text = word.text || word.word || '';
        const t0 = word.startTime ?? word.start_time ?? word.start;
        const t1 = word.endTime ?? word.end_time ?? word.end;
        const conf = word.confidence ?? word.prob;

        return (
          <button
            key={`${index}-${text}-${t0 ?? ''}`}
            type="button"
            onClick={() => handleWordClick(word)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-800 dark:text-slate-100 hover:border-emerald-500 hover:text-emerald-600 transition"
            title={conf != null ? `Confidence: ${(conf * 100).toFixed(1)}%` : undefined}
          >
            <span className="font-medium">{text}</span>
            {Number.isFinite(t0) ? (
              <span className="font-mono text-[10px] text-slate-400">
                {Number(t0).toFixed(2)}s{Number.isFinite(t1) ? `–${Number(t1).toFixed(2)}s` : ''}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
