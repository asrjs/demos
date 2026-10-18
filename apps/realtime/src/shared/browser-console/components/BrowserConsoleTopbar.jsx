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
  activeWorkspaceTab = 'vad-lab',
  setActiveWorkspaceTab,
}) {
  const statusLineTitle = `${status} · ${backend} · ${micStatus}`;

  return (
    <header className="demo-topbar">
      <div className="topbar-brand-row">
        <div className="topbar-brand-leading">
          <div className="topbar-brand-block">
            <div className="type-overline">asrjs</div>
            <div className="type-display mt-1">Realtime &amp; Neural VAD Workstation</div>
          </div>
          <div className="demo-tabs">
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab?.('vad-lab')}
              className={`demo-tab ${activeWorkspaceTab === 'vad-lab' ? 'demo-tab-active' : 'demo-tab-idle'}`}
            >
              Realtime VAD Lab
            </button>
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab?.('transcript-focus')}
              className={`demo-tab ${activeWorkspaceTab === 'transcript-focus' ? 'demo-tab-active' : 'demo-tab-idle'}`}
            >
              Transcript &amp; Subtitles
            </button>
          </div>
        </div>
        <button
          type="button"
          className="demo-gear"
          onClick={() => setModelSidebarCollapsed((value) => !value)}
          aria-expanded={!modelSidebarCollapsed}
          title={modelSidebarCollapsed ? 'Show model setup sidebar' : 'Hide model setup sidebar'}
        >
          <span className="material-icons-outlined icon-md">tune</span>
        </button>
      </div>

      <div className="topbar-status-row">
        <div
          className="topbar-status-primary"
          title={statusLineTitle}
          role="status"
        >
          <span
            className="topbar-mic-dot"
            data-live={isMicActive ? 'true' : 'false'}
            title={isMicActive ? 'Microphone live' : 'Microphone idle'}
            aria-hidden
          />
          <div className="topbar-status-elide">
            <span
              className={
                isModelReady ? 'topbar-line-tone topbar-line-tone--ok' : 'topbar-line-tone topbar-line-tone--warn'
              }
            >
              {status}
            </span>
            <span className="topbar-line-muted"> · </span>
            <span className="topbar-line-muted">{backend}</span>
            <span className="topbar-line-muted"> · </span>
            <span>{micStatus}</span>
          </div>
        </div>
        <div className="topbar-status-actions">
          {loadedFromCache && modelSource === modelSourceOptions.HUGGINGFACE && isModelReady ? (
            <span className="topbar-meta topbar-meta--cache" title="Model loaded from cache">
              cache
            </span>
          ) : null}
          <span className="topbar-meta">@asrjs {asrjsVersion}</span>
          <span className="topbar-meta">{asrjsSource}</span>
          <button
            type="button"
            className="demo-gear"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
            title={darkMode ? 'Use light theme' : 'Use dark theme'}
          >
            <span className="material-icons-outlined icon-md">
              {darkMode ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
