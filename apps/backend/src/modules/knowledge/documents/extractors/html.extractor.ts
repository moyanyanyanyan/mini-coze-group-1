import { load } from 'cheerio';
import { MAX_TEXT_DOCUMENT_BYTES } from '../document-content';
import type { Extractor } from './types';
import { decodeUtf8, normalizeWhitespace } from './text-utils';

// 移除脚本、样式与模板节点，只保留正文文本。
export function createHtmlExtractor(): Extractor {
  return {
    sourceType: 'HTML',
    extensions: ['.html', '.htm'],
    maxBytes: MAX_TEXT_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const $ = load(decodeUtf8(bytes));
      $('script, style, noscript, template').remove();
      const text = $('body').length > 0 ? $('body').text() : $.root().text();
      return normalizeWhitespace(text);
    },
  };
}
