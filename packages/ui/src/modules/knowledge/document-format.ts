export interface DocumentFormatSource {
  sourceType: string;
  originalFileName?: string | null;
}

/**
 * Formats the "format" label shown in the document list, the detail drawer and the
 * reading page. Image documents carry the IMAGE source type; when the original file
 * name is available it is used to show PNG/JPEG instead of the generic category.
 */
export function documentFormat(document: DocumentFormatSource): string {
  const filename = document.originalFileName ?? '';
  if (/\.png$/iu.test(filename)) return 'PNG';
  if (/\.jpe?g$/iu.test(filename)) return 'JPEG';
  if (/\.docx$/iu.test(filename)) return 'DOCX';
  if (/\.pptx$/iu.test(filename)) return 'PPTX';
  return document.sourceType === 'IMAGE' ? '图片' : document.sourceType;
}
