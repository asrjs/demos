/**
 * @asrjs/demo-ui Theme & HF Spaces parent sync
 */

export function resolveInitialTheme(storageKey = 'asrjs-theme') {
  if (typeof window === 'undefined') return 'light';
  try {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get('__theme');
    if (themeParam === 'dark' || themeParam === 'light') {
      return themeParam;
    }
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // fallback
  }
  return 'light';
}

export function applyTheme(theme, storageKey = 'asrjs-theme') {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // ignore
  }
}

export function setupHfThemeListener(onThemeChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    try {
      if (event.data && typeof event.data === 'object') {
        if (event.data.__theme === 'dark' || event.data.__theme === 'light') {
          onThemeChange(event.data.__theme);
        } else if (event.data.theme === 'dark' || event.data.theme === 'light') {
          onThemeChange(event.data.theme);
        }
      }
    } catch {
      // ignore
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
