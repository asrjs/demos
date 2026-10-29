# Local library package

The demo suite installs this local build: `asrjs-speech-recognition-0.2.0-approved-profiles-v3-20261025.tgz`.

- Package: `@asrjs/speech-recognition@0.2.0`.
- SHA-512 integrity: `sha512-h5sDcR24gZ8lvlJonEex//gAQOnLvYFowuub7HRm9C9E5XUknH47P9JD3gv/+LWqj1Kg1Mg1tK4MABSMwtRm6Q==`.
- Archive SHA-256: `43d188aba6088c2146c1bc34b76389615195e33799b2bd0370431b6b169a61bb`.
- Provenance receipt: [`asrjs-speech-recognition-0.2.0-approved-profiles-v3-20261025.provenance.json`](asrjs-speech-recognition-0.2.0-approved-profiles-v3-20261025.provenance.json).
- Scope and validation: [microphone composition and reference review](../docs/reports/microphone-composition-and-reference-review-2026-10-25.md).

`npm ci` installs the archive pinned by `package-lock.json`. After library edits, build the library and pack a new archive into `vendor`; update the demo lockfile to that archive and rerun package-mode tests and builds. Model acceptance requires separate real-weight flow receipts.
