import { chunkDocument } from './chunk-document';
import { mapChunkSourceRanges, parseChunkSourceRanges } from './chunk-source';
import type { OfficeTextSegment } from './office-ast-converter';

function segment(
  text: string,
  startOffset: number,
  endOffset: number,
  path: string,
  slideNumber?: number,
): OfficeTextSegment {
  return {
    kind: 'paragraph',
    text,
    startOffset,
    endOffset,
    source: {
      path,
      ...(slideNumber === undefined ? {} : { slideNumber }),
    },
  };
}

describe('chunk source range mapping', () => {
  it('returns every paragraph/slide touched by one chunk', () => {
    const first = 'A'.repeat(240);
    const second = 'B'.repeat(240);
    const rawText = `${first}\n\n${second}`;
    const chunks = chunkDocument(rawText);
    expect(chunks).toHaveLength(1);

    const mapped = mapChunkSourceRanges(chunks, [
      segment(first, 0, 240, 'content.0', 1),
      segment(second, 242, 482, 'content.1', 2),
    ]);

    expect(mapped[0]).toMatchObject({
      version: 1,
      ranges: [
        {
          path: 'content.0',
          slideNumber: 1,
          startOffset: 0,
          endOffset: 240,
          overlap: false,
        },
        {
          path: 'content.1',
          slideNumber: 2,
          startOffset: 242,
          endOffset: 482,
          overlap: false,
        },
      ],
    });
  });

  it('marks the 50-character carry-over separately from the new body', () => {
    const rawText = '甲'.repeat(1050);
    const chunks = chunkDocument(rawText);
    const mapped = mapChunkSourceRanges(chunks, [
      segment(rawText, 0, 1050, 'content.0'),
    ]);

    expect(mapped[0]).toMatchObject({
      ranges: [{ startOffset: 0, endOffset: 500, overlap: false }],
    });
    expect(mapped[1]).toMatchObject({
      ranges: [
        {
          path: 'content.0',
          startOffset: 450,
          endOffset: 500,
          overlap: true,
        },
        {
          path: 'content.0',
          startOffset: 500,
          endOffset: 1000,
          overlap: false,
        },
      ],
    });
    expect(mapped[2]).toMatchObject({
      ranges: [
        { startOffset: 950, endOffset: 1000, overlap: true },
        { startOffset: 1000, endOffset: 1050, overlap: false },
      ],
    });
  });

  it('validates and projects stored ranges for API responses', () => {
    expect(parseChunkSourceRanges({
      version: 1,
      ranges: [{
        path: 'content.0',
        slideNumber: 2,
        kind: 'heading',
        startOffset: 0,
        endOffset: 8,
        overlap: false,
        headingLevel: 1,
        bounds: { x: 1, y: 2, width: 3, height: 4, baseline: 5 },
        unexpected: '<script>',
      }],
      extra: true,
    })).toEqual({
      version: 1,
      ranges: [{
        path: 'content.0',
        slideNumber: 2,
        kind: 'heading',
        startOffset: 0,
        endOffset: 8,
        overlap: false,
        headingLevel: 1,
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      }],
    });
  });

  it('returns null for legacy, malformed or unsafe stored ranges', () => {
    expect(parseChunkSourceRanges(null)).toBeNull();
    expect(parseChunkSourceRanges({ version: 1, ranges: [] })).toEqual({
      version: 1,
      ranges: [],
    });
    expect(parseChunkSourceRanges({ version: 2, ranges: [] })).toBeNull();
    expect(parseChunkSourceRanges({ version: 1, ranges: [{}] })).toBeNull();
    expect(parseChunkSourceRanges({
      version: 1,
      ranges: [{
        path: 'content.0',
        kind: 'paragraph',
        startOffset: 5,
        endOffset: 4,
        overlap: false,
      }],
    })).toBeNull();
    expect(parseChunkSourceRanges({
      version: 1,
      ranges: [{
        path: 'content.0',
        kind: 'unknown',
        startOffset: 0,
        endOffset: 4,
        overlap: false,
      }],
    })).toBeNull();
  });
});
