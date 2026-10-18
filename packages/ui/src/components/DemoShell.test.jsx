import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DemoShell } from './DemoShell.jsx';
import { DemoThemeProvider } from '../theme.js';

describe('DemoShell', () => {
  it('renders one shared navigation with an active app and configurable links', () => {
    const html = renderToStaticMarkup(
      <DemoThemeProvider>
        <DemoShell appId="realtime" version="0.2.0" source="npm-package" appLinks={{ realtime: '/live/', showcase: '/transcribe/' }}>
          <div>Live capture</div>
        </DemoShell>
      </DemoThemeProvider>,
    );
    expect(html).toContain('href="/live/" aria-current="page"');
    expect(html).toContain('href="/transcribe/"');
    expect(html).toContain('Library 0.2.0');
    expect(html).toContain('npm-package');
    expect(html).toContain('Live capture');
  });

  it('keeps standalone deployment navigation free of dead sibling links', () => {
    const html = renderToStaticMarkup(
      <DemoThemeProvider>
        <DemoShell appId="benchmark" appLinks={{}}><div>Results</div></DemoShell>
      </DemoThemeProvider>,
    );
    expect(html).not.toContain('href="../showcase/"');
    expect(html).not.toContain('href="../playground/"');
    expect(html).not.toContain('href="../realtime/"');
    expect(html).not.toContain('href="../benchmark/"');
    expect(html).toContain('<span aria-current="page" class="is-active">Benchmark</span>');
  });
});
