import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const THEMES = new Set(['light', 'dark']);
const validTheme = (value) => THEMES.has(value);
const DemoThemeContext = createContext(null);

/** Preserve this app's prior explicit preference when adopting the shared key. */
export function migrateDemoThemePreference(appId, storageKey = 'asrjs-theme') {
  const legacy = {
    showcase: ['asrjs.browser-demo.settings.v2', 'darkMode'],
    realtime: ['asrjs.streaming-demo.settings.v1', 'darkMode'],
    benchmark: ['asrjs.benchmark-demo.settings.v3', 'theme'],
    playground: ['asrjs-playground-theme', null],
  }[appId];
  if (!legacy || typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(storageKey) !== null) return;
    const raw = window.localStorage.getItem(legacy[0]);
    const value = legacy[1] ? JSON.parse(raw || '{}')[legacy[1]] : raw;
    const theme = typeof value === 'boolean' ? (value ? 'dark' : 'light') : value;
    if (validTheme(theme)) window.localStorage.setItem(storageKey, theme);
  } catch { /* Malformed legacy settings or blocked storage must not prevent startup. */ }
}

export function resolveInitialThemeState(storageKey = 'asrjs-theme', environment = globalThis) {
  const win = environment?.window ?? environment;
  if (!win) return { theme: 'light', explicit: false };
  let queryTheme;
  try {
    const params = new URLSearchParams(win.location?.search || '');
    queryTheme = params.get('__theme') || params.get('theme') || params.get('color');
  } catch { /* Malformed embedding environments fall through to storage or system. */ }
  if (validTheme(queryTheme)) return { theme: queryTheme, explicit: true };

  try {
    const stored = win.localStorage?.getItem(storageKey);
    if (validTheme(stored)) return { theme: stored, explicit: true };
  } catch { /* Storage can be denied independently of system appearance. */ }

  try {
    if (win.matchMedia?.('(prefers-color-scheme: dark)').matches) return { theme: 'dark', explicit: false };
  } catch { /* Use the light fallback when matchMedia is unavailable. */ }
  return { theme: 'light', explicit: false };
}

export function resolveInitialTheme(storageKey = 'asrjs-theme') {
  return resolveInitialThemeState(storageKey).theme;
}

function applyDocumentTheme(theme) {
  if (typeof document === 'undefined' || !validTheme(theme)) return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
}

/** Apply and persist a deliberate theme choice. */
export function applyTheme(theme, storageKey = 'asrjs-theme') {
  if (!validTheme(theme)) return;
  applyDocumentTheme(theme);
  try { window.localStorage.setItem(storageKey, theme); } catch { /* Private browsing or blocked storage. */ }
}

export function setupHfThemeListener(onThemeChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    const data = event?.data;
    if (!data || typeof data !== 'object') return;
    const theme = data.__theme ?? data.theme ?? data.color ?? data.colorMode ?? data.mode ?? data.payload?.theme;
    if (validTheme(theme)) onThemeChange(theme);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

function useLocalDemoTheme(storageKey, enabled = true) {
  const initialRef = useRef(null);
  if (initialRef.current === null) initialRef.current = resolveInitialThemeState(storageKey);
  const [theme, setThemeState] = useState(initialRef.current.theme);
  const themeRef = useRef(theme);
  const explicitPreference = useRef(initialRef.current.explicit);

  const setTheme = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(themeRef.current) : next;
    if (!validTheme(resolved)) return;
    themeRef.current = resolved;
    explicitPreference.current = true;
    setThemeState(resolved);
    try { window.localStorage.setItem(storageKey, resolved); } catch { /* Ignore unavailable storage. */ }
  }, [storageKey]);

  const setSystemTheme = useCallback((next) => {
    if (!validTheme(next)) return;
    themeRef.current = next;
    setThemeState(next);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    applyDocumentTheme(theme);
    return setupHfThemeListener(setTheme);
  }, [theme, setTheme, enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) return undefined;
    let media;
    try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return undefined; }
    const onChange = (event) => {
      if (!explicitPreference.current) setSystemTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [enabled, setSystemTheme]);

  const setDarkMode = useCallback((next) => setTheme((current) => {
    const currentDark = current === 'dark';
    const nextDark = typeof next === 'function' ? next(currentDark) : next;
    return nextDark ? 'dark' : 'light';
  }), [setTheme]);
  const toggleTheme = useCallback(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), [setTheme]);
  return useMemo(() => ({ theme, setTheme, darkMode: theme === 'dark', setDarkMode, toggleTheme }), [theme, setTheme, setDarkMode, toggleTheme]);
}

/** Shared persisted theme state, including embedding messages and live system preference. */
export function useDemoTheme({ storageKey = 'asrjs-theme' } = {}) {
  const inherited = useContext(DemoThemeContext);
  const local = useLocalDemoTheme(storageKey, inherited === null);
  return inherited ?? local;
}

export function DemoThemeProvider({ children, storageKey = 'asrjs-theme' }) {
  const value = useLocalDemoTheme(storageKey);
  return createElement(DemoThemeContext.Provider, { value }, children);
}
