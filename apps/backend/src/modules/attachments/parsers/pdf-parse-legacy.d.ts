declare module 'pdf-parse-legacy' {
  // Chat attachments retain main's v1 API; knowledge documents use PDFParse v2.
  export default function pdfParse(bytes: Buffer): Promise<{ text: string }>;
}
