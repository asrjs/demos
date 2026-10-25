# Local library package

The demo suite installs this local build: `asrjs-speech-recognition-0.2.0-microphone-context-20261025.tgz`.

- Package: `@asrjs/speech-recognition@0.2.0`.
- SHA-512 integrity: `sha512-yGtuH189CHArwTJDvyr7ykYRfIdhEzPfxhC9pGuxnhcA51gyD6bDmTsvgbc3bX9wSWKwC1alYfEOlvKfhQ==`.
- Archive SHA-256: `4520cd899fa8d4d1695f947be37f1cde6dfc9213728d938576bebdc0e6f920a8`.
- Provenance receipt: [`asrjs-speech-recognition-0.2.0-microphone-context-20261025.provenance.json`](asrjs-speech-recognition-0.2.0-microphone-context-20261025.provenance.json).
- Scope and validation: [microphone composition and reference review](../docs/reports/microphone-composition-and-reference-review-2026-10-25.md).

`npm ci` installs the archive pinned by `package-lock.json`. After library edits, build the library and pack a new archive into `vendor`; update the demo lockfile to that archive and rerun package-mode tests and builds. Model acceptance requires separate real-weight flow receipts.
