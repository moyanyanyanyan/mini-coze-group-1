export const KNOWLEDGE_FILE_ACCEPT = '.txt,.json,.md,.markdown,.html,.htm,.pdf,.docx,.pptx,.png,.jpg,.jpeg';

const MIB = 1024 * 1024;

export interface KnowledgeUploadCandidate {
  name: string;
  size: number;
}

/**
 * Mirrors the Backend per-type limits so the browser can reject an obviously invalid
 * file before uploading it. The Backend remains the authoritative validator.
 */
export function knowledgeUploadError(file: KnowledgeUploadCandidate): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (extension === '.txt' || extension === '.json' || ['.md', '.markdown', '.html', '.htm'].includes(extension)) {
    return file.size > MIB ? 'TXT / JSON / MD / HTML 文件不能超过 1 MiB' : null;
  }
  if (extension === '.pdf') {
    return file.size > 64 * MIB ? 'PDF 文件不能超过 64 MiB' : null;
  }
  if (extension === '.docx' || extension === '.pptx') {
    return file.size > 32 * MIB ? 'DOCX / PPTX 文件不能超过 32 MiB' : null;
  }
  if (extension === '.png' || extension === '.jpg' || extension === '.jpeg') {
    return file.size > 10 * MIB ? 'PNG / JPG / JPEG 图片不能超过 10 MiB' : null;
  }
  return '只支持 TXT、JSON、MD、HTML、PDF、DOCX、PPTX、PNG、JPG、JPEG 文件';
}
