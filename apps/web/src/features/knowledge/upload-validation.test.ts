import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_FILE_ACCEPT, knowledgeUploadError } from './upload-validation';

const MIB = 1024 * 1024;

describe('knowledge upload validation', () => {
  it('accepts every supported extension', () => {
    expect(KNOWLEDGE_FILE_ACCEPT).toBe('.txt,.json,.md,.markdown,.html,.htm,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.xlsx,.csv,.webp');
    for (const name of ['note.txt', 'note.md', 'note.markdown', 'page.html', 'page.htm', 'data.JSON', 'manual.PDF', 'manual.docx', 'deck.pptx', 'scan.png', 'photo.jpg', 'photo.JPEG', 'sheet.xlsx', 'table.csv', 'photo.webp']) {
      expect(knowledgeUploadError({ name, size: 1024 })).toBeNull();
    }
  });

  it('rejects unsupported extensions with a format hint', () => {
    for (const name of ['animation.gif', 'vector.svg', 'no-extension']) {
      expect(knowledgeUploadError({ name, size: 1024 })).toContain('只支持');
    }
  });

  it('applies the per-type size hints', () => {
    expect(knowledgeUploadError({ name: 'note.txt', size: MIB + 1 })).toContain('1 MiB');
    for (const name of ['data.json', 'note.md', 'note.markdown', 'page.html', 'page.htm']) {
      expect(knowledgeUploadError({ name, size: MIB + 1 })).toContain('1 MiB');
      expect(knowledgeUploadError({ name, size: MIB })).toBeNull();
    }
    for (const [name, limit] of [['sheet.xlsx', 20], ['table.csv', 2], ['photo.webp', 5]] as const) {
      expect(knowledgeUploadError({ name, size: limit * MIB })).toBeNull();
      expect(knowledgeUploadError({ name, size: limit * MIB + 1 })).toContain(`${limit} MiB`);
    }
    expect(knowledgeUploadError({ name: 'manual.pdf', size: 64 * MIB + 1 })).toContain('64 MiB');
    expect(knowledgeUploadError({ name: 'manual.docx', size: 32 * MIB + 1 })).toContain('32 MiB');
    expect(knowledgeUploadError({ name: 'deck.pptx', size: 32 * MIB + 1 })).toContain('32 MiB');
    expect(knowledgeUploadError({ name: 'scan.png', size: 10 * MIB + 1 })).toContain('10 MiB');
    expect(knowledgeUploadError({ name: 'photo.jpeg', size: 10 * MIB + 1 })).toContain('10 MiB');
  });

  it('accepts files exactly at each limit', () => {
    expect(knowledgeUploadError({ name: 'note.txt', size: MIB })).toBeNull();
    expect(knowledgeUploadError({ name: 'manual.pdf', size: 64 * MIB })).toBeNull();
    expect(knowledgeUploadError({ name: 'manual.docx', size: 32 * MIB })).toBeNull();
    expect(knowledgeUploadError({ name: 'deck.pptx', size: 32 * MIB })).toBeNull();
    expect(knowledgeUploadError({ name: 'scan.png', size: 10 * MIB })).toBeNull();
  });
});
