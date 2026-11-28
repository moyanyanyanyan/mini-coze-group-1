import * as cheerio from 'cheerio';
import { DocumentContentError } from './document-content';
import {
  NormalizedDocument,
  NormalizedDocumentBuilder,
  normalizeTitle,
} from './normalized-document';

/**
 * Minimal structural view of a parse5/domhandler node. We only rely on the
 * stable fields used by every cheerio AST node, so the adapter does not depend
 * on a second DOM package just for types.
 */
interface DomNode {
  type: string;
  name?: string;
  data?: string;
  children?: DomNode[];
  attribs?: Record<string, string>;
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'nav',
  'footer',
  'aside',
  'menu',
  'dialog',
]);

const BLOCK_TAGS = new Set([
  'html',
  'body',
  'main',
  'article',
  'section',
  'div',
  'header',
  'hgroup',
  'figure',
  'figcaption',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'address',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'table',
  'pre',
  'blockquote',
  'hr',
]);

const SKIPPED_ROLES = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'search',
  'menu',
  'menubar',
  'dialog',
  'alertdialog',
]);

const BOILERPLATE_CLASS_TOKENS = new Set([
  'nav',
  'navbar',
  'navigation',
  'menu',
  'footer',
  'sidebar',
  'breadcrumb',
  'breadcrumbs',
  'cookie',
  'cookies',
  'consent',
  'ad',
  'ads',
  'advert',
  'advertisement',
  'social',
  'share',
  'related',
  'comments',
  'comment',
  'promo',
]);

/**
 * HTML adapter: parse with cheerio, pick the main content root, then walk the
 * DOM while dropping navigation, footer, sidebar, cookie and advert subtrees.
 */
export function parseHtmlDocument(source: string): NormalizedDocument {
  const normalizedSource = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  if (!normalizedSource.trim()) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(normalizedSource);
  } catch (error) {
    throw new DocumentContentError(
      'INVALID_HTML',
      `HTML 解析失败：${error instanceof Error ? error.message : '格式无效'}`,
    );
  }

  const body = asDomNode($('body').get(0)) ?? asDomNode($.root().get(0));
  if (!body) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }

  const root = pickContentRoot($, body);
  const builder = new NormalizedDocumentBuilder();
  walkBlocks(root, builder);

  const title = normalizeTitle(
    normalizeInlineText($('title').first().text()) ||
      normalizeInlineText($('h1').first().text()),
  );
  return builder.build('HTML', title);
}

function asDomNode(node: unknown): DomNode | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  return node as DomNode;
}

function pickContentRoot($: cheerio.CheerioAPI, body: DomNode): DomNode {
  const candidates: DomNode[] = [];
  for (const selector of ['main', '[role="main"]', 'article']) {
    for (const node of $(selector).toArray()) {
      const candidate = asDomNode(node);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  let best: DomNode | undefined;
  let bestLength = 0;
  for (const candidate of candidates) {
    const length = textContent(candidate).length;
    if (length > bestLength) {
      best = candidate;
      bestLength = length;
    }
  }

  if (best && bestLength > 0) {
    return best;
  }
  return body;
}

function walkBlocks(node: DomNode, builder: NormalizedDocumentBuilder): void {
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      const text = normalizeInlineText(child.data ?? '');
      if (text) {
        builder.append(text, { kind: 'paragraph' });
      }
      continue;
    }
    if (child.type !== 'tag') {
      continue;
    }
    processElement(child, builder);
  }
}

function processElement(
  node: DomNode,
  builder: NormalizedDocumentBuilder,
): void {
  const tag = (node.name ?? '').toLowerCase();
  if (shouldSkip(node)) {
    return;
  }

  if (HEADING_TAGS.has(tag)) {
    const text = textContent(node);
    if (text) {
      builder.append(text, { kind: 'heading', level: Number(tag.slice(1)) });
    }
    return;
  }

  switch (tag) {
    case 'p': {
      const text = textContent(node);
      if (text) {
        builder.append(text, { kind: 'paragraph' });
      }
      return;
    }
    case 'ul':
    case 'ol':
    case 'dl': {
      const text = tag === 'dl' ? renderDefinitionList(node) : renderList(node);
      if (text) {
        builder.append(text, { kind: 'list' });
      }
      return;
    }
    case 'table': {
      const text = renderTable(node);
      if (text) {
        builder.append(text, { kind: 'table' });
      }
      return;
    }
    case 'pre': {
      const text = renderCodeBlock(node);
      if (text) {
        builder.append(text, { kind: 'code', language: codeLanguage(node) });
      }
      return;
    }
    case 'blockquote': {
      const text = renderQuote(node);
      if (text) {
        builder.append(text, { kind: 'quote' });
      }
      return;
    }
    case 'hr': {
      builder.append('---', { kind: 'thematicBreak' });
      return;
    }
    case 'figcaption': {
      const text = textContent(node);
      if (text) {
        builder.append(text, { kind: 'paragraph' });
      }
      return;
    }
    default: {
      if (BLOCK_TAGS.has(tag) || hasBlockChild(node)) {
        walkBlocks(node, builder);
        return;
      }
      const text = textContent(node);
      if (text) {
        builder.append(text, { kind: 'paragraph' });
      }
    }
  }
}

function shouldSkip(node: DomNode): boolean {
  const tag = (node.name ?? '').toLowerCase();
  if (SKIPPED_TAGS.has(tag)) {
    return true;
  }

  const attributes = node.attribs ?? {};
  if ('hidden' in attributes) {
    return true;
  }
  if ((attributes['aria-hidden'] ?? '').toLowerCase() === 'true') {
    return true;
  }
  if (
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
      attributes.style ?? '',
    )
  ) {
    return true;
  }

  const role = (attributes.role ?? '').toLowerCase();
  if (SKIPPED_ROLES.has(role)) {
    return true;
  }

  if (tag === 'header') {
    if (
      role === 'banner' ||
      containsTag(node, 'nav') ||
      hasBoilerplateClass(node)
    ) {
      return true;
    }
    // A site header made only of links is boilerplate; an article header that
    // carries the page heading is content.
    if (!containsHeading(node)) {
      return true;
    }
  }

  return hasBoilerplateClass(node);
}

function containsHeading(node: DomNode): boolean {
  for (const child of node.children ?? []) {
    if (child.type !== 'tag') {
      continue;
    }
    if (HEADING_TAGS.has((child.name ?? '').toLowerCase())) {
      return true;
    }
    if (containsHeading(child)) {
      return true;
    }
  }
  return false;
}

function hasBoilerplateClass(node: DomNode): boolean {
  const attributes = node.attribs ?? {};
  const tokens = `${attributes.class ?? ''} ${attributes.id ?? ''}`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return tokens.some((token) => {
    const normalized = token.replace(/_/g, '-');
    if (BOILERPLATE_CLASS_TOKENS.has(normalized)) {
      return true;
    }
    if (
      /^(?:cookie|consent|advert|advertisement|newsletter|sidebar|breadcrumb|social-share|share-bar)(?:-|$)/.test(
        normalized,
      )
    ) {
      return true;
    }
    return /^(?:site|page|global)-(?:header|footer|nav|navigation|sidebar)$/.test(
      normalized,
    );
  });
}

function containsTag(node: DomNode, tag: string): boolean {
  for (const child of node.children ?? []) {
    if (child.type !== 'tag') {
      continue;
    }
    if ((child.name ?? '').toLowerCase() === tag) {
      return true;
    }
    if (containsTag(child, tag)) {
      return true;
    }
  }
  return false;
}

function hasBlockChild(node: DomNode): boolean {
  return (node.children ?? []).some(
    (child) =>
      child.type === 'tag' && BLOCK_TAGS.has((child.name ?? '').toLowerCase()),
  );
}

function textContent(node: DomNode): string {
  const parts: string[] = [];
  collectText(node, parts);
  return normalizeInlineText(parts.join(''));
}

function collectText(node: DomNode, parts: string[]): void {
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      parts.push(child.data ?? '');
      continue;
    }
    if (child.type !== 'tag') {
      continue;
    }
    const tag = (child.name ?? '').toLowerCase();
    if (SKIPPED_TAGS.has(tag) || tag === 'svg') {
      continue;
    }
    if (tag === 'br') {
      parts.push(' ');
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      parts.push(' ');
    }
    collectText(child, parts);
    if (BLOCK_TAGS.has(tag)) {
      parts.push(' ');
    }
  }
}

function textContentSkipping(node: DomNode, skipped: Set<string>): string {
  const parts: string[] = [];
  collectTextSkipping(node, parts, skipped);
  return normalizeInlineText(parts.join(''));
}

function collectTextSkipping(
  node: DomNode,
  parts: string[],
  skipped: Set<string>,
): void {
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      parts.push(child.data ?? '');
      continue;
    }
    if (child.type !== 'tag') {
      continue;
    }
    const tag = (child.name ?? '').toLowerCase();
    if (skipped.has(tag) || SKIPPED_TAGS.has(tag)) {
      continue;
    }
    if (tag === 'br') {
      parts.push(' ');
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      parts.push(' ');
    }
    collectTextSkipping(child, parts, skipped);
    if (BLOCK_TAGS.has(tag)) {
      parts.push(' ');
    }
  }
}

function renderList(node: DomNode, depth = 0): string {
  const ordered = (node.name ?? '').toLowerCase() === 'ol';
  const parsedStart = Number.parseInt(node.attribs?.start ?? '', 10);
  const start =
    Number.isInteger(parsedStart) && parsedStart > 0 ? parsedStart : 1;
  const lines: string[] = [];
  let index = 0;

  for (const child of node.children ?? []) {
    if (child.type !== 'tag' || (child.name ?? '').toLowerCase() !== 'li') {
      continue;
    }
    const marker = ordered ? `${start + index}. ` : '- ';
    index += 1;

    const text = textContentSkipping(child, new Set(['ul', 'ol']));
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${marker}${text}`.trimEnd());

    for (const nested of child.children ?? []) {
      if (nested.type !== 'tag') {
        continue;
      }
      const nestedTag = (nested.name ?? '').toLowerCase();
      if (nestedTag === 'ul' || nestedTag === 'ol') {
        const nestedText = renderList(nested, depth + 1);
        if (nestedText) {
          lines.push(nestedText);
        }
      }
    }
  }

  return lines.join('\n');
}

function renderDefinitionList(node: DomNode): string {
  const lines: string[] = [];
  for (const child of node.children ?? []) {
    if (child.type !== 'tag') {
      continue;
    }
    const tag = (child.name ?? '').toLowerCase();
    if (tag !== 'dt' && tag !== 'dd') {
      continue;
    }
    const text = textContent(child);
    if (!text) {
      continue;
    }
    lines.push(tag === 'dt' ? `${text}` : `- ${text}`);
  }
  return lines.join('\n');
}

function renderTable(node: DomNode): string {
  const rows: DomNode[] = [];
  collectTableRows(node, rows);
  if (rows.length === 0) {
    return '';
  }

  const rendered = rows
    .map((row) => {
      const cells = row.children ?? [];
      return cells
        .filter(
          (cell) =>
            cell.type === 'tag' &&
            ['th', 'td'].includes((cell.name ?? '').toLowerCase()),
        )
        .map((cell) => textContent(cell).replace(/\|/g, '\\|'));
    })
    .filter((cells) => cells.length > 0);

  if (rendered.length === 0) {
    return '';
  }
  const width = Math.max(...rendered.map((row) => row.length));
  const normalizeRow = (row: string[]) => {
    const padded = [...row];
    while (padded.length < width) {
      padded.push('');
    }
    return `| ${padded.join(' | ')} |`;
  };

  return [
    normalizeRow(rendered[0]),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...rendered.slice(1).map(normalizeRow),
  ].join('\n');
}

function collectTableRows(node: DomNode, rows: DomNode[]): void {
  for (const child of node.children ?? []) {
    if (child.type !== 'tag') {
      continue;
    }
    const tag = (child.name ?? '').toLowerCase();
    if (tag === 'tr') {
      rows.push(child);
      continue;
    }
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      collectTableRows(child, rows);
    }
  }
}

function codeLanguage(node: DomNode): string | undefined {
  const code = findFirstTag(node, 'code') ?? node;
  const className = code.attribs?.class ?? '';
  const match = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/i.exec(className);
  const declared = (
    code.attribs?.['data-lang'] ??
    node.attribs?.['data-lang'] ??
    ''
  ).trim();
  return (match?.[1] ?? declared) || undefined;
}

function findFirstTag(node: DomNode, tag: string): DomNode | undefined {
  for (const child of node.children ?? []) {
    if (child.type !== 'tag') {
      continue;
    }
    if ((child.name ?? '').toLowerCase() === tag) {
      return child;
    }
    const nested = findFirstTag(child, tag);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function renderCodeBlock(node: DomNode): string {
  const codeNode = findFirstTag(node, 'code') ?? node;
  const code = rawTextContent(codeNode)
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '');
  if (!code.trim()) {
    return '';
  }
  const fence = code.includes('```') ? '````' : '```';
  const language = codeLanguage(node) ?? '';
  return `${fence}${language}\n${code}\n${fence}`;
}

function rawTextContent(node: DomNode): string {
  const parts: string[] = [];
  collectRawText(node, parts);
  return parts.join('');
}

function collectRawText(node: DomNode, parts: string[]): void {
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      parts.push(child.data ?? '');
      continue;
    }
    if (child.type !== 'tag') {
      continue;
    }
    const tag = (child.name ?? '').toLowerCase();
    if (SKIPPED_TAGS.has(tag)) {
      continue;
    }
    if (tag === 'br') {
      parts.push('\n');
      continue;
    }
    collectRawText(child, parts);
  }
}

function renderQuote(node: DomNode): string {
  const text = textContent(node);
  if (!text) {
    return '';
  }
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
