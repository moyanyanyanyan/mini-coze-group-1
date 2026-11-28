import type { OfficeParserAST } from 'officeparser';
import { parseOffice } from 'officeparser';
import {
  extractOfficeDocument,
  MAX_OFFICE_ATTACHMENTS,
  MAX_OFFICE_OCR_IMAGES,
  MAX_OFFICE_TEXT_CHARS,
  OFFICE_DECOMPRESSION_LIMITS,
  OFFICE_PARSE_TIMEOUT_MS,
} from './office-document-content';

jest.mock('officeparser', () => ({ parseOffice: jest.fn() }));

const parseOfficeMock = jest.mocked(parseOffice);

function ast(overrides: Partial<OfficeParserAST> = {}): OfficeParserAST {
  return {
    type: 'docx',
    content: [{ type: 'paragraph', text: 'safe text' }],
    attachments: [],
    warnings: [],
    ...overrides,
  } as unknown as OfficeParserAST;
}

function worker() {
  return {
    recognizeImage: jest.fn().mockResolvedValue({
      status: 'ok',
      pages: [
        {
          pageNumber: 1,
          method: 'ocr',
          text: 'ocr',
          regions: [],
          elapsedMs: 1,
          renderDpi: null,
          width: null,
          height: null,
        },
      ],
    }),
  };
}

describe('Office resource limits', () => {
  beforeEach(() => {
    parseOfficeMock.mockReset();
  });

  it('passes decompression and timeout budgets to officeparser', async () => {
    parseOfficeMock.mockResolvedValue(ast());
    await extractOfficeDocument(Buffer.from('PK'), 'safe.docx', worker());

    expect(OFFICE_PARSE_TIMEOUT_MS).toBe(120_000);
    expect(OFFICE_DECOMPRESSION_LIMITS).toMatchObject({
      maxUncompressedBytes: 128 * 1024 * 1024,
      maxZipEntries: 2_000,
      maxTableCells: 200_000,
      maxXmlElements: 1_000_000,
      maxRepeatedContent: 8 * 1024 * 1024,
    });
    expect(parseOfficeMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    ['ZIP_SIZE_LIMIT_EXCEEDED', 'OFFICE_RESOURCE_LIMIT'],
    ['ZIP_ENTRY_COUNT_LIMIT_EXCEEDED', 'OFFICE_RESOURCE_LIMIT'],
    ['XML_ELEMENT_LIMIT_EXCEEDED', 'OFFICE_RESOURCE_LIMIT'],
    ['OPERATION_ABORTED', 'OFFICE_PARSE_TIMEOUT'],
  ] as const)('maps officeparser error %s to %s', async (officeCode, code) => {
    parseOfficeMock.mockRejectedValue({
      officeIssue: { code: officeCode },
    });
    await expect(
      extractOfficeDocument(Buffer.from('PK'), 'safe.docx', worker()),
    ).rejects.toMatchObject({ code });
  });

  it.each([
    'TABLE_CELL_LIMIT_EXCEEDED',
    'REPEATED_CONTENT_LIMIT_EXCEEDED',
    'RAW_CONTENT_LIMIT_EXCEEDED',
  ])('fails closed on truncating warning %s', async (warningCode) => {
    parseOfficeMock.mockResolvedValue(
      ast({ warnings: [{ code: warningCode } as never] }),
    );
    await expect(
      extractOfficeDocument(Buffer.from('PK'), 'safe.docx', worker()),
    ).rejects.toMatchObject({ code: 'OFFICE_RESOURCE_LIMIT' });
  });

  it('rejects too many attachments before AST conversion', async () => {
    parseOfficeMock.mockResolvedValue(
      ast({
        attachments: Array.from(
          { length: MAX_OFFICE_ATTACHMENTS + 1 },
          () => ({
            type: 'image',
            name: 'image.png',
            mimeType: 'image/png',
            extension: 'png',
            data: 'cG5n',
          }),
        ),
      }),
    );
    await expect(
      extractOfficeDocument(Buffer.from('PK'), 'safe.docx', worker()),
    ).rejects.toMatchObject({ code: 'OFFICE_RESOURCE_LIMIT' });
  });

  it('caps OCR requests per document', async () => {
    const count = MAX_OFFICE_OCR_IMAGES + 1;
    const attachments = Array.from({ length: count }, (_, index) => ({
      type: 'image' as const,
      name: `image${index}.png`,
      mimeType: 'image/png' as const,
      extension: 'png',
      data: 'cG5n',
    }));
    parseOfficeMock.mockResolvedValue(
      ast({
        content: Array.from({ length: count }, (_, index) => ({
          type: 'paragraph' as const,
          text: '',
          children: [
            {
              type: 'image' as const,
              metadata: { attachmentName: `image${index}.png` },
            },
          ],
        })),
        attachments,
      }),
    );
    const ocr = worker();
    const result = await extractOfficeDocument(
      Buffer.from('PK'),
      'images.docx',
      ocr,
    );

    expect(ocr.recognizeImage).toHaveBeenCalledTimes(MAX_OFFICE_OCR_IMAGES);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'IMAGE_OCR_LIMIT_REACHED' }),
    );
  });

  it('rejects extracted text over the character budget', async () => {
    parseOfficeMock.mockResolvedValue(
      ast({
        content: [
          { type: 'paragraph', text: 'a'.repeat(MAX_OFFICE_TEXT_CHARS + 1) },
        ],
      }),
    );
    await expect(
      extractOfficeDocument(Buffer.from('PK'), 'large.docx', worker()),
    ).rejects.toMatchObject({ code: 'OFFICE_TEXT_TOO_LARGE' });
  });
});
