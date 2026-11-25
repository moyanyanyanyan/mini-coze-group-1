import type { DocumentChunkInput } from './chunk-document';
import type { NodeBounds } from 'officeparser';
import type {
  OfficeListInfo,
  OfficeTextSegment,
  OfficeTextSegmentKind,
} from './office-ast-converter';

export interface ChunkSourceRange {
  path: string;
  slideNumber?: number;
  bounds?: NodeBounds;
  kind: OfficeTextSegmentKind;
  /** UTF-16 offset into KnowledgeDocument.rawText. */
  startOffset: number;
  endOffset: number;
  /** True when the range was pulled in by the previous chunk's 50-char overlap. */
  overlap: boolean;
  headingLevel?: number;
  list?: OfficeListInfo;
}

export interface ChunkSourceRanges {
  version: 1;
  ranges: ChunkSourceRange[];
}

/**
 * Maps each chunk's raw-text intervals to Office segment sources. A chunk may
 * overlap several paragraphs, table cells or slides, so the result is always a
 * list rather than a single source.
 */
export function mapChunkSourceRanges(
  chunks: readonly DocumentChunkInput[],
  segments: readonly OfficeTextSegment[],
): Array<ChunkSourceRanges | null> {
  return chunks.map((chunk) => {
    const ranges: ChunkSourceRange[] = [];
    const seen = new Set<string>();

    const add = (
      segment: OfficeTextSegment,
      startOffset: number,
      endOffset: number,
      overlap: boolean,
    ) => {
      if (endOffset <= startOffset) {
        return;
      }
      const key = [
        segment.source.path,
        segment.source.slideNumber ?? '',
        segment.kind,
        startOffset,
        endOffset,
        overlap ? '1' : '0',
      ].join('|');
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      ranges.push({
        path: segment.source.path,
        ...(segment.source.slideNumber === undefined
          ? {}
          : { slideNumber: segment.source.slideNumber }),
        ...(segment.source.bounds
          ? { bounds: { ...segment.source.bounds } }
          : {}),
        kind: segment.kind,
        startOffset,
        endOffset,
        overlap,
        ...(segment.headingLevel === undefined
          ? {}
          : { headingLevel: segment.headingLevel }),
        ...(segment.list ? { list: segment.list } : {}),
      });
    };

    for (const segment of segments) {
      add(
        segment,
        Math.max(segment.startOffset, chunk.bodyStartOffset),
        Math.min(segment.endOffset, chunk.endOffset),
        false,
      );
      add(
        segment,
        Math.max(segment.startOffset, chunk.startOffset),
        Math.min(segment.endOffset, chunk.bodyStartOffset),
        true,
      );
    }

    if (ranges.length === 0) {
      return null;
    }
    ranges.sort(
      (left, right) =>
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset ||
        left.path.localeCompare(right.path),
    );
    return { version: 1, ranges };
  });
}
