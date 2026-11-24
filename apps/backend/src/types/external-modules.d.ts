declare module 'mammoth' {
  export interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }

  export function extractRawText(input: { buffer: Buffer }): Promise<ExtractRawTextResult>;
}

declare module 'csv-parse/sync' {
  export interface ParseOptions {
    bom?: boolean;
    skip_empty_lines?: boolean;
    relax_column_count?: boolean;
    [key: string]: unknown;
  }

  export function parse(input: string | Buffer, options?: ParseOptions): unknown;
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }

  function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export = pdfParse;
}
