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

const SEGMENT_KINDS = new Set<OfficeTextSegmentKind>([
  'paragraph',
  'heading',
  'listItem',
  'tableCell',
  'imageOcr',
]);

const MAX_API_SOURCE_RANGES = 500;
const MAX_SOURCE_PATH_LENGTH = 1000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function optionalPositiveInteger(value: unknown): value is number | undefined {
  return value === undefined ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
}

function validBounds(value: unknown): value is NodeBounds {
  if (!record(value)) {
    return false;
  }
  return ['x', 'y', 'width', 'height'].every(
    (key) =>
      typeof value[key] === 'number' &&
      Number.isFinite(value[key]) &&
      (key === 'x' || key === 'y' || (value[key] as number) >= 0),
  );
}

/**
 * Validates and projects stored sourceRanges before exposing them through an
 * API. Only the known schema survives; malformed or legacy values become null.
 */
export function parseChunkSourceRanges(
  value: unknown,
): ChunkSourceRanges | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.ranges)) {
    return null;
  }
  const ranges: ChunkSourceRange[] = [];
  for (const item of value.ranges.slice(0, MAX_API_SOURCE_RANGES)) {
    if (!record(item)) {
      return null;
    }
    if (
      typeof item.path !== 'string' ||
      item.path.length === 0 ||
      item.path.length > MAX_SOURCE_PATH_LENGTH ||
      typeof item.kind !== 'string' ||
      !SEGMENT_KINDS.has(item.kind as OfficeTextSegmentKind) ||
      !safeInteger(item.startOffset) ||
      !safeInteger(item.endOffset) ||
      item.endOffset <= item.startOffset ||
      typeof item.overlap !== 'boolean' ||
      !optionalPositiveInteger(item.slideNumber)
    ) {
      return null;
    }
    if (item.bounds !== undefined && !validBounds(item.bounds)) {
      return null;
    }
    const headingLevel = item.headingLevel;
    if (
      headingLevel !== undefined &&
      (!safeInteger(headingLevel) || headingLevel < 1 || headingLevel > 9)
    ) {
      return null;
    }
    let list: OfficeListInfo | undefined;
    if (item.list !== undefined) {
      if (
        !record(item.list) ||
        (item.list.listType !== 'ordered' &&
          item.list.listType !== 'unordered') ||
        !safeInteger(item.list.level) ||
        !safeInteger(item.list.itemIndex) ||
        (item.list.listId !== undefined &&
          typeof item.list.listId !== 'string') ||
        (item.list.marker !== undefined &&
          typeof item.list.marker !== 'string')
      ) {
        return null;
      }
      list = {
        listType: item.list.listType,
        level: item.list.level,
        itemIndex: item.list.itemIndex,
        ...(item.list.listId === undefined
          ? {}
          : { listId: item.list.listId }),
        ...(item.list.marker === undefined
          ? {}
          : { marker: item.list.marker }),
      };
    }
    ranges.push({
      path: item.path,
      ...(item.slideNumber === undefined
        ? {}
        : { slideNumber: item.slideNumber }),
      ...(item.bounds === undefined
        ? {}
        : {
            bounds: {
              x: item.bounds.x,
              y: item.bounds.y,
              width: item.bounds.width,
              height: item.bounds.height,
            },
          }),
      kind: item.kind as OfficeTextSegmentKind,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      overlap: item.overlap,
      ...(headingLevel === undefined ? {} : { headingLevel }),
      ...(list === undefined ? {} : { list }),
    });
  }
  return { version: 1, ranges };
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
