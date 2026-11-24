import ExcelJS from 'exceljs';
import { MAX_OFFICE_DOCUMENT_BYTES } from '../document-content';
import type { Extractor } from './types';

// 逐工作表输出，保留表名与行结构，单元格用制表符分隔。
export function createXlsxExtractor(): Extractor {
  return {
    sourceType: 'XLSX',
    extensions: ['.xlsx'],
    maxBytes: MAX_OFFICE_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const workbook = new ExcelJS.Workbook();
      // exceljs 自带同名 Buffer 接口，与 Node Buffer 泛型不兼容，运行时仍是二进制数据。
      await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);

      const sections: string[] = [];
      workbook.eachSheet((sheet) => {
        const lines = [`# ${sheet.name}`];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const cells = (row.values as unknown[])
            .slice(1)
            .map(formatCell)
            .join('\t')
            .trimEnd();
          if (cells) {
            lines.push(cells);
          }
        });
        sections.push(lines.join('\n'));
      });
      return sections.join('\n\n');
    },
  };
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const cell = value as Record<string, unknown>;
    if (Array.isArray(cell.richText)) {
      return cell.richText
        .map((item) => String((item as { text?: unknown }).text ?? ''))
        .join('');
    }
    if ('formula' in cell || 'sharedFormula' in cell) {
      return formatCell(cell.result);
    }
    if ('text' in cell) {
      return String(cell.text ?? '');
    }
    if ('error' in cell) {
      return String(cell.error ?? '');
    }
  }
  return String(value);
}
