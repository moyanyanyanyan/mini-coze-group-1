import type {
  NodeBounds,
  OfficeAttachment,
  OfficeContentNode,
  OfficeParserAST,
} from 'officeparser';

export type OfficeFormat = 'docx' | 'pptx';
export type OfficeAstInput = Pick<
  OfficeParserAST,
  'type' | 'content' | 'attachments'
> &
  Partial<Pick<OfficeParserAST, 'auxiliary'>>;

export interface OfficeSourceLocation {
  /** Stable position in the officeparser content tree, not a page number. */
  path: string;
  slideNumber?: number;
  bounds?: NodeBounds;
}

export interface OfficeListInfo {
  listId?: string;
  listType: 'ordered' | 'unordered';
  /** Zero-based nesting level from the source document. */
  level: number;
  /** Zero-based position within the list. */
  itemIndex: number;
  marker?: string;
}

export interface OfficeParagraphBlock {
  kind: 'paragraph';
  text: string;
  headingLevel?: number;
  list?: OfficeListInfo;
  imageIds: string[];
  source: OfficeSourceLocation;
}

export interface OfficeTableCell {
  blocks: OfficeBlock[];
  row?: number;
  column?: number;
  rowSpan?: number;
  colSpan?: number;
  header?: boolean;
  source: OfficeSourceLocation;
}

export interface OfficeTableBlock {
  kind: 'table';
  rows: OfficeTableCell[][];
  source: OfficeSourceLocation;
}

export interface OfficeTextBoxBlock {
  kind: 'textBox';
  paragraphs: OfficeParagraphBlock[];
  source: OfficeSourceLocation;
}

export interface OfficeImageBlock {
  kind: 'image';
  imageId: string;
  altText?: string;
  /** Recognized text placed at this image's source position, once OCR has run. */
  text?: string;
  source: OfficeSourceLocation;
}

export type OfficeBlock =
  | OfficeParagraphBlock
  | OfficeTableBlock
  | OfficeTextBoxBlock
  | OfficeImageBlock;

export interface OfficeImage {
  id: string;
  attachmentName: string | null;
  attachmentIndex: number | null;
  mimeType?: string;
  altText?: string;
  url?: string;
  /** OCR text for the referenced attachment, shared by every placement of it. */
  ocrText?: string;
  source: OfficeSourceLocation;
}

export interface OfficeSection {
  kind: 'document' | 'slide';
  slideNumber?: number;
  blocks: OfficeBlock[];
  /** Speaker notes are retained but excluded from rawText. */
  notes: OfficeBlock[];
  source: OfficeSourceLocation;
}

export interface NormalizedOfficeDocument {
  format: OfficeFormat;
  sections: OfficeSection[];
  /** Includes the original Base64 data, even for attachments without a placed image node. */
  attachments: OfficeAttachment[];
  images: OfficeImage[];
  /** Attachments with no image node in the AST have bytes but no known placement. */
  unplacedAttachmentIndexes: number[];
  rawText: string;
}

function location(
  node: OfficeContentNode,
  path: string,
  slideNumber?: number,
): OfficeSourceLocation {
  return {
    path,
    ...(slideNumber === undefined ? {} : { slideNumber }),
    ...(node.bounds ? { bounds: { ...node.bounds } } : {}),
  };
}

function normalizedText(value: string | undefined): string {
  return (value ?? '').replace(/\r\n?/g, '\n').trim();
}

function sameBounds(
  left: NodeBounds | undefined,
  right: NodeBounds | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

/** Convert the library AST without changing upload, database, or public API contracts. */
export function convertOfficeAst(
  ast: OfficeAstInput,
): NormalizedOfficeDocument {
  if (ast.type !== 'docx' && ast.type !== 'pptx') {
    throw new Error(`Unsupported Office format: ${ast.type}`);
  }
  const format = ast.type;
  const attachments = ast.attachments;
  const attachmentIndex = new Map(
    attachments.map((attachment, index) => [attachment.name, index]),
  );
  const images: OfficeImage[] = [];

  function collectImages(
    node: OfficeContentNode,
    path: string,
    slideNumber?: number,
  ): void {
    if (node.type === 'slide') {
      slideNumber = node.metadata?.slideNumber ?? slideNumber;
    }
    if (node.type === 'image') {
      const name = node.metadata?.attachmentName ?? null;
      const index = name === null ? null : (attachmentIndex.get(name) ?? null);
      const attachment = index === null ? undefined : attachments[index];
      images.push({
        id: `image:${path}`,
        attachmentName: name,
        attachmentIndex: index,
        ...(attachment ? { mimeType: attachment.mimeType } : {}),
        ...(node.metadata?.altText ? { altText: node.metadata.altText } : {}),
        ...(node.metadata?.url ? { url: node.metadata.url } : {}),
        source: location(node, path, slideNumber),
      });
    }
    node.children?.forEach((child, index) =>
      collectImages(child, `${path}.children.${index}`, slideNumber),
    );
    node.notes?.forEach((note, index) =>
      collectImages(note, `${path}.notes.${index}`, slideNumber),
    );
  }
  ast.content.forEach((node, index) => collectImages(node, `content.${index}`));
  ast.auxiliary?.headers?.forEach((node, index) =>
    collectImages(node, `auxiliary.headers.${index}`),
  );
  ast.auxiliary?.footers?.forEach((node, index) =>
    collectImages(node, `auxiliary.footers.${index}`),
  );
  ast.auxiliary?.slideMasters?.forEach((node, index) =>
    collectImages(node, `auxiliary.slideMasters.${index}`),
  );

  function descendantImageIds(path: string): string[] {
    return images
      .filter((image) => image.source.path.startsWith(`${path}.`))
      .map((image) => image.id);
  }

  function listInfo(
    metadata:
      | {
          listId?: string;
          listType?: 'ordered' | 'unordered';
          indentation?: number;
          itemIndex?: number;
          marker?: string;
        }
      | undefined,
  ): OfficeListInfo | undefined {
    if (!metadata?.listType) {
      return undefined;
    }
    return {
      listType: metadata.listType,
      level: metadata.indentation ?? 0,
      itemIndex: metadata.itemIndex ?? 0,
      ...(metadata.listId === undefined ? {} : { listId: metadata.listId }),
      ...(metadata.marker === undefined ? {} : { marker: metadata.marker }),
    };
  }

  function paragraph(
    node: OfficeContentNode,
    path: string,
    slideNumber?: number,
  ): OfficeParagraphBlock | null {
    const text = normalizedText(node.text);
    const imageIds = descendantImageIds(path);
    if (!text && imageIds.length === 0) {
      return null;
    }
    return {
      kind: 'paragraph',
      text,
      imageIds,
      source: location(node, path, slideNumber),
      ...(node.type === 'heading' && node.metadata?.level
        ? { headingLevel: node.metadata.level }
        : {}),
      ...(node.type === 'list' ? { list: listInfo(node.metadata) } : {}),
    };
  }

  function table(
    node: OfficeContentNode,
    path: string,
    slideNumber?: number,
  ): OfficeTableBlock {
    const rows = (node.children ?? []).flatMap((row, rowIndex) => {
      if (row.type !== 'row') {
        return [];
      }
      const cells = (row.children ?? []).flatMap((cell, cellIndex) => {
        if (cell.type !== 'cell') {
          return [];
        }
        const cellPath = `${path}.children.${rowIndex}.children.${cellIndex}`;
        let blocks = documentBlocks(
          cell.children ?? [],
          `${cellPath}.children`,
          slideNumber,
        );
        // Some converters emit a cell's text directly (no paragraph child), e.g.
        // tables generated from Markdown. Keep that text at the same source path.
        if (blocks.length === 0) {
          const direct = paragraph(cell, cellPath, slideNumber);
          if (direct) {
            blocks = [direct];
          }
        }
        const metadata = cell.metadata;
        return [
          {
            blocks,
            ...(metadata?.row === undefined ? {} : { row: metadata.row }),
            ...(metadata?.col === undefined ? {} : { column: metadata.col }),
            ...(metadata?.rowSpan === undefined
              ? {}
              : { rowSpan: metadata.rowSpan }),
            ...(metadata?.colSpan === undefined
              ? {}
              : { colSpan: metadata.colSpan }),
            ...(metadata?.style === 'header' ||
            (metadata as { isHeader?: boolean } | undefined)?.isHeader === true
              ? { header: true }
              : {}),
            source: location(cell, cellPath, slideNumber),
          },
        ];
      });
      return [cells];
    });
    return { kind: 'table', rows, source: location(node, path, slideNumber) };
  }

  function documentBlocks(
    nodes: OfficeContentNode[],
    prefix: string,
    slideNumber?: number,
  ): OfficeBlock[] {
    const blocks: OfficeBlock[] = [];
    nodes.forEach((node, index) => {
      const path = `${prefix}.${index}`;
      if (
        node.type === 'paragraph' ||
        node.type === 'heading' ||
        node.type === 'code' ||
        node.type === 'list'
      ) {
        const block = paragraph(node, path, slideNumber);
        if (block) {
          blocks.push(block);
        }
      } else if (node.type === 'table') {
        blocks.push(table(node, path, slideNumber));
      } else if (node.type === 'image') {
        blocks.push({
          kind: 'image',
          imageId: `image:${path}`,
          ...(node.metadata?.altText ? { altText: node.metadata.altText } : {}),
          source: location(node, path, slideNumber),
        });
      } else if (node.children?.length) {
        blocks.push(
          ...documentBlocks(node.children, `${path}.children`, slideNumber),
        );
      } else if (normalizedText(node.text)) {
        const block = paragraph(node, path, slideNumber);
        if (block) {
          blocks.push(block);
        }
      }
    });
    return blocks;
  }

  function slideBlocks(
    nodes: OfficeContentNode[],
    prefix: string,
    slideNumber: number,
  ): OfficeBlock[] {
    const blocks: OfficeBlock[] = [];
    let currentBox: OfficeTextBoxBlock | null = null;
    for (const [index, node] of nodes.entries()) {
      const path = `${prefix}.${index}`;
      if (
        node.type === 'paragraph' ||
        node.type === 'heading' ||
        node.type === 'list'
      ) {
        const item = paragraph(node, path, slideNumber);
        if (!item) {
          continue;
        }
        if (
          currentBox &&
          sameBounds(currentBox.source.bounds, item.source.bounds)
        ) {
          currentBox.paragraphs.push(item);
        } else {
          currentBox = {
            kind: 'textBox',
            paragraphs: [item],
            source: location(node, path, slideNumber),
          };
          blocks.push(currentBox);
        }
      } else if (node.type === 'drawing' && !node.children?.length) {
        // A PowerPoint shape often precedes the paragraphs with the same bounds.
        continue;
      } else {
        currentBox = null;
        if (node.type === 'image') {
          blocks.push({
            kind: 'image',
            imageId: `image:${path}`,
            ...(node.metadata?.altText
              ? { altText: node.metadata.altText }
              : {}),
            source: location(node, path, slideNumber),
          });
        } else if (node.type === 'table') {
          blocks.push(table(node, path, slideNumber));
        } else if (node.children?.length) {
          blocks.push(
            ...slideBlocks(node.children, `${path}.children`, slideNumber),
          );
        } else if (normalizedText(node.text)) {
          const item = paragraph(node, path, slideNumber);
          if (item) {
            blocks.push({
              kind: 'textBox',
              paragraphs: [item],
              source: location(node, path, slideNumber),
            });
          }
        }
      }
    }
    return blocks;
  }

  const sections: OfficeSection[] =
    format === 'docx'
      ? [
          {
            kind: 'document',
            blocks: documentBlocks(ast.content, 'content'),
            notes: [],
            source: { path: 'content' },
          },
        ]
      : ast.content.flatMap((slide, index) => {
          if (slide.type !== 'slide') {
            return [];
          }
          const slideNumber = slide.metadata?.slideNumber ?? index + 1;
          const path = `content.${index}`;
          return [
            {
              kind: 'slide' as const,
              slideNumber,
              blocks: slideBlocks(
                slide.children ?? [],
                `${path}.children`,
                slideNumber,
              ),
              notes: documentBlocks(
                slide.notes ?? [],
                `${path}.notes`,
                slideNumber,
              ),
              source: location(slide, path, slideNumber),
            },
          ];
        });
  const result: NormalizedOfficeDocument = {
    format,
    sections,
    attachments,
    images,
    unplacedAttachmentIndexes: attachments.flatMap((_, index) =>
      images.some((image) => image.attachmentIndex === index) ? [] : [index],
    ),
    rawText: '',
  };
  result.rawText = mergeOfficeText(result);
  return result;
}

/** Paragraphs and text boxes use newlines; blocks and slides use a blank line. Images add only their OCR text. */
export function mergeOfficeText(
  document: Pick<NormalizedOfficeDocument, 'sections'>,
): string {
  function paragraphText(block: OfficeParagraphBlock): string {
    if (!block.text) {
      return '';
    }
    if (!block.list) {
      return block.text;
    }
    const indent = '  '.repeat(Math.max(0, block.list.level));
    const marker =
      block.list.marker ??
      (block.list.listType === 'ordered'
        ? `${block.list.itemIndex + 1}.`
        : '-');
    return `${indent}${marker ? `${marker} ` : ''}${block.text}`;
  }

  function blockText(block: OfficeBlock): string {
    if (block.kind === 'paragraph') {
      return paragraphText(block);
    }
    if (block.kind === 'image') {
      return block.text ?? '';
    }
    if (block.kind === 'textBox') {
      return block.paragraphs
        .map((item) => paragraphText(item))
        .filter(Boolean)
        .join('\n');
    }
    return block.rows
      .map((row) =>
        row
          .map((cell) => cell.blocks.map(blockText).filter(Boolean).join('\n'))
          .join('\t'),
      )
      .join('\n');
  }
  function sectionText(section: OfficeSection): string {
    const parts: string[] = [];
    let listRun: string[] = [];
    let listKey: string | undefined;
    const flushList = () => {
      if (listRun.length > 0) {
        parts.push(listRun.join('\n'));
        listRun = [];
      }
      listKey = undefined;
    };
    for (const block of section.blocks) {
      if (block.kind === 'paragraph' && block.list) {
        const key = block.list.listId ?? block.list.listType;
        if (listRun.length > 0 && key !== listKey) {
          flushList();
        }
        listKey = key;
        const text = paragraphText(block);
        if (text) {
          listRun.push(text);
        }
        continue;
      }
      flushList();
      const text = blockText(block);
      if (text) {
        parts.push(text);
      }
    }
    flushList();
    return parts.join('\n\n');
  }

  return document.sections.map(sectionText).filter(Boolean).join('\n\n');
}

/**
 * Places OCR text at each image's source position. DOCX pictures are usually
 * children of a paragraph, so their text is appended to that paragraph; PPTX
 * pictures are standalone blocks and receive their own text. The same attachment
 * reused in several places contributes its text at every placement.
 */
export function applyOfficeImageText(
  document: NormalizedOfficeDocument,
  texts: ReadonlyMap<string, string>,
): NormalizedOfficeDocument {
  for (const image of document.images) {
    const text = texts.get(image.id);
    if (text) {
      image.ocrText = text;
    }
  }

  function applyParagraph(paragraph: OfficeParagraphBlock): void {
    const additions = [...new Set(paragraph.imageIds)]
      .map((id) => texts.get(id))
      .filter((text): text is string => Boolean(text));
    if (additions.length > 0) {
      paragraph.text = [paragraph.text, ...additions]
        .filter(Boolean)
        .join('\n');
    }
  }

  function applyBlocks(blocks: OfficeBlock[]): void {
    for (const block of blocks) {
      if (block.kind === 'paragraph') {
        applyParagraph(block);
      } else if (block.kind === 'textBox') {
        block.paragraphs.forEach(applyParagraph);
      } else if (block.kind === 'table') {
        for (const row of block.rows) {
          for (const cell of row) {
            applyBlocks(cell.blocks);
          }
        }
      } else if (block.kind === 'image') {
        const text = texts.get(block.imageId);
        if (text) {
          block.text = text;
        }
      }
    }
  }

  document.sections.forEach((section) => {
    applyBlocks(section.blocks);
    applyBlocks(section.notes);
  });
  document.rawText = mergeOfficeText(document);
  return document;
}
