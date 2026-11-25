import type { KnowledgeSourceKind, KnowledgeSourceRange } from './types';

const KIND_LABELS: Record<KnowledgeSourceKind, string> = {
  paragraph: '段落',
  heading: '标题',
  listItem: '列表',
  tableCell: '表格单元格',
  imageOcr: '图片 OCR',
};

function contentIndex(path: string): number | null {
  const match = /^content\.(\d+)/u.exec(path);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index + 1 : null;
}

/** De-duplicates repeated chunk ranges so a paragraph is shown once. */
export function uniqueSourceRanges(
  ranges: readonly KnowledgeSourceRange[],
): KnowledgeSourceRange[] {
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = [
      range.path,
      range.slideNumber ?? '',
      range.kind,
      range.overlap ? '1' : '0',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Human-readable source label: PPT slide, Word paragraph, table cell or OCR image. */
export function describeSourceRange(
  range: KnowledgeSourceRange,
  sourceType?: string,
): string {
  const kind = KIND_LABELS[range.kind];
  if (range.slideNumber !== undefined) {
    return `PPT 第 ${range.slideNumber} 页 · ${kind}`;
  }
  if (sourceType === 'PPTX') {
    return `PPT · ${kind}`;
  }
  const index = contentIndex(range.path);
  if (range.kind === 'tableCell') {
    return `Word 表格${index === null ? '' : ` ${index}`} · 单元格`;
  }
  if (range.kind === 'imageOcr') {
    return 'Word 图片 OCR';
  }
  return `Word ${kind}${index === null ? '' : ` ${index}`}`;
}
