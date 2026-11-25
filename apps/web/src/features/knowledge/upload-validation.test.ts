import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_FILE_ACCEPT, knowledgeUploadError } from './upload-validation';

const MIB = 1024 * 1024;

describe('knowledge upload validation', () => {
  it('accepts every supported extension', () => {
    expect(KNOWLEDGE_FILE_ACCEPT).toBe('.txt,.json,.pdf,.png,.jpg,.jpeg');
    for (const name of ['note.txt', 'data.JSON', 'manual.PDF', 'scan.png', 'photo.jpg', 'photo.JPEG']) {
      expect(knowledgeUploadError({ name, size: 1024 })).toBeNull();
    }
  });

  it('rejects unsupported extensions with a format hint', () => {
    for (const name of ['animation.gif', 'vector.svg', 'photo.webp', 'no-extension']) {
      expect(knowledgeUploadError({ name, size: 1024 })).toContain('只支持');
    }
  });

  it('applies the per-type size hints', () => {
    expect(knowledgeUploadError({ name: 'note.txt', size: MIB + 1 })).toContain('1 MiB');
    expect(knowledgeUploadError({ name: 'data.json', size: MIB + 1 })).toContain('1 MiB');
    expect(knowledgeUploadError({ name: 'manual.pdf', size: 64 * MIB + 1 })).toContain('64 MiB');
    expect(knowledgeUploadError({ name: 'scan.png', size: 10 * MIB + 1 })).toContain('10 MiB');
    expect(knowledgeUploadError({ name: 'photo.jpeg', size: 10 * MIB + 1 })).toContain('10 MiB');
  });

  it('accepts files exactly at each limit', () => {
    expect(knowledgeUploadError({ name: 'note.txt', size: MIB })).toBeNull();
    expect(knowledgeUploadError({ name: 'manual.pdf', size: 64 * MIB })).toBeNull();
    expect(knowledgeUploadError({ name: 'scan.png', size: 10 * MIB })).toBeNull();
  });
});
