import { chunkDocument } from './chunk-document';

describe('fixed document chunking', () => {
  it('keeps short paragraphs in one ordered chunk', () => {
    expect(chunkDocument('第一段。\r\n\r\n第二段。')).toEqual([
      { position: 0, content: '第一段。\n\n第二段。', startOffset: 0, endOffset: 10, bodyStartOffset: 0 },
    ]);
  });

  it('splits long text without dropping the final short part and overlaps 50 characters', () => {
    const chunks = chunkDocument('甲'.repeat(1050));
    expect(chunks).toHaveLength(3);
    expect(chunks.map(({ position }) => position)).toEqual([0, 1, 2]);
    expect(chunks[0].content).toHaveLength(500);
    expect(chunks[1].content).toBe('甲'.repeat(550));
    expect(chunks[2].content).toBe('甲'.repeat(100));
    expect(chunks[2].endOffset).toBe(1050);
    expect(chunks.map((chunk) => chunk.bodyStartOffset)).toEqual([0, 500, 1000]);
  });

  it('keeps every chunk content equal to its source slice', () => {
    const text = `${'段落一。'.repeat(120)}\n\n${'段落二。'.repeat(120)}`;
    for (const chunk of chunkDocument(text)) {
      expect(chunk.content).toBe(text.slice(chunk.startOffset, chunk.endOffset));
    }
  });

  it('prefers a sentence boundary before the 500 character limit', () => {
    const chunks = chunkDocument(`${'甲'.repeat(300)}。${'乙'.repeat(300)}`);
    expect(chunks[0].content.endsWith('。')).toBe(true);
    expect(chunks[0].endOffset).toBe(301);
    expect(chunks[0].bodyStartOffset).toBe(0);
  });
});
