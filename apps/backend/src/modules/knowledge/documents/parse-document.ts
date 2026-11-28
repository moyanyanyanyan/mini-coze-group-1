import {
  DocumentContentError,
  decodeDocumentBytes,
  extractDocumentText,
} from './document-content';
import { parseHtmlDocument } from './html-document';
import { parseMarkdownDocument } from './markdown-document';
import {
  assertNormalizedDocument,
  DocumentFormat,
  NormalizedDocument,
  NormalizedSegment,
} from './normalized-document';

export type ParsedSourceType = 'TEXT' | 'TXT' | 'JSON' | 'MARKDOWN' | 'HTML';

/**
 * Synchronous entry point for UTF-8 text document formats.
 *
 * Markdown and HTML deliberately use different parsers/converters, but this
 * function is shared by the indexing service. Binary PDF, image and Office
 * extraction is asynchronous and adapted by that service before chunking. This
 * keeps `rawText + segments` a stable contract even as formats are added.
 */
export function parseNormalizedDocument(
  sourceType: ParsedSourceType,
  bytes: Uint8Array,
): NormalizedDocument {
  switch (sourceType) {
    case 'MARKDOWN':
      return parseMarkdownDocument(decodeDocumentBytes(bytes));
    case 'HTML':
      return parseHtmlDocument(decodeDocumentBytes(bytes));
    case 'TEXT':
    case 'TXT':
    case 'JSON':
      return plainTextDocument(
        sourceType,
        extractDocumentText(sourceType, bytes),
      );
    default:
      throw new DocumentContentError('UNSUPPORTED_FILE', '文件类型不支持');
  }
}

/**
 * TXT/JSON already arrive as plain text. Keep the original coordinate system
 * and slice paragraph segments out of it instead of rebuilding the string.
 */
export function plainTextDocument(
  format: Exclude<DocumentFormat, 'MARKDOWN' | 'HTML'>,
  text: string,
): NormalizedDocument {
  if (!text.trim()) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }

  const segments: NormalizedSegment[] = [];
  const paragraphBreak = /\n[ \t]*\n+/g;
  let paragraphStart = 0;

  const addParagraph = (start: number, end: number) => {
    while (start < end && /\s/.test(text[start])) {
      start += 1;
    }
    while (end > start && /\s/.test(text[end - 1])) {
      end -= 1;
    }
    if (start >= end) {
      return;
    }
    segments.push({
      kind: 'paragraph',
      text: text.slice(start, end),
      startOffset: start,
      endOffset: end,
    });
  };

  let separator: RegExpExecArray | null;
  while ((separator = paragraphBreak.exec(text)) !== null) {
    addParagraph(paragraphStart, separator.index);
    paragraphStart = separator.index + separator[0].length;
  }
  addParagraph(paragraphStart, text.length);

  if (segments.length === 0) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }

  const document: NormalizedDocument = {
    format,
    title: null,
    rawText: text,
    segments,
  };
  assertNormalizedDocument(document);
  return document;
}
