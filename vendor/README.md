# Local library package

This archive comes from the audited working tree; it is not a registry publication.

- Package: `@asrjs/speech-recognition@0.2.0`.
- SHA-512 integrity: `sha512-zZK3OgWAfd6fibYiHnhZ4+R9qyZASfDhzlfnHeRcV/yNSV6EEHfRh3BTu0JNQAJDYr+mRk/G+EBP/WoyqgTiFA==`.
- Library base commit: `6e53c832a6e0837a117e187e383eaef51c1f6890`, with uncommitted audit repairs.
- Validation: see `speech-recognition/docs/reports/audit-repair-progress-2026-10-18.md` in the companion checkout.
- `npm ci` installs the archive pinned in `package-lock.json`.

To refresh after library edits, build the library, run
`npm pack --ignore-scripts --pack-destination ../demos/vendor`, refresh the demo
lockfile, and repeat package-mode builds. No publishing is required.
