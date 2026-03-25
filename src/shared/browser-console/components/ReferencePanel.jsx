import React from 'react';
import { Widget } from '../../ui/PanelPrimitives.jsx';

export function ReferencePanel({ app }) {
  const {
    modelPanel: { selectedLanguageName, effectiveTargetLanguageName },
    transcriptPanel: {
      referenceText,
      setReferenceText,
      copyToClipboard,
      isCanaryTranslationMode,
    },
  } = app;

  return (
    <Widget
      title="Reference"
      actions={referenceText ? (
        <button type="button" onClick={() => copyToClipboard(referenceText)} className="compact-button-secondary compact-button--toolbar">
          Copy
        </button>
      ) : null}
    >
      <textarea
        value={referenceText}
        onChange={(e) => setReferenceText(e.target.value)}
        className="compact-control reference-textarea"
        placeholder="Paste reference text..."
      />
      {isCanaryTranslationMode ? (
        <div className="mt-2 type-caption text-warn">
          Reference is hidden while Canary translates from {selectedLanguageName} to {effectiveTargetLanguageName}.
        </div>
      ) : null}
    </Widget>
  );
}
