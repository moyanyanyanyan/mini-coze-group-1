import * as cheerio from 'cheerio';
import { parse as parseCsv } from 'csv-parse/sync';
import { AttachmentError, type AttachmentInput } from '../attachment.types';

/** 统一换行、去 NUL（Postgres text 不接受 \u0000）、折叠多余空行。 */
export function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseText(input: AttachmentInput): string {
  const raw = decodeUtf8(input.bytes);
  switch (input.sourceType) {
    case 'MD':
      return normalizeText(stripFrontMatter(raw));
    case 'HTML':
      return normalizeText(htmlToText(raw));
    case 'CSV':
      return normalizeText(csvToText(raw));
    default:
      throw new AttachmentError('UNSUPPORTED_FILE', `文本解析器不支持 ${input.sourceType}`);
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return text.replace(/^\ufeff/, '');
}

/** Markdown 的 front matter 是给构建工具看的，注入上下文只会浪费预算。 */
function stripFrontMatter(text: string): string {
  if (!text.startsWith('---')) {
    return text;
  }
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg').remove();
  $('br').replaceWith('\n');
  $('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table').each((_, element) => {
    $(element).append('\n');
  });
  return $('body').length > 0 ? $('body').text() : $.root().text();
}

function csvToText(csv: string): string {
  let rows: string[][];
  try {
    rows = parseCsv(csv, {
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as string[][];
  } catch {
    throw new AttachmentError('CORRUPT_FILE', 'CSV 格式无法解析');
  }
  // 用制表符分隔，引号内的逗号/换行原样保留，模型看得懂列结构
  return rows
    .map((row) => row.map((cell) => String(cell).replace(/\t/g, ' ')).join('\t'))
    .join('\n');
}
