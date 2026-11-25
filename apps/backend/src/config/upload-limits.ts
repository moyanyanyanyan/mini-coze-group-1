export const MAX_PDF_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_IMAGE_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_OFFICE_DOCUMENT_BYTES = 32 * 1024 * 1024;

// ConfigModule loads the root .env into process.env during application initialization.
// Read at call time so document parsing and upload validation use the same value.
export function pdfMaxBytes(): number {
  const raw = process.env.PDF_MAX_BYTES;
  if (raw === undefined) return MAX_PDF_DOCUMENT_BYTES;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('PDF_MAX_BYTES must be a positive integer of bytes');
  return value;
}

// Shares OCR_IMAGE_MAX_BYTES with the OCR Worker so Backend upload validation and
// the Worker's own image limit cannot drift apart.
export function imageMaxBytes(): number {
  const raw = process.env.OCR_IMAGE_MAX_BYTES;
  if (raw === undefined) return MAX_IMAGE_DOCUMENT_BYTES;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('OCR_IMAGE_MAX_BYTES must be a positive integer of bytes');
  return value;
}

// DOCX/PPTX are ZIP/OOXML packages. Keep the compressed upload considerably
// smaller than the existing PDF ceiling so decompression remains bounded.
export function officeMaxBytes(): number {
  const raw = process.env.OFFICE_MAX_BYTES;
  if (raw === undefined) return MAX_OFFICE_DOCUMENT_BYTES;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('OFFICE_MAX_BYTES must be a positive integer of bytes');
  return value;
}
