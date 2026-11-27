import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { AttachmentError, type AttachmentInput } from '../attachment.types';
import { normalizeText } from './text.parser';

export async function parseOffice(input: AttachmentInput): Promise<string> {
  switch (input.sourceType) {
    case 'DOCX':
      return parseDocx(input.bytes);
    case 'PPTX':
      return parsePptx(input.bytes);
    case 'XLSX':
      return parseXlsx(input.bytes);
    default:
      throw new AttachmentError('UNSUPPORTED_FILE', `Office 解析器不支持 ${input.sourceType}`);
  }
}

async function parseDocx(bytes: Uint8Array): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return normalizeText(result.value);
  } catch {
    throw new AttachmentError('CORRUPT_FILE', 'Word 文件无法解析');
  }
}

async function parsePptx(bytes: Uint8Array): Promise<string> {
  const zip = await loadZip(bytes, 'PPTX');
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  if (slideNames.length === 0) {
    throw new AttachmentError('CORRUPT_FILE', 'PPTX 中未找到幻灯片');
  }
  const pages: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.file(name)?.async('string');
    if (!xml) {continue;}
    const texts = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXmlEntities(match[1]))
      .filter((text) => text.trim().length > 0);
    if (texts.length > 0) {
      pages.push(`第 ${slideNumber(name)} 页\n${texts.join('\n')}`);
    }
  }
  return normalizeText(pages.join('\n\n'));
}

async function parseXlsx(bytes: Uint8Array): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs 自带的 Buffer 类型与当前 @types/node 的泛型 Buffer 不兼容，这里收窄到它的入参类型
    type XlsxInput = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as XlsxInput);
  } catch {
    throw new AttachmentError('CORRUPT_FILE', 'Excel 文件无法解析');
  }
  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const line = values.map(cellText).join('\t').replace(/\t+$/, '');
      if (line.trim().length > 0) {
        lines.push(line);
      }
    });
    if (lines.length > 0) {
      sheets.push(`工作表 ${sheet.name}\n${lines.join('\n')}`);
    }
  });
  return normalizeText(sheets.join('\n\n'));
}

async function loadZip(bytes: Uint8Array, label: string): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new AttachmentError('CORRUPT_FILE', `${label} 文件已损坏`);
  }
}

function slideNumber(name: string): number {
  return Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const cell = value as {
    richText?: Array<{ text?: string }>;
    text?: unknown;
    result?: unknown;
  };
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part) => part.text ?? '').join('');
  }
  if (cell.result !== undefined) {
    return cellText(cell.result);
  }
  if (typeof cell.text === 'string') {
    return cell.text;
  }
  return '';
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
