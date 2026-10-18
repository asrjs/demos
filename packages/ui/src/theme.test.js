import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, migrateDemoThemePreference, resolveInitialTheme, resolveInitialThemeState, setupHfThemeListener, useDemoTheme } from './theme.js';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

describe('shared demo theme', () => {
it('migrates each app preference once without overwriting the shared preference', () => {
  for (const [app, key, value] of [
    ['showcase', 'asrjs.browser-demo.settings.v2', '{"darkMode":true}'],
    ['realtime', 'asrjs.streaming-demo.settings.v1', '{"darkMode":true}'],
    ['benchmark', 'asrjs.benchmark-demo.settings.v3', '{"theme":"dark"}'],
    ['playground', 'asrjs-playground-theme', 'dark'],
  ]) {
    const values = new Map([[key, value]]);
    globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
    migrateDemoThemePreference(app);
    expect(values.get('asrjs-theme')).toBe('dark');
    values.set('asrjs-theme', 'light');
    migrateDemoThemePreference(app);
    expect(values.get('asrjs-theme')).toBe('light');
    expect(values.get(key)).toBe(value);
  }
});

it('ignores malformed legacy settings and inaccessible storage', () => {
  globalThis.window = { localStorage: { getItem: key => key === 'asrjs-theme' ? null : '{bad json', setItem: () => { throw new Error('must not write'); } } };
  expect(() => migrateDemoThemePreference('showcase')).not.toThrow();
  globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); } } };
  expect(() => migrateDemoThemePreference('realtime')).not.toThrow();
});

it('query theme overrides saved preference and accepts the Spaces theme parameter', () => {
  globalThis.window = {
    location: { search: '?__theme=dark' },
    localStorage: { getItem: () => 'light' },
    matchMedia: () => ({ matches: false }),
  };
  expect(resolveInitialTheme()).toBe('dark');
  globalThis.window = { location: { search: '?theme=light' }, localStorage: { getItem: () => 'dark' } };
  expect(resolveInitialTheme()).toBe('light');
});

it('invalid query and saved themes fall through to system preference', () => {
  globalThis.window = {
    location: { search: '?__theme=sepia' },
    localStorage: { getItem: () => 'auto' },
    matchMedia: () => ({ matches: true }),
  };
  expect(resolveInitialTheme()).toBe('dark');
});

it('storage errors do not block system theme detection', () => {
  globalThis.window = {
    location: { search: '' },
    localStorage: { getItem: () => { throw new Error('blocked'); } },
    matchMedia: () => ({ matches: true }),
  };
  expect(resolveInitialThemeState().theme).toBe('dark');
  expect(resolveInitialThemeState().explicit).toBe(false);
});

it('system changes remain live until an explicit functional setter persists a choice', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test/' });
  const { window: testWindow } = dom;
  const values = new Map();
  const mediaListeners = new Set();
  const writes = [];
  Object.defineProperty(testWindow, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); writes.push([key, value]); },
    },
  });
  testWindow.matchMedia = () => ({
    matches: true,
    addEventListener: (_type, listener) => mediaListeners.add(listener),
    removeEventListener: (_type, listener) => mediaListeners.delete(listener),
  });
  globalThis.window = testWindow;
  globalThis.document = testWindow.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let current;
  function Probe() { current = useDemoTheme(); return null; }
  const root = createRoot(testWindow.document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(Probe)); });
    expect(current.theme).toBe('dark');
    expect(writes).toEqual([]);
    await act(async () => { [...mediaListeners][0]({ matches: false }); });
    expect(current.theme).toBe('light');
    expect(writes).toEqual([]);
    await act(async () => { current.setDarkMode((wasDark) => !wasDark); });
    expect(current.theme).toBe('dark');
    expect(writes).toEqual([['asrjs-theme', 'dark']]);
    await act(async () => { [...mediaListeners][0]({ matches: false }); });
    expect(current.theme).toBe('dark');
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

it('parent theme listener validates messages and removes its listener', () => {
  const handlers = new Set();
  globalThis.window = {
    addEventListener: (type, handler) => { if (type === 'message') handlers.add(handler); },
    removeEventListener: (type, handler) => { if (type === 'message') handlers.delete(handler); },
  };
  const received = [];
  const cleanup = setupHfThemeListener((theme) => received.push(theme));
  for (const handler of handlers) {
    handler({ data: { __theme: 'dark' } });
    handler({ data: { theme: 'light' } });
    handler({ data: { color: 'dark' } });
    handler({ data: { color: 'sepia' } });
    handler({ data: 'dark' });
  }
  expect(received).toEqual(['dark', 'light', 'dark']);
  cleanup();
  expect(handlers.size).toBe(0);
});

it('applyTheme rejects invalid values and safely persists valid preferences', () => {
  const classes = new Set();
  const attributes = new Map();
  const values = new Map();
  globalThis.window = { localStorage: { setItem: (key, value) => values.set(key, value) } };
  globalThis.document = {
    documentElement: {
      classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute: (name, value) => attributes.set(name, value),
    },
  };
  applyTheme('sepia');
  expect(attributes.has('data-theme')).toBe(false);
  applyTheme('dark', 'suite-theme');
  expect(classes.has('dark')).toBe(true);
  expect(attributes.get('data-theme')).toBe('dark');
  expect(values.get('suite-theme')).toBe('dark');
});
});
