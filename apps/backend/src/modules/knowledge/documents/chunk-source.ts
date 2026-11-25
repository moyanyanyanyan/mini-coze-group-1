import { DocumentContentError } from './document-content';
import { DocumentChunkInput } from './chunk-document';
import {
  assertNormalizedDocument,
  NormalizedSegment,
  NormalizedSegmentKind,
} from './normalized-document';

/** A chunk fragment that points back to one normalized segment. */
export interface ChunkSourceRange {
  segmentIndex: number;
  kind: NormalizedSegmentKind;
  startOffset: number;
  endOffset: number;
  text: string;
}

/** Source mapping for one persisted chunk. */
export interface ChunkSourceMapping {
  chunkPosition: number;
  startOffset: number;
  endOffset: number;
  sourceRanges: ChunkSourceRange[];
}

export interface SegmentChunkMapping {
  segmentIndex: number;
  chunkPositions: number[];
}

/**
 * Maps every chunk back to the normalized segments it came from.
 *
 * Chunks are still produced from `rawText` by the existing chunker, so this is
 * a projection over the same offsets rather than a second chunking algorithm.
 * Call `validateChunkSources` before persisting to fail fast on offset drift.
 */
export function mapChunkSources(
  rawText: string,
  chunks: DocumentChunkInput[],
  segments: NormalizedSegment[],
): ChunkSourceMapping[] {
  assertChunkSources(rawText, chunks, segments);

  return chunks.map((chunk) => {
    const sourceRanges: ChunkSourceRange[] = [];
    segments.forEach((segment, segmentIndex) => {
      const startOffset = Math.max(chunk.startOffset, segment.startOffset);
      const endOffset = Math.min(chunk.endOffset, segment.endOffset);
      if (startOffset >= endOffset) {
        return;
      }
      sourceRanges.push({
        segmentIndex,
        kind: segment.kind,
        startOffset,
        endOffset,
        text: rawText.slice(startOffset, endOffset),
      });
    });

    return {
      chunkPosition: chunk.position,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      sourceRanges,
    };
  });
}

/** Alias kept for callers that describe the result as ranges only. */
export const mapChunkSourceRanges = mapChunkSources;

/**
 * Reverse direction: for each segment, which chunks contain it. Useful for
 * citation UIs that start from a segment and need chunk ids.
 */
export function mapSegmentChunks(
  chunks: DocumentChunkInput[],
  segments: NormalizedSegment[],
): SegmentChunkMapping[] {
  return segments.map((segment, segmentIndex) => ({
    segmentIndex,
    chunkPositions: chunks
      .filter(
        (chunk) =>
          chunk.startOffset < segment.endOffset &&
          chunk.endOffset > segment.startOffset,
      )
      .map((chunk) => chunk.position),
  }));
}

/**
 * Strict contract check used by the indexing pipeline:
 * - `rawText.slice(startOffset, endOffset) === chunk.content`
 * - every mapped range lands on a real segment boundary/intersection
 * - at least one source range for every non-empty chunk
 */
export function validateChunkSources(
  rawText: string,
  chunks: DocumentChunkInput[],
  segments: NormalizedSegment[],
): void {
  assertChunkSources(rawText, chunks, segments);

  const mappings = mapChunkSourcesWithoutValidation(rawText, chunks, segments);
  for (const mapping of mappings) {
    if (mapping.sourceRanges.length === 0) {
      throw new DocumentContentError(
        'CHUNK_SOURCE_MISMATCH',
        `第 ${mapping.chunkPosition + 1} 个检索片段未映射到任何正文片段`,
      );
    }
    for (const range of mapping.sourceRanges) {
      if (rawText.slice(range.startOffset, range.endOffset) !== range.text) {
        throw new DocumentContentError(
          'CHUNK_SOURCE_MISMATCH',
          `第 ${mapping.chunkPosition + 1} 个检索片段的来源区间无效`,
        );
      }
    }
  }
}

function mapChunkSourcesWithoutValidation(
  rawText: string,
  chunks: DocumentChunkInput[],
  segments: NormalizedSegment[],
): ChunkSourceMapping[] {
  return chunks.map((chunk) => ({
    chunkPosition: chunk.position,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    sourceRanges: segments.flatMap((segment, segmentIndex) => {
      const startOffset = Math.max(chunk.startOffset, segment.startOffset);
      const endOffset = Math.min(chunk.endOffset, segment.endOffset);
      if (startOffset >= endOffset) {
        return [];
      }
      return [
        {
          segmentIndex,
          kind: segment.kind,
          startOffset,
          endOffset,
          text: rawText.slice(startOffset, endOffset),
        },
      ];
    }),
  }));
}

function assertChunkSources(
  rawText: string,
  chunks: DocumentChunkInput[],
  segments: NormalizedSegment[],
): void {
  assertNormalizedDocument({ format: 'TEXT', title: null, rawText, segments });

  const positions = new Set<number>();
  for (const chunk of chunks) {
    if (
      !Number.isInteger(chunk.position) ||
      chunk.position < 0 ||
      positions.has(chunk.position)
    ) {
      throw new DocumentContentError('INVALID_OFFSET', '检索片段序号无效');
    }
    positions.add(chunk.position);

    if (
      !Number.isInteger(chunk.startOffset) ||
      !Number.isInteger(chunk.endOffset) ||
      chunk.startOffset < 0 ||
      chunk.endOffset <= chunk.startOffset ||
      chunk.endOffset > rawText.length
    ) {
      throw new DocumentContentError(
        'INVALID_OFFSET',
        `第 ${chunk.position + 1} 个检索片段偏移无效`,
      );
    }
    if (rawText.slice(chunk.startOffset, chunk.endOffset) !== chunk.content) {
      throw new DocumentContentError(
        'CHUNK_SOURCE_MISMATCH',
        `第 ${chunk.position + 1} 个检索片段内容与其原文区间不一致`,
      );
    }
  }
}
