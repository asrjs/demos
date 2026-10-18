import { expect, it } from 'vitest';
import { buildTranscriptionOptions } from './transcriptionHelpers.js';
it('requests canonical word alignment for the local public model handle', () => {
  expect(buildTranscriptionOptions('parakeet-tdt-0.6b-v3', {})).toMatchObject({ detail: 'words', returnTimestamps: true });
  expect(buildTranscriptionOptions('parakeet-tdt-0.6b-v3', { timestamps: false })).toMatchObject({ detail: 'text', returnTimestamps: false });
});
