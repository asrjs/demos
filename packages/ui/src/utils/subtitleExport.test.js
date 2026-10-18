import { describe, expect, it } from 'vitest';
import { buildSubtitleExport, formatSubtitleTime } from './subtitleExport.js';

describe('subtitle export timestamps', () => {
  it('anchors missing word ends to capture end and offsets consecutive untimed clips', () => {
    expect(buildSubtitleExport([
      { text: 'partial alignment', startTimeSeconds: 4, audioDuration: 2,
        words: [{ text: 'partial', startTime: 0.5 }] },
      { text: 'next clip', audioDuration: 3,
        words: [{ text: 'next', startTime: 0.25, endTime: 2 }] },
    ])).toBe('1\n00:00:04,500 --> 00:00:06,000\npartial alignment\n\n2\n00:00:06,250 --> 00:00:08,000\nnext clip\n');
  });
  it('carries millisecond rounding across minute boundaries', () => {
    expect(formatSubtitleTime(59.9999)).toBe('00:01:00,000');
    expect(formatSubtitleTime(3599.9999, true)).toBe('01:00:00.000');
  });

  it('uses canonical local word times plus explicit capture offsets across real utterance gaps', () => {
    const oldestFirst = [
      {
        text: 'first utterance',
        audioDuration: 1.2,
        startTimeSeconds: 0,
        words: [
          { text: 'first', startTime: 0.1, endTime: 0.4 },
          { text: 'utterance', startTime: 0.5, endTime: 0.9 },
        ],
      },
      {
        text: 'second utterance',
        audioDuration: 1,
        startTimeSeconds: 4.25,
        words: [
          { text: 'second', startTime: 0.05, endTime: 0.35 },
          { text: 'utterance', startTime: 0.4, endTime: 0.8 },
        ],
      },
    ];

    expect(buildSubtitleExport(oldestFirst)).toBe(
      '1\n00:00:00,100 --> 00:00:00,900\nfirst utterance\n\n' +
        '2\n00:00:04,300 --> 00:00:05,050\nsecond utterance\n',
    );
  });

  it('does not invent a duration or fixed inter-utterance gap', () => {
    const exportText = buildSubtitleExport([
      { text: 'timed', words: [{ text: 'timed', startTime: 0, endTime: 0.5 }] },
      { text: 'unknown duration' },
      { text: 'duration only', audioDuration: 1.25 },
    ]);
    expect(exportText).toBe(
      '1\n00:00:00,000 --> 00:00:00,500\ntimed\n\n' +
        '2\n00:00:00,500 --> 00:00:01,750\nduration only\n',
    );
  });
});
