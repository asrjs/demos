export const DEMO_APP_IDS = ['showcase', 'playground', 'realtime', 'benchmark'];
const DEVELOPMENT_PORTS = { showcase: 5173, playground: 5174, realtime: 3000, benchmark: 5176 };

export function resolveDemoAppLinks({ suiteBase = '', development = false, origin = 'http://localhost' } = {}) {
  if (suiteBase) {
    const base = suiteBase.endsWith('/') ? suiteBase : `${suiteBase}/`;
    return { home: base, ...Object.fromEntries(DEMO_APP_IDS.map(app => [app, `${base}${app}/`])) };
  }
  if (development) {
    const url = new URL(origin);
    const links = Object.fromEntries(DEMO_APP_IDS.map(app => {
      const target = new URL('/', url);
      target.port = String(DEVELOPMENT_PORTS[app]);
      return [app, target.href];
    }));
    return { home: links.showcase, ...links };
  }
  // A standalone deployment does not imply that sibling applications exist.
  return {};
}
