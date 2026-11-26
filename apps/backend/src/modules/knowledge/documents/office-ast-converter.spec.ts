import type { OfficeAstInput } from './office-ast-converter';
import {
  applyOfficeImageText,
  convertOfficeAst,
  mergeOfficeText,
} from './office-ast-converter';

describe('Office AST conversion', () => {
  it('keeps DOCX paragraphs, table cells, and an inline image in source order', () => {
    const ast: OfficeAstInput = {
      type: 'docx',
      attachments: [
        {
          type: 'image',
          name: 'figure.png',
          extension: 'png',
          mimeType: 'image/png',
          data: 'cG5n',
        },
      ],
      content: [
        { type: 'paragraph', text: ' Intro ' },
        {
          type: 'table',
          children: [
            {
              type: 'row',
              children: [
                {
                  type: 'cell',
                  children: [{ type: 'paragraph', text: 'Alpha' }],
                },
                {
                  type: 'cell',
                  children: [{ type: 'paragraph', text: 'Beta' }],
                },
              ],
            },
            {
              type: 'row',
              children: [
                { type: 'cell', children: [{ type: 'paragraph', text: '1' }] },
                { type: 'cell', children: [{ type: 'paragraph', text: '2' }] },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Tail',
          children: [
            { type: 'text', text: 'Tail' },
            {
              type: 'image',
              metadata: { attachmentName: 'figure.png', altText: 'Figure' },
            },
          ],
        },
      ],
    };

    const result = convertOfficeAst(ast);
    expect(result.rawText).toBe('Intro\n\nAlpha\tBeta\n1\t2\n\nTail');
    expect(result.segments.map((segment) => segment.kind)).toEqual([
      'paragraph',
      'tableCell',
      'tableCell',
      'tableCell',
      'tableCell',
      'paragraph',
    ]);
    for (const segment of result.segments) {
      expect(result.rawText.slice(segment.startOffset, segment.endOffset)).toBe(
        segment.text,
      );
    }
    expect(result.segments[0].source.path).toBe('content.0');
    expect(result.segments[1].source.path).toBe(
      'content.1.children.0.children.0.children.0',
    );
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].blocks.map((block) => block.kind)).toEqual([
      'paragraph',
      'table',
      'paragraph',
    ]);
    expect(result.images).toEqual([
      {
        id: 'image:content.2.children.1',
        attachmentName: 'figure.png',
        attachmentIndex: 0,
        mimeType: 'image/png',
        altText: 'Figure',
        source: { path: 'content.2.children.1' },
      },
    ]);
    expect(result.sections[0].blocks[2]).toMatchObject({
      imageIds: ['image:content.2.children.1'],
    });
    expect(result.attachments[0].data).toBe('cG5n');
    expect(result.unplacedAttachmentIndexes).toEqual([]);
  });

  it('groups PPTX paragraphs by text-box bounds and retains slide/image/notes locations', () => {
    const headingBounds = { x: 0, y: 0, width: 100, height: 20 };
    const bodyBounds = { x: 0, y: 30, width: 100, height: 70 };
    const imageBounds = { x: 120, y: 30, width: 50, height: 50 };
    const ast: OfficeAstInput = {
      type: 'pptx',
      attachments: [
        {
          type: 'image',
          name: 'chart.png',
          extension: 'png',
          mimeType: 'image/png',
          data: 'Y2hhcnQ=',
        },
        {
          type: 'image',
          name: 'unused.png',
          extension: 'png',
          mimeType: 'image/png',
          data: 'dW51c2Vk',
        },
      ],
      content: [
        {
          type: 'slide',
          metadata: { slideNumber: 1 },
          children: [
            { type: 'drawing', bounds: headingBounds },
            {
              type: 'heading',
              text: 'Title',
              bounds: headingBounds,
              metadata: { level: 1 },
            },
            { type: 'paragraph', text: 'Line A', bounds: bodyBounds },
            { type: 'paragraph', text: 'Line B', bounds: bodyBounds },
            {
              type: 'image',
              bounds: imageBounds,
              metadata: { attachmentName: 'chart.png' },
            },
          ],
          notes: [
            {
              type: 'note',
              children: [{ type: 'paragraph', text: 'speaker-only' }],
            },
          ],
        },
        {
          type: 'slide',
          metadata: { slideNumber: 2 },
          children: [
            { type: 'paragraph', text: 'Next', bounds: headingBounds },
          ],
        },
      ],
    };

    const result = convertOfficeAst(ast);
    expect(result.sections.map((section) => section.slideNumber)).toEqual([
      1, 2,
    ]);
    expect(result.sections[0].blocks.map((block) => block.kind)).toEqual([
      'textBox',
      'textBox',
      'image',
    ]);
    expect(result.sections[0].blocks[1]).toMatchObject({
      paragraphs: [{ text: 'Line A' }, { text: 'Line B' }],
    });
    expect(result.sections[0].notes).toMatchObject([{ text: 'speaker-only' }]);
    expect(result.images[0]).toMatchObject({
      attachmentIndex: 0,
      source: {
        path: 'content.0.children.4',
        slideNumber: 1,
        bounds: imageBounds,
      },
    });
    expect(result.rawText).toBe('Title\n\nLine A\nLine B\n\nNext');
    expect(
      result.segments.map((segment) => segment.source.slideNumber),
    ).toEqual([1, 1, 1, 2]);
    for (const segment of result.segments) {
      expect(result.rawText.slice(segment.startOffset, segment.endOffset)).toBe(
        segment.text,
      );
    }
    expect(mergeOfficeText(result)).toBe(result.rawText);
    expect(result.unplacedAttachmentIndexes).toEqual([1]);
  });

  it('keeps table cells whose text is emitted directly without paragraph children', () => {
    const ast: OfficeAstInput = {
      type: 'docx',
      attachments: [],
      content: [
        {
          type: 'table',
          children: [
            {
              type: 'row',
              children: [
                {
                  type: 'cell',
                  text: ' A1 ',
                  metadata: { row: 0, col: 0, style: 'header' },
                },
                {
                  type: 'cell',
                  text: 'B1',
                  metadata: { row: 0, col: 1, style: 'header' },
                },
              ],
            },
            {
              type: 'row',
              children: [
                { type: 'cell', text: 'A2', metadata: { row: 1, col: 0 } },
                { type: 'cell', text: 'B2', metadata: { row: 1, col: 1 } },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOfficeAst(ast);
    expect(result.rawText).toBe('A1\tB1\nA2\tB2');
    const table = result.sections[0].blocks[0];
    if (table.kind !== 'table') {
      throw new Error('expected table block');
    }
    expect(table.rows[0][0]).toMatchObject({
      row: 0,
      column: 0,
      header: true,
    });
    expect(table.rows[0][0].source.path).toBe(
      'content.0.children.0.children.0',
    );
  });

  it('keeps ordered and unordered list semantics in the merged text', () => {
    const ast: OfficeAstInput = {
      type: 'docx',
      attachments: [],
      content: [
        {
          type: 'list',
          text: 'one',
          metadata: {
            listId: '1',
            listType: 'unordered',
            alignment: 'left',
            indentation: 0,
            itemIndex: 0,
          },
          children: [{ type: 'text', text: 'one' }],
        },
        {
          type: 'list',
          text: 'nested',
          metadata: {
            listId: '1',
            listType: 'unordered',
            alignment: 'left',
            indentation: 1,
            itemIndex: 0,
          },
          children: [{ type: 'text', text: 'nested' }],
        },
        {
          type: 'list',
          text: 'first',
          metadata: {
            listId: '2',
            listType: 'ordered',
            alignment: 'left',
            indentation: 0,
            itemIndex: 0,
          },
          children: [{ type: 'text', text: 'first' }],
        },
        {
          type: 'list',
          text: 'second',
          metadata: {
            listId: '2',
            listType: 'ordered',
            alignment: 'left',
            indentation: 0,
            itemIndex: 1,
            marker: 'b)',
          },
          children: [{ type: 'text', text: 'second' }],
        },
      ],
    };

    const result = convertOfficeAst(ast);
    expect(result.rawText).toBe('- one\n  - nested\n\n1. first\nb) second');
    expect(result.sections[0].blocks[0]).toMatchObject({
      list: { listType: 'unordered', level: 0, itemIndex: 0 },
    });
  });

  it('places OCR text at an inline DOCX image and a standalone PPTX image', () => {
    const docx: OfficeAstInput = {
      type: 'docx',
      attachments: [
        {
          type: 'image',
          name: 'inline.png',
          extension: 'png',
          mimeType: 'image/png',
          data: 'aW5saW5l',
        },
      ],
      content: [
        {
          type: 'paragraph',
          text: 'Figure:',
          children: [
            { type: 'text', text: 'Figure:' },
            {
              type: 'image',
              metadata: { attachmentName: 'inline.png', altText: 'Figure' },
            },
          ],
        },
      ],
    };
    const docxResult = convertOfficeAst(docx);
    applyOfficeImageText(
      docxResult,
      new Map([['image:content.0.children.1', 'INLINE OCR']]),
    );
    expect(docxResult.rawText).toBe('Figure:\nINLINE OCR');
    expect(docxResult.images[0].ocrText).toBe('INLINE OCR');
    expect(docxResult.segments.map((segment) => segment.kind)).toEqual([
      'paragraph',
      'imageOcr',
    ]);
    expect(docxResult.segments[1]).toMatchObject({
      text: 'INLINE OCR',
      source: { path: 'content.0.children.1' },
    });

    const pptx: OfficeAstInput = {
      type: 'pptx',
      attachments: [
        {
          type: 'image',
          name: 'slide.png',
          extension: 'png',
          mimeType: 'image/png',
          data: 'c2xpZGU=',
        },
      ],
      content: [
        {
          type: 'slide',
          metadata: { slideNumber: 1 },
          children: [
            {
              type: 'paragraph',
              text: 'Before',
              bounds: { x: 0, y: 0, width: 1, height: 1 },
            },
            { type: 'image', metadata: { attachmentName: 'slide.png' } },
          ],
        },
      ],
    };
    const pptxResult = convertOfficeAst(pptx);
    applyOfficeImageText(
      pptxResult,
      new Map([['image:content.0.children.1', 'SLIDE OCR']]),
    );
    expect(pptxResult.rawText).toBe('Before\n\nSLIDE OCR');
    expect(pptxResult.sections[0].blocks[1]).toMatchObject({
      kind: 'image',
      text: 'SLIDE OCR',
    });
    expect(pptxResult.segments.map((segment) => segment.kind)).toEqual([
      'paragraph',
      'imageOcr',
    ]);
    expect(pptxResult.segments[1].source).toMatchObject({
      path: 'content.0.children.1',
      slideNumber: 1,
    });
  });

  it('rejects formats outside the DOCX/PPTX conversion boundary', () => {
    expect(() =>
      convertOfficeAst({ type: 'xlsx', content: [], attachments: [] }),
    ).toThrow('Unsupported Office format');
  });
});
