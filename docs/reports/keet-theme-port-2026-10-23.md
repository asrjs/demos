# Keet theme port — 2026-10-23

## Applied

Reference: local `N:/github/ysdede/keet/src/index.css`, `src/index.tsx`, and ContextPanel controls. Shared demo UI now uses Keet's light palette: cream #F9F7F2, olive #6B705C, text #3D405B, sage #B7B7A4 and coral #E07A5F. Keet has no full dark theme; the retained dark mode is an ASRJS adaptation, not an upstream Keet dark theme.

- UI/headings: Plus Jakarta Sans. Transcript prose: Crimson Pro. Code/metrics: JetBrains Mono.
- Unmodified local WOFF2 assets, Latin + Latin Extended including Turkish glyphs. Each font's SIL OFL notice retained under packages/ui/src/fonts. No npm dependency changes were needed. Existing Material Icons CDN links remain separate from these three self-hosted typefaces.
- Shared raised/inset shadows, sage borders, rounded controls, olive actions and navigation.
- Removed redundant shared header tagline, workstation eyebrow, description and repeated version label. Version/source remain in the footer.
- Replaced Benchmark's remote Manrope/Syne import; transcript changes are three CSS class assignments, without model/audio logic changes.
- Light coral emphasis stays faithful to Keet. Small hover text and focus use darker coral #A94D35 (5.16:1 on cream); active nav uses #525745 (6.44:1 on its soft background). These are specific measured states, not a full WCAG certification.

## Validation

- Demo tests: 14 Node + 45 Vitest passed.
- Four production builds succeeded.
- Real Chrome: all four apps at 1440 and 390 px in light and dark mode (16 combinations). Checked actual font load, computed palette, no page errors and no horizontal document overflow.
- Theme toggle, reload persistence, cross-app preference, Turkish font subsets checked in the browser.
- Source diff whitespace check clean. No CI result is asserted for these uncommitted local theme changes.
- Peer review raised focus/hover/nav contrast concerns; parent recomputed contrast and fixed the specific values, then reviewer checked the fix. Parent also inspected rendered screenshots.

Evidence: `evidence/keet-theme-2026-10-23/` (browser JSON, screenshots, replay script, test/build logs). Model/VAD findings remain in [model-demo-streaming-audit-2026-10-23.md](model-demo-streaming-audit-2026-10-23.md). TEN-VAD-only repeating segments remain an open functional failure; theme work does not resolve it. Dense debug layouts and pre-existing unnamed controls also need separate follow-up.
