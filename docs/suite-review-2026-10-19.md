# Central demo suite: implementation and verification

The active applications now form one suite for `@asrjs/speech-recognition`: Transcribe (showcase), Playground, Live Studio (realtime), and Benchmark. The portal and applications share theme tokens; the applications share a header, navigation, library provenance, and one persisted appearance preference.

## Changes

- `packages/ui`: shared shell and theme provider. Query, stored preference, system appearance, and embedding messages are handled centrally. Blocked storage does not prevent system appearance detection. System defaults are not saved as deliberate user preferences.
- `packages/demo-runtime`: shared catalog/descriptor helpers, suite navigation, and the showcase/realtime hub loader. Cache keys include the canonical load configuration; model-load progress has one forwarding path and requests are serialized.
- `scripts`: staged suite build and static preview with cross-origin isolation headers. Existing output is preserved before replacement. Nested URL bases distinguish the suite base from each application's asset base. Standalone app builds do not invent sibling deployment URLs.
- Existing app tabs, model controls, transcript views, benchmark controls and exports remain in their task-specific applications. Duplicate app branding and theme controllers were removed. The Playground mobile grid now constrains its columns instead of expanding to code/content width.

The legacy references remain available. Existing TDT/model-loading, dataset benchmarking, and code-example experiences are consolidated into the four roles; this change does not claim a new port or runtime parity for every feature of every historical Transformers.js demo.

## Parent verification

| Check | Result and scope |
| --- | --- |
| `npm test` | 55 tests passed: 14 Node tests plus 41 Vitest tests. Includes previous app regressions and new shared runtime/theme/delivery tests. |
| `npm run build` | All four production app builds and central portal assembly passed. |
| Chrome production UI smoke | Portal plus all four apps rendered, changed light/dark appearance, persisted the preference, and had no uncaught page exceptions. |
| Responsive UI | 1440px desktop and 390px mobile captures inspected; no document-level horizontal overflow on the five routes. |
| Navigation | All four app navigation targets checked. Portal → Showcase → Benchmark → Portal retained the selected dark theme. |
| Existing preferences | Chrome started each app with its previous dark-theme storage key and a light system preference; all four migrated to the shared dark preference. |
| `git diff --check` | Passed after preserving the repository's line endings in merged files. |

Local command logs and browser captures are in `tmp/suite-review/` (ignored artifacts). The browser smoke is a UI check: it does not load every model, establish numerical parity, or certify microphone/VAD inference. Previously open model-parity and production VAD gates are not closed by these results. Vite still reports large bundle warnings.

The parent independently reviewed the agents' source changes and corrected suite-base routing, duplicate progress callbacks, theme persistence/system fallback, dark-theme contrast, mobile overflow, migration of saved app preferences, and fixed development ports before accepting these results. No commit, push, or external deployment was performed.

## Run

```sh
npm ci
npm test
npm run build
npm run preview:suite
```

The default preview is `http://127.0.0.1:4173/`. The review session uses port 4189. See [suite conventions](suite-apps.md) for standalone builds, development ports, and nested deployment bases.
