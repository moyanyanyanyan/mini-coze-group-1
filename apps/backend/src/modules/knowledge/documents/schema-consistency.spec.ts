import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_SOURCE_TYPES = [
  'TEXT',
  'TXT',
  'JSON',
  'PDF',
  'IMAGE',
  'DOCX',
  'PPTX',
  'MARKDOWN',
  'MD',
  'XLSX',
  'CSV',
  'PNG',
  'JPG',
  'JPEG',
  'WEBP',
  'HTML',
] as const;

describe('knowledge schema source types', () => {
  it('keeps every historical file type in the shared enum', () => {
    const schema = readFileSync(
      resolve(__dirname, '../../../../prisma/schema/knowledge.prisma'),
      'utf8',
    );
    const enumBody = /enum\s+KnowledgeDocumentSourceType\s*\{([\s\S]*?)\}/.exec(schema)?.[1];
    expect(enumBody).toBeDefined();

    const values = (enumBody ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//'));

    expect(values).toEqual([...EXPECTED_SOURCE_TYPES]);
  });
});
