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
    <section className="dashboard-debug-shell streaming-debug-hud mt-4 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] text-slate-500">
          diagnostics · {snapshot.state} · {snapshot.sampleRate} Hz
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onReset} className="compact-button-secondary !py-1.5">Reset</button>
          <button type="button" onClick={onClose} className="compact-button-secondary !py-1.5">Hide</button>
        </div>
      </div>

      <div className="dashboard-debug-card">
        <div className="mb-2 font-mono text-[10px] text-slate-500">decisions</div>
        <div className="streaming-log-list space-y-2 overflow-y-auto pr-1">
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
