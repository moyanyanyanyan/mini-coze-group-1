import { parse } from 'csv-parse/sync';
import { MAX_TEXT_DOCUMENT_BYTES } from '../document-content';
import type { Extractor } from './types';

// 按记录解析后逐行拼接，避免引号内逗号与跨行字段被截断。
export function createCsvExtractor(): Extractor {
  return {
    sourceType: 'CSV',
    extensions: ['.csv'],
    maxBytes: MAX_TEXT_DOCUMENT_BYTES,
    async extract({ bytes }) {
      const records = parse(Buffer.from(bytes), {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as string[][];
      return records.map((row) => row.join('\t')).join('\n');
    },
  };
}
