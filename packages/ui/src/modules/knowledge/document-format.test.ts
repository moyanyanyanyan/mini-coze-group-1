import { describe, expect, it } from 'vitest';
import { documentFormat } from './document-format';

describe('document format label', () => {
  it('shows PNG for image documents with a png file name', () => {
    expect(documentFormat({ sourceType: 'IMAGE', originalFileName: '模块地图.PNG' })).toBe('PNG');
    expect(documentFormat({ sourceType: 'IMAGE', originalFileName: 'scan.png' })).toBe('PNG');
  });

  it('shows JPEG for image documents with jpg or jpeg file names', () => {
    expect(documentFormat({ sourceType: 'IMAGE', originalFileName: 'photo.JPG' })).toBe('JPEG');
    expect(documentFormat({ sourceType: 'IMAGE', originalFileName: 'photo.jpeg' })).toBe('JPEG');
  });

  it('shows 图片 for image documents without a usable file name', () => {
    expect(documentFormat({ sourceType: 'IMAGE', originalFileName: null })).toBe('图片');
    expect(documentFormat({ sourceType: 'IMAGE' })).toBe('图片');
    expect(documentFormat({ sourceType: 'IMAGE', originalFileName: 'archive.bin' })).toBe('图片');
  });

  it('shows DOCX and PPTX for Office documents', () => {
    expect(documentFormat({ sourceType: 'DOCX', originalFileName: 'manual.DOCX' })).toBe('DOCX');
    expect(documentFormat({ sourceType: 'PPTX', originalFileName: 'deck.pptx' })).toBe('PPTX');
  });

  it('keeps non-image source types unchanged', () => {
    expect(documentFormat({ sourceType: 'TEXT', originalFileName: null })).toBe('TEXT');
    expect(documentFormat({ sourceType: 'TXT', originalFileName: 'note.txt' })).toBe('TXT');
    expect(documentFormat({ sourceType: 'JSON', originalFileName: 'data.json' })).toBe('JSON');
    expect(documentFormat({ sourceType: 'PDF', originalFileName: 'manual.pdf' })).toBe('PDF');
  });
});
