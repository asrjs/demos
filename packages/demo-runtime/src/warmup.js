function normalizeWarmupText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesWarmupPhrase(actualNormalized, actualCompact, expectedText) {
  const expectedNormalized = normalizeWarmupText(expectedText);
  if (!expectedNormalized) return false;

  return (
    actualNormalized.includes(expectedNormalized) ||
    actualCompact.includes(expectedNormalized.replace(/\s+/g, ''))
  );
}

function matchesWarmupKeywordGroups(actualNormalized, actualCompact, requiredKeywordGroups = []) {
  if (!requiredKeywordGroups.length) return false;

  return requiredKeywordGroups.every((group) =>
    group.every((keyword) => {
      const normalizedKeyword = normalizeWarmupText(keyword);
      if (!normalizedKeyword) return false;

      return (
        actualNormalized.includes(normalizedKeyword) ||
        actualCompact.includes(normalizedKeyword.replace(/\s+/g, ''))
      );
    }),
  );
}

export function matchesWarmupResult(modelConfig, candidates) {
  const warmup = modelConfig?.warmup;
  // Oracle belongs to the bundled Harvard-L2-1.ogg fixture, not a model family.
  const expectedTexts = warmup?.expectedTexts?.length ? warmup.expectedTexts : ['The boy was there when the sun rose.'];
  const requiredKeywordGroups = warmup?.requiredKeywordGroups || [];

  return candidates.some((candidate) => {
    const actualNormalized = normalizeWarmupText(candidate);
    const actualCompact = actualNormalized.replace(/\s+/g, '');
    if (!actualNormalized) return false;

    if (warmup?.mode === 'non-empty') {
      return true;
    }

    const phraseMatch = expectedTexts.some((expectedText) =>
      matchesWarmupPhrase(actualNormalized, actualCompact, expectedText),
    );
    if (phraseMatch) {
      return true;
    }

    return matchesWarmupKeywordGroups(actualNormalized, actualCompact, requiredKeywordGroups);
  });
}
