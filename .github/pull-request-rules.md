# Pull Request Rules

## GitHub Text Formatting

Apply these rules for all GitHub write actions:

- `gh pr create`
- `gh pr edit --body-file`
- `gh pr comment`
- `gh issue comment`
- review replies and thread resolutions

Rules:

1. Never post literal escaped newline sequences like `\n`.
2. Prefer `--body-file <path>` for PR bodies and longer comments.
3. Verify the final Markdown before posting:
   - no `\n` artifacts,
   - no truncated lines,
   - no broken bullets or code fences.
4. Wrap commands, paths, package names, and commit hashes in backticks.
5. Keep write-ups short and operational: summary, verification, risk, dependencies.

## PR Scope

1. One concern per PR. Split app UX changes, demo debugging aids, and build/tooling changes where practical.
2. If the PR depends on a matching `speech-recognition` branch or PR, state that explicitly.
3. If realtime-lab behavior changes, include either manual verification notes or targeted tests.

Fragile paths include:

- live microphone capture and queueing
- waveform or signal rendering
- realtime detector tuning and debug controls
- local-folder model loading flows
- worker wiring and Vite build output

## Verification Expectations

Before opening or updating a PR, run the smallest meaningful verification set for the changed area. Prefer exact commands in the PR body, for example:

```bash
npm test
npm run build
```

If verification was manual only for part of the UI flow, state that directly.
