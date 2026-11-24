import JSZip from 'jszip';
import { MAX_OFFICE_DOCUMENT_BYTES } from '../document-content';
import type { Extractor } from './types';
import { decodeXmlEntities } from './text-utils';

// 只处理 ppt/slides/slideN.xml，按页码升序提取文本片段。
export function createPptxExtractor(): Extractor {
  return {
    sourceType: 'PPTX',
    extensions: ['.pptx'],
    maxBytes: MAX_OFFICE_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const zip = await JSZip.loadAsync(bytes);
      const slides = Object.keys(zip.files)
        .map((name) => ({
          name,
          match: /^ppt\/slides\/slide(\d+)\.xml$/.exec(name),
        }))
        .filter(
          (item): item is { name: string; match: RegExpExecArray } =>
            item.match !== null,
        )
        .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

      const result: string[] = [];
      for (const slide of slides) {
        const xml = await zip.file(slide.name)!.async('string');
        const paragraphs = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
          .map(([paragraph]) =>
            [...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
              .map((match) => decodeXmlEntities(match[1]))
              .join(''),
          )
          .filter(Boolean);
        if (paragraphs.length > 0) {
          result.push(`# 第 ${slide.match[1]} 页\n${paragraphs.join('\n')}`);
        }
      }
      return result.join('\n\n');
    },
  };
}
