# ASRJS standard demo suite

The suite in `apps/` is the canonical set of browser workspaces for `@asrjs/speech-recognition`. It gives the same installed library, shared UI package, light/dark theme, and model-support boundaries to four common jobs.

| App | Purpose | Existing experience consolidated |
| --- | --- | --- |
| `showcase` | Discover supported models, load audio, try local model files | Current browser/model demo; selected model-loading and local-file flows from the older demos |
| `playground` | Configure a supported model and generate a relevant integration example | API/parameter experiments and the Transformers.js-era code-example workflow |
| `realtime` | Microphone, streaming capture, uploads, timestamped transcript, export | Streaming/control-room demo and live Whisper-era interactions where they map to current library APIs |
| `benchmark` | Run and export measurements against current library models and datasets | Parakeet TDT and benchmark labs, including repeat and dataset workflows |

The names describe the user task rather than a model family. The suite does not promise that every historical model or backend is available: each app must derive options from current library descriptors and the artifacts that can actually be loaded. Historical Transformers.js or TDT behavior belongs in the current app only when its model, options, and outputs map honestly to the current library contracts.

## Shared conventions

- All four apps are Vite workspaces and resolve `@asrjs/speech-recognition` from the same pinned local package archive by default. `ASRJS_SOURCE=source` is an explicit development override.
- App builds receive an explicit URL base, so the suite can be deployed under a path prefix. Use the suite build script rather than collecting app build folders by hand.
- The suite portal, shared UI package, and the app themes use the same cream surface, deep ink, teal accent, and `asrjs-theme` preference key.
- `showcase` explores; `playground` configures and explains; `realtime` captures and transcribes; `benchmark` measures. Keep these roles distinct as features move from legacy projects.
- A feature is ported only after its source model/API is identified, current library support is checked, and the resulting browser workflow is exercised. A legacy label or screenshot alone is not evidence of parity.

## Build and preview

`npm run build` produces the central suite; `npm run preview:suite` serves it at `http://127.0.0.1:4173/`. `npm run build:apps` preserves the independent app build workflow. Run `npm test` for the shared runtime, delivery, theme, and existing app regression tests.

Development commands use distinct ports: `dev:showcase` 5173, `dev:playground` 5174, `dev:realtime` 3000, and `dev:benchmark` 5176. Start the desired development servers before following links between them. Production standalone builds omit sibling links because those deployments may not contain other apps.

After installing workspace dependencies, run `node scripts/build-suite.mjs` to build the four workspaces and create a portal in `dist/`. Run `node scripts/serve-suite.mjs` to preview that output with the cross-origin isolation headers needed for threaded WebAssembly. Add `--base=/nested/` to both commands when serving below a URL prefix. The static server is dependency-free and can also serve a prebuilt directory with `--root=PATH` and `--port=PORT`.

The build script preserves replaced suite outputs in a timestamped `.asrjs-backups` folder under `dist/`. Failed Vite output is left in a uniquely named staging folder so it can be inspected; successful builds do not mutate the individual app `dist` directories.
