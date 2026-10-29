import { chunkDocument } from './chunk-document';

describe('fixed document chunking', () => {
  it('keeps short paragraphs in one ordered chunk', () => {
    expect(chunkDocument('第一段。\r\n\r\n第二段。')).toEqual([
      { position: 0, content: '第一段。\n\n第二段。', startOffset: 0, endOffset: 10 },
    ]);
  });

  it('splits long text without dropping the final short part and overlaps 50 characters', () => {
    const chunks = chunkDocument('甲'.repeat(1050));
    expect(chunks).toHaveLength(3);
    expect(chunks.map(({ position }) => position)).toEqual([0, 1, 2]);
    expect(chunks[0].content).toHaveLength(500);
    expect(chunks[1].content).toBe(`${'甲'.repeat(50)}\n${'甲'.repeat(500)}`);
    expect(chunks[2].content).toBe(`${'甲'.repeat(50)}\n${'甲'.repeat(50)}`);
    expect(chunks[2].endOffset).toBe(1050);
  });

  it('prefers a sentence boundary before the 500 character limit', () => {
    const chunks = chunkDocument(`${'甲'.repeat(300)}。${'乙'.repeat(300)}`);
    expect(chunks[0].content.endsWith('。')).toBe(true);
    expect(chunks[0].endOffset).toBe(301);
  });
});
