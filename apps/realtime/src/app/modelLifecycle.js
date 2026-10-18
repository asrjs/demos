export async function releaseCurrentModel(modelRef, { evictHub = false } = {}) {
  const current = modelRef.current;
  if (!current) return;

  try {
    if (current.kind === 'hub-pipeline') {
      if (evictHub && current.evict) {
        await current.evict();
      }
    } else if (current.dispose) {
      await current.dispose();
    }
  } finally {
    modelRef.current = null;
  }
}
