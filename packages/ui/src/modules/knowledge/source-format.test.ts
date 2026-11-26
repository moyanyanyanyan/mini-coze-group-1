import { describe, expect, it } from 'vitest';
import { describeSourceRange, uniqueSourceRanges } from './source-format';
import type { KnowledgeSourceRange } from './types';

function range(overrides: Partial<KnowledgeSourceRange> = {}): KnowledgeSourceRange {
  return {
    path: 'content.0',
    kind: 'paragraph',
    startOffset: 0,
    endOffset: 5,
    overlap: false,
    ...overrides,
  };
}

describe('source range labels', () => {
  it('labels Word paragraphs and table cells', () => {
    expect(describeSourceRange(range({ path: 'content.3' }), 'DOCX')).toBe('Word 段落 4');
    expect(describeSourceRange(range({
      path: 'content.4.children.0.children.1.children.0',
      kind: 'tableCell',
    }), 'DOCX')).toBe('Word 表格 5 · 单元格');
    expect(describeSourceRange(range({ kind: 'imageOcr' }), 'DOCX')).toBe('Word 图片 OCR');
  });

  it('labels PPT slides', () => {
    expect(describeSourceRange(range({
      path: 'content.0.children.1',
      slideNumber: 2,
      kind: 'heading',
    }), 'PPTX')).toBe('PPT 第 2 页 · 标题');
  });

  it('deduplicates repeated sources across chunks', () => {
    expect(uniqueSourceRanges([
      range(),
      range({ startOffset: 10, endOffset: 15 }),
      range({ slideNumber: 2 }),
    ])).toHaveLength(2);
  });
});
