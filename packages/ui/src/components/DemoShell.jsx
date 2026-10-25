import React from 'react';
import { useDemoTheme } from '../theme.js';

const APPS = [
  { id: 'showcase', label: 'Transcribe', role: 'SHOWCASE', defaultHref: '../showcase/' },
  { id: 'playground', label: 'Playground', role: 'PLAYGROUND', defaultHref: '../playground/' },
  { id: 'realtime', label: 'Live', role: 'REALTIME', defaultHref: '../realtime/' },
  { id: 'benchmark', label: 'Benchmark', role: 'BENCHMARK', defaultHref: '../benchmark/' },
];

/** Shared ASRJS workstation header, navigation, and theme control. */
export function DemoShell({
  children,
  app,
  appId,
  title,
  version = 'unknown',
  source = 'package',
  links,
  appLinks,
  storageKey = 'asrjs-theme',
  className = '',
  showNavigation = true,
}) {
  const { theme, toggleTheme } = useDemoTheme({ storageKey });
  const activeApp = appId || app || 'showcase';
  const providedLinks = appLinks ?? links;
  const navigationLinks = providedLinks ?? {};
  const useDefaultLinks = providedLinks === undefined;
  const hrefFor = (id, fallback) => navigationLinks[id] || (useDefaultLinks ? fallback : undefined);
  const current = APPS.find((entry) => entry.id === activeApp) ?? APPS[0];
  return (
    <div className={`asr-suite ${className}`.trim()} data-theme={theme}>
      <header className="asr-suite__header">
        {hrefFor('home', hrefFor('showcase', '../showcase/')) ? (
          <a className="asr-suite__brand" href={hrefFor('home', hrefFor('showcase', '../showcase/'))} aria-label="ASRJS Transcribe home">
            <span className="asr-suite__mark" aria-hidden="true">A</span>
            <span><strong>ASRJS</strong></span>
          </a>
        ) : (
          <span className="asr-suite__brand" aria-label="ASRJS Transcribe">
          <span className="asr-suite__mark" aria-hidden="true">A</span>
          <span><strong>ASRJS</strong></span>
          </span>
        )}
        <div className="asr-suite__heading">
          <h1>{title || current.label}</h1>
        </div>
        <div className="asr-suite__tools">
          <button className="asr-suite__theme" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Change appearance">
            <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span><span className="asr-suite__theme-label">Appearance</span>
          </button>
        </div>
      </header>
      {showNavigation ? (
        <nav className="asr-suite__nav" aria-label="ASRJS applications">
          {APPS.map((entry) => {
            const active = entry.id === current.id;
            const href = hrefFor(entry.id, entry.defaultHref);
            return href
              ? <a key={entry.id} href={href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}>{entry.label}</a>
              : <span key={entry.id} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}>{entry.label}</span>;
          })}
        </nav>
      ) : null}
      <main className="asr-suite__main">{children}</main>
      <footer className="asr-suite__footer"><span>ASRJS</span><span>Library {version} · {source}</span></footer>
    </div>
  );
}

export default DemoShell;
