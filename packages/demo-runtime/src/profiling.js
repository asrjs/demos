/** Profiling is opt-in for new settings while preserving saved user choices. */
export function resolveProfilingSetting(settings) {
  return settings?.enableProfiling === true;
}
