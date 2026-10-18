import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WordPills } from './WordPills.jsx';

describe('WordPills', () => {
  it('adds an explicit capture offset to displayed word times', () => {
    const html = renderToStaticMarkup(
      <WordPills
        words={[{ text: 'speech', startTime: 0.25, endTime: 0.75 }]}
        offsetSeconds={4.25}
      />,
    );
    expect(html).toContain('4.50s–5.00s');
  });
});
