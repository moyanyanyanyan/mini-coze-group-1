import { DocumentContentError } from './document-content';

export type DocumentFormat = 'TEXT' | 'TXT' | 'JSON' | 'MARKDOWN' | 'HTML' | 'PDF' | 'IMAGE' | 'DOCX' | 'PPTX';

export type NormalizedSegmentKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'code'
  | 'quote'
  | 'thematicBreak';

/**
 * A retrieval segment is always an exact slice of `NormalizedDocument.rawText`.
 *
 * `rawText` is the normalized plain text that is persisted, previewed and
 * embedded. Markdown/HTML syntax is converted before this point so downstream
 * chunking only has to deal with one coordinate system.
 */
export interface NormalizedSegment {
  kind: NormalizedSegmentKind;
  text: string;
  startOffset: number;
  endOffset: number;
  /** Markdown/HTML heading level (1-6), only set for heading segments. */
  level?: number;
  /** Code fence language when the source declared one. */
  language?: string;
}

/**
 * The common contract produced by every parser. Markdown and HTML have
 * separate converters and parsers, but they both end up here.
 */
export interface NormalizedDocument {
  format: DocumentFormat;
  title: string | null;
  rawText: string;
  segments: NormalizedSegment[];
}

export interface SegmentMetadata {
  kind: NormalizedSegmentKind;
  level?: number;
  language?: string;
}

/**
 * Builds rawText and segment offsets together. Callers append already
 * normalized plain text; the builder is the only place that computes offsets,
 * which keeps `rawText.slice(startOffset, endOffset)` true by construction.
 */
export class NormalizedDocumentBuilder {
  private rawText = '';
  private readonly segments: NormalizedSegment[] = [];

  append(text: string, metadata: SegmentMetadata): void {
    if (!text) {
      return;
    }
    if (this.rawText) {
      this.rawText += '\n\n';
    }
    const startOffset = this.rawText.length;
    this.rawText += text;
    this.segments.push({
      kind: metadata.kind,
      text,
      startOffset,
      endOffset: this.rawText.length,
      ...(metadata.level === undefined ? {} : { level: metadata.level }),
      ...(metadata.language === undefined
        ? {}
        : { language: metadata.language }),
    });
  }

  get length(): number {
    return this.rawText.length;
  }

  build(format: DocumentFormat, title: string | null): NormalizedDocument {
    if (this.segments.length === 0) {
      throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
    }
    const document: NormalizedDocument = {
      format,
      title: normalizeTitle(title),
      rawText: this.rawText,
      segments: this.segments,
    };
    assertNormalizedDocument(document);
    return document;
  }
}

export function normalizeTitle(
  title: string | null | undefined,
): string | null {
  if (!title) {
    return null;
  }
  const normalized = title.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 200) : null;
}

/**
 * Validates the output contract. This is intentionally strict: an offset bug
 * must fail processing instead of producing chunks that point at the wrong
 * source text.
 */
export function assertNormalizedDocument(document: NormalizedDocument): void {
  if (!document.rawText.trim()) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }
  if (document.segments.length === 0) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }

  let previousEnd = 0;
  for (const [index, segment] of document.segments.entries()) {
    if (!segment.text) {
      throw new DocumentContentError(
        'EMPTY_SEGMENT',
        `第 ${index + 1} 个内容片段为空`,
      );
    }
    if (
      !Number.isInteger(segment.startOffset) ||
      !Number.isInteger(segment.endOffset) ||
      segment.startOffset < 0 ||
      segment.endOffset < segment.startOffset ||
      segment.endOffset > document.rawText.length
    ) {
      throw new DocumentContentError(
        'INVALID_OFFSET',
        `第 ${index + 1} 个内容片段偏移无效`,
      );
    }
    if (segment.startOffset < previousEnd) {
      throw new DocumentContentError(
        'INVALID_OFFSET',
        `第 ${index + 1} 个内容片段与前一片段重叠`,
      );
    }
    if (
      document.rawText.slice(segment.startOffset, segment.endOffset) !==
      segment.text
    ) {
      throw new DocumentContentError(
        'OFFSET_MISMATCH',
        `第 ${index + 1} 个内容片段与原文偏移不一致`,
      );
    }
    previousEnd = segment.endOffset;
  }
}

export function segmentAtOffset(
  document: NormalizedDocument,
  offset: number,
): NormalizedSegment | null {
  return (
    document.segments.find(
      (segment) => segment.startOffset <= offset && offset < segment.endOffset,
    ) ?? null
  );
}
