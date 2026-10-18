export function parseThemeValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dark') return true;
  if (normalized === 'light') return false;
  return null;
}

export function getHfThemeFromQuery() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return parseThemeValue(params.get('__theme') || params.get('theme') || params.get('color'));
}

export function getInitialDarkMode(settings) {
  const hfTheme = getHfThemeFromQuery();
  if (hfTheme !== null) return hfTheme;
  if (typeof settings.darkMode === 'boolean') return settings.darkMode;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

export function getThemeFromMessage(data) {
  if (!data) return null;
  if (typeof data === 'string') return parseThemeValue(data);
  if (typeof data !== 'object') return null;

  return (
    parseThemeValue(data.theme) ??
    parseThemeValue(data.colorMode) ??
    parseThemeValue(data.mode) ??
    parseThemeValue(data?.payload?.theme)
  );
}
