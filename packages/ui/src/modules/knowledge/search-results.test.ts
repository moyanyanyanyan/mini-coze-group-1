import { describe, expect, it } from 'vitest';
import { groupSearchResults, type SearchResultHit } from './search-results';

function hit(overrides: Partial<SearchResultHit>): SearchResultHit {
  return { chunkId: 'chunk', documentId: 'doc-1', documentTitle: '员工手册.txt', content: 'chunk', startOffset: 0, endOffset: 5, score: 0.8, ...overrides };
}

describe('groupSearchResults', () => {
  it('groups same-document hits and preserves document rank order', () => {
    const result = groupSearchResults([
      hit({ documentId: 'doc-1', documentTitle: 'A' }),
      hit({ documentId: 'doc-2', documentTitle: 'B' }),
      hit({ documentId: 'doc-1', chunkId: 'chunk-2' }),
    ], { 'doc-1': 'abcdef', 'doc-2': 'uvwxyz' });
    expect(result.map((group) => group.documentId)).toEqual(['doc-1', 'doc-2']);
    expect(result[0].segments).toHaveLength(1);
  });

  it('merges overlapping ranges without merging adjacent ranges', () => {
    const result = groupSearchResults([
      hit({ startOffset: 0, endOffset: 5, content: 'abcde' }),
      hit({ chunkId: 'chunk-2', startOffset: 4, endOffset: 9, content: 'efghi' }),
      hit({ chunkId: 'chunk-3', startOffset: 9, endOffset: 12, content: 'jkl' }),
    ], { 'doc-1': 'abcdefghijkl' });
    expect(result[0].segments.map((segment) => segment.content)).toEqual(['abcdefghi', 'jkl']);
  });

  it('never combines hits from different documents', () => {
    const result = groupSearchResults([
      hit({ documentId: 'doc-1', documentTitle: 'A' }),
      hit({ documentId: 'doc-2', documentTitle: 'B' }),
    ], { 'doc-1': 'abcde', 'doc-2': 'vwxyz' });
    expect(result).toHaveLength(2);
  });

  it('keeps independent chunks when offsets are missing or invalid', () => {
    const result = groupSearchResults([
      hit({ startOffset: null, endOffset: null }),
      hit({ chunkId: 'chunk-2', startOffset: 1, endOffset: 999 }),
    ], { 'doc-1': 'abcde' });
    expect(result[0].segments.map((segment) => segment.content)).toEqual(['chunk', 'chunk']);
  });
});
