export type DocumentSourceType =
  | 'TEXT'
  | 'TXT'
  | 'JSON'
  | 'MD'
  | 'HTML'
  | 'CSV'
  | 'XLSX'
  | 'DOCX'
  | 'PPTX'
  | 'PDF'
  | 'IMAGE';

export interface ExtractInput {
  bytes: Uint8Array;
  filename: string;
}

export interface Extractor {
  sourceType: DocumentSourceType;
  extensions: readonly string[];
  maxBytes: number;
  extract(input: ExtractInput): Promise<string>;
}
