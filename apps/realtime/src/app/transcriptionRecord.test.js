import { describe, expect, it } from 'vitest';
import { createTranscriptionRecordFromResult } from './transcriptionRecord.js';

describe('createTranscriptionRecordFromResult', () => {
  it('keeps canonical word timings and real microphone capture offset', () => {
    const firstUtterance = createTranscriptionRecordFromResult({
      result: {
        canonical: {
          text: 'first words',
          words: [
            { text: 'first', startTime: 0.1, endTime: 0.4 },
            { text: 'words', startTime: 0.5, endTime: 0.9 },
          ],
        },
      },
      duration: 1.2,
      startTimeSeconds: 0,
    });
    const secondUtterance = createTranscriptionRecordFromResult({
      result: {
        canonical: {
          text: 'second utterance',
          words: [
            { text: 'second', startTime: 0.05, endTime: 0.35 },
            { text: 'utterance', startTime: 0.4, endTime: 0.8 },
          ],
        },
      },
      duration: 1,
      startTimeSeconds: 4.25,
    });

    expect(firstUtterance.words[0]).toEqual({ text: 'first', startTime: 0.1, endTime: 0.4 });
    expect(firstUtterance.audioDuration).toBe(1.2);
    expect(secondUtterance.startTimeSeconds).toBe(4.25);
    expect(secondUtterance.audioDuration).toBe(1);
    expect(secondUtterance.words[0]).toEqual({ text: 'second', startTime: 0.05, endTime: 0.35 });
  });

  it('preserves unknown duration and offset instead of inventing values', () => {
    const record = createTranscriptionRecordFromResult({ result: { text: 'unknown' } });
    expect(record.audioDuration).toBeUndefined();
    expect(record.startTimeSeconds).toBeUndefined();
    expect(record.words).toEqual([]);
  });
});
