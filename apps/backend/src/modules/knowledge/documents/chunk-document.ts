export interface DocumentChunkInput {
  position: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

const BASE_LENGTH = 500;
const OVERLAP_LENGTH = 50;

interface Span { start: number; end: number }

export function chunkDocument(text: string): DocumentChunkInput[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const units: Span[] = [];
  const paragraphBreaks = /\n\s*\n/g;
  let paragraphStart = 0;
  let separator: RegExpExecArray | null;
  while ((separator = paragraphBreaks.exec(normalized)) !== null) {
    addParagraph(paragraphStart, separator.index);
    paragraphStart = separator.index + separator[0].length;
  }
  addParagraph(paragraphStart, normalized.length);

  function addParagraph(start: number, end: number) {
    while (start < end && /\s/.test(normalized[start])) start++;
    while (end > start && /\s/.test(normalized[end - 1])) end--;
    while (start < end) {
      if (end - start <= BASE_LENGTH) {
        units.push({ start, end });
        break;
      }
      const limit = start + BASE_LENGTH;
      let boundary = limit;
      for (let index = limit - 1; index >= start + Math.floor(BASE_LENGTH / 2); index--) {
        if (/[。！？.!?；;\n]/.test(normalized[index])) { boundary = index + 1; break; }
      }
      if (boundary === limit) {
        for (let index = limit - 1; index >= start + Math.floor(BASE_LENGTH / 2); index--) {
          if (/\s/.test(normalized[index])) { boundary = index + 1; break; }
        }
      }
      units.push({ start, end: boundary });
      start = boundary;
      while (start < end && /\s/.test(normalized[start])) start++;
    }
  }

  const bases: Span[] = [];
  for (const unit of units) {
    const current = bases[bases.length - 1];
    if (current && unit.end - current.start <= BASE_LENGTH) current.end = unit.end;
    else bases.push({ ...unit });
  }

  return bases.map((base, position) => {
    if (position === 0) return { position, content: normalized.slice(base.start, base.end), startOffset: base.start, endOffset: base.end };
    const previous = bases[position - 1];
    const overlapStart = Math.max(previous.start, previous.end - OVERLAP_LENGTH);
    const prefix = normalized.slice(overlapStart, previous.end);
    return {
      position,
      content: `${prefix}\n${normalized.slice(base.start, base.end)}`,
      startOffset: overlapStart,
      endOffset: base.end,
    };
  });
}
