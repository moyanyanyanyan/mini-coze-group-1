export const MAX_PDF_DOCUMENT_BYTES = 64 * 1024 * 1024;

// ConfigModule loads the root .env into process.env during application initialization.
// Read at call time so document parsing and upload validation use the same value.
export function pdfMaxBytes(): number {
  const raw = process.env.PDF_MAX_BYTES;
  if (raw === undefined) return MAX_PDF_DOCUMENT_BYTES;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('PDF_MAX_BYTES must be a positive integer of bytes');
  return value;
}
