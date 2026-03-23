export function StreamingDebugHud({
  snapshot,
  isVisible,
  onClose,
  onReset,
}) {
  if (!isVisible || !snapshot) {
    return null;
  }

  return (
    <section className="dashboard-debug-shell streaming-debug-hud">
      <div className="flex-row flex-row--between gap-3 mb-3">
        <div className="type-mono-micro">
          diagnostics · {snapshot.state} · {snapshot.sampleRate} Hz
        </div>
        <div className="flex-row gap-2">
          <button type="button" onClick={onReset} className="compact-button-secondary compact-button--sm">Reset</button>
          <button type="button" onClick={onClose} className="compact-button-secondary compact-button--sm">Hide</button>
        </div>
      </div>

      <div className="dashboard-debug-card">
        <div className="mb-2 type-mono-micro">decisions</div>
        <div className="streaming-log-list log-stack">
          {(snapshot.recentDecisions?.length
            ? [...snapshot.recentDecisions].reverse()
            : [{ id: 'empty', at: '--:--:--', message: 'No detector decisions yet', meta: {} }]
          ).map((entry) => (
            <div key={entry.id} className="mono-row">
              <span className="mono-value">{entry.message}</span>
              <span className="mono-note">{entry.at}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
