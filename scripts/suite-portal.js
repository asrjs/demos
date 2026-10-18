const KEY = 'asrjs-theme';
const root = document.documentElement;
const toggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = normalized;
  root.classList.toggle('dark', normalized === 'dark');
  toggle?.setAttribute('aria-label', `Switch to ${normalized === 'dark' ? 'light' : 'dark'} theme`);
  const label = toggle?.querySelector('.theme-label');
  if (label) label.textContent = normalized === 'dark' ? 'Light mode' : 'Dark mode';
}

let saved = null;
try { saved = localStorage.getItem(KEY); } catch { /* storage can be disabled */ }
const queryTheme = new URLSearchParams(location.search).get('__theme');
const systemIsDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
applyTheme((queryTheme === 'dark' || queryTheme === 'light' ? queryTheme : saved) || (systemIsDark ? 'dark' : 'light'));
toggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(KEY, next); } catch { /* keep the current page usable */ }
});
