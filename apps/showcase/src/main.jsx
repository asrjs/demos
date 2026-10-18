import React from 'react';
import { createRoot } from 'react-dom/client';
import { DemoShell, DemoThemeProvider, migrateDemoThemePreference } from '@asrjs/demo-ui';
import { initializeDemoRuntime, resolveDemoAppLinks } from '@asrjs/demo-runtime';
import './App.css';
import '@asrjs/demo-ui/theme.css';
import App from './App.jsx';

migrateDemoThemePreference('showcase');

const root = createRoot(document.getElementById('root'));
const appLinks = resolveDemoAppLinks({
  suiteBase: typeof __ASRJS_SUITE_BASE__ !== 'undefined' ? __ASRJS_SUITE_BASE__ : '',
  development: import.meta.env.DEV,
  origin: window.location.origin,
});
initializeDemoRuntime(import.meta.env.BASE_URL).then(() => {
  root.render(<DemoThemeProvider storageKey="asrjs-theme"><DemoShell appId="showcase" title="Transcribe" version={typeof __ASRJS_VERSION__ !== 'undefined' ? __ASRJS_VERSION__ : 'unknown'} source={typeof __ASRJS_SOURCE__ !== 'undefined' ? __ASRJS_SOURCE__ : 'unknown'} appLinks={appLinks}><App /></DemoShell></DemoThemeProvider>);
}).catch(error => {
  root.render(<div role="alert">Runtime initialization failed: {error.message}</div>);
});
