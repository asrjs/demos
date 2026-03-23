import React from 'react';

export function BrowserConsoleTopbar({
  asrjsVersion,
  asrjsSource,
  darkMode,
  setDarkMode,
  status,
  backend,
  micStatus,
  isMicActive,
  modelSource,
  loadedFromCache,
  isModelReady,
  modelSourceOptions,
  modelSidebarCollapsed,
  setModelSidebarCollapsed,
}) {
  return (
    <header className="demo-topbar">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">asrjs</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-slate-950">Realtime Workstation</div>
        </div>
        <div className="demo-tabs">
          <span className="demo-tab demo-tab-idle">Streaming</span>
          <span className="demo-tab demo-tab-active">Realtime Lab</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-[11px] text-slate-700">
        <span className={`status-chip ${isMicActive ? 'status-live' : 'status-muted'}`}>
          {isMicActive ? 'mic live' : 'mic idle'}
        </span>
        <span className={`status-chip ${isModelReady ? 'status-ready' : 'status-warn'}`}>
          {status}
        </span>
        <span className="status-chip status-muted">{backend}</span>
        <span className="status-chip status-muted">{micStatus}</span>
        <button
          type="button"
          className="compact-button-secondary !px-3 !py-2"
          onClick={() => setModelSidebarCollapsed((value) => !value)}
          aria-expanded={!modelSidebarCollapsed}
          title={modelSidebarCollapsed ? 'Show model sidebar' : 'Hide model sidebar'}
        >
          {modelSidebarCollapsed ? 'Show Setup' : 'Hide Setup'}
        </button>
        {loadedFromCache && modelSource === modelSourceOptions.HUGGINGFACE && isModelReady ? (
          <span className="status-chip status-ready">cache</span>
        ) : null}
        <span className="status-chip status-muted">@asrjs {asrjsVersion}</span>
        <span className="status-chip status-muted">{asrjsSource}</span>
        <button
          type="button"
          className="demo-gear"
          onClick={() => setDarkMode(!darkMode)}
          aria-label="Toggle theme"
          title={darkMode ? 'Use light theme' : 'Use dark theme'}
        >
          <span className="material-icons-outlined text-[18px]">
            {darkMode ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>
    </header>
  );
}
