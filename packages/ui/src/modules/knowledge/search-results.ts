export interface SearchResultHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  startOffset: number | null;
  endOffset: number | null;
  score: number;
}

export interface SearchResultSegment {
  content: string;
  startOffset: number | null;
  endOffset: number | null;
  score: number;
}

export interface GroupedSearchResult {
  documentId: string;
  documentTitle: string;
  segments: SearchResultSegment[];
}

export function groupSearchResults(
  hits: SearchResultHit[],
  contentByDocumentId: Record<string, string> = {},
): GroupedSearchResult[] {
  const groups = new Map<string, { documentTitle: string; hits: SearchResultHit[]; firstRank: number }>();
  hits.forEach((hit, rank) => {
    const group = groups.get(hit.documentId);
    if (group) group.hits.push(hit);
    else groups.set(hit.documentId, { documentTitle: hit.documentTitle, hits: [hit], firstRank: rank });
  });

  return [...groups.entries()]
    .sort(([, left], [, right]) => left.firstRank - right.firstRank)
    .map(([documentId, group]) => ({
      documentId,
      documentTitle: group.documentTitle,
      segments: mergeDocumentHits(group.hits, contentByDocumentId[documentId]),
    }));
}

function mergeDocumentHits(hits: SearchResultHit[], rawText?: string): SearchResultSegment[] {
  const canUseOffsets = typeof rawText === 'string' && rawText.length > 0 && hits.every((hit) => (
    Number.isSafeInteger(hit.startOffset) && Number.isSafeInteger(hit.endOffset)
      && (hit.startOffset as number) >= 0 && (hit.endOffset as number) > (hit.startOffset as number)
      && (hit.endOffset as number) <= rawText.length
  ));
  if (!canUseOffsets) return hits.map((hit) => ({ content: hit.content, startOffset: hit.startOffset, endOffset: hit.endOffset, score: hit.score }));

  const sorted = [...hits].sort((left, right) => (left.startOffset as number) - (right.startOffset as number));
  const segments: SearchResultSegment[] = [];
  for (const hit of sorted) {
    const start = hit.startOffset as number;
    const end = hit.endOffset as number;
    const previous = segments[segments.length - 1];
    if (previous && start < (previous.endOffset as number)) {
      previous.endOffset = Math.max(previous.endOffset as number, end);
      previous.score = Math.max(previous.score, hit.score);
      previous.content = rawText.slice(previous.startOffset as number, previous.endOffset as number);
    } else {
      segments.push({ content: rawText.slice(start, end), startOffset: start, endOffset: end, score: hit.score });
    }
  }
  return segments;
}
