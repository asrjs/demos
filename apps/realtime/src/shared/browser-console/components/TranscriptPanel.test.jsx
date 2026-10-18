import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TranscriptPanel } from './TranscriptPanel.jsx';
it('renders canonical millisecond metrics and accepts native snake-case metrics', () => {
  for (const latestMetrics of [{totalMs:123,encodeMs:80,decodeMs:40},{total_ms:123,encode_ms:80,decode_ms:40}]) {
    const html = renderToStaticMarkup(<TranscriptPanel app={{streamingPanel:{latestMetrics,isTranscribing:false},transcriptPanel:{text:'',transcriptions:[]}}} />);
    expect(html).toContain('123');expect(html).toContain('80');expect(html).toContain('40');
  }
});
