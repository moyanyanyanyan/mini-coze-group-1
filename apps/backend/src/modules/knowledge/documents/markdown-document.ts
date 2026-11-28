import { lexer, type Token, type Tokens } from 'marked';
import { DocumentContentError } from './document-content';
import {
  NormalizedDocument,
  NormalizedDocumentBuilder,
  normalizeTitle,
} from './normalized-document';

/**
 * Markdown adapter: `marked` produces the block/inline AST, this converter
 * flattens that AST into the shared NormalizedDocument contract.
 */
export function parseMarkdownDocument(source: string): NormalizedDocument {
  const normalizedSource = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  if (!normalizedSource.trim()) {
    throw new DocumentContentError('EMPTY_CONTENT', '资料中没有可检索正文');
  }

  let tokens: Token[];
  try {
    tokens = lexer(normalizedSource, { gfm: true, breaks: false });
  } catch (error) {
    throw new DocumentContentError(
      'INVALID_MARKDOWN',
      `Markdown 解析失败：${error instanceof Error ? error.message : '格式无效'}`,
    );
  }

  const builder = new NormalizedDocumentBuilder();
  let title: string | null = null;

  for (const token of tokens) {
    if (token.type === 'heading' && title === null) {
      title = inlineText(token.tokens);
    }
    appendBlockToken(builder, token);
  }

  return builder.build('MARKDOWN', title);
}

function appendBlockToken(
  builder: NormalizedDocumentBuilder,
  token: Token,
): void {
  switch (token.type) {
    case 'heading': {
      const text = inlineText(token.tokens);
      if (text) {
        builder.append(text, { kind: 'heading', level: token.depth });
      }
      return;
    }
    case 'paragraph': {
      const text = inlineText(token.tokens);
      if (text) {
        builder.append(text, { kind: 'paragraph' });
      }
      return;
    }
    case 'list': {
      const lines = renderList(token as Tokens.List);
      if (lines.length > 0) {
        builder.append(lines.join('\n'), { kind: 'list' });
      }
      return;
    }
    case 'table': {
      const text = renderTable(token as Tokens.Table);
      if (text) {
        builder.append(text, { kind: 'table' });
      }
      return;
    }
    case 'code': {
      const text = renderCodeBlock(token as Tokens.Code);
      if (text) {
        builder.append(text, {
          kind: 'code',
          language: codeLanguage(token as Tokens.Code),
        });
      }
      return;
    }
    case 'blockquote': {
      const text = renderQuote(token.tokens ?? []);
      if (text) {
        builder.append(text, { kind: 'quote' });
      }
      return;
    }
    case 'html': {
      const text = normalizeInlineText(stripHtml(token.text));
      if (text) {
        builder.append(text, { kind: 'paragraph' });
      }
      return;
    }
    case 'hr': {
      builder.append('---', { kind: 'thematicBreak' });
      return;
    }
    case 'space':
    case 'def':
      return;
    default: {
      const fallback = plainBlockText(token);
      if (fallback) {
        builder.append(fallback, { kind: 'paragraph' });
      }
    }
  }
}

function inlineText(tokens: Token[] | undefined): string {
  if (!tokens || tokens.length === 0) {
    return '';
  }
  return normalizeInlineText(tokens.map(inlineTokenText).join(''));
}

function inlineTokenText(token: Token): string {
  switch (token.type) {
    case 'text':
    case 'escape':
    case 'codespan':
      return token.text;
    case 'br':
      return ' ';
    case 'strong':
    case 'em':
    case 'del':
      return inlineText(token.tokens);
    case 'link':
    case 'image':
      return token.tokens?.length ? inlineText(token.tokens) : token.text;
    case 'html':
      return stripHtml(token.text);
    default:
      if ('tokens' in token && Array.isArray(token.tokens)) {
        return inlineText(token.tokens);
      }
      if ('text' in token && typeof token.text === 'string') {
        return token.text;
      }
      return '';
  }
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderList(list: Tokens.List, depth = 0): string[] {
  const lines: string[] = [];
  const start =
    typeof list.start === 'number' && list.start > 0 ? list.start : 1;

  list.items.forEach((item, index) => {
    const marker = list.ordered ? `${start + index}. ` : '- ';
    const checkbox = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
    const nestedLists: Tokens.List[] = [];
    const contentTokens: Token[] = [];

    for (const token of item.tokens ?? []) {
      if (token.type === 'list') {
        nestedLists.push(token as Tokens.List);
      } else {
        contentTokens.push(token);
      }
    }

    const content = normalizeInlineText(
      contentTokens.map(plainBlockText).join(' '),
    );
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${marker}${checkbox}${content}`.trimEnd());
    for (const nested of nestedLists) {
      lines.push(...renderList(nested, depth + 1));
    }
  });

  return lines;
}

function renderTable(table: Tokens.Table): string {
  const header = table.header.map((cell) => tableCellText(cell));
  const rows = table.rows.map((row) => row.map((cell) => tableCellText(cell)));
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function tableCellText(cell: Tokens.TableCell): string {
  return normalizeInlineText(inlineText(cell.tokens)).replace(/\|/g, '\\|');
}

function codeLanguage(token: Tokens.Code): string | undefined {
  const language = token.lang?.trim().split(/\s+/)[0];
  return language || undefined;
}

function renderCodeBlock(token: Tokens.Code): string {
  const code = token.text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!code) {
    return '';
  }
  const fence = code.includes('```') ? '````' : '```';
  const language = codeLanguage(token) ?? '';
  return `${fence}${language}\n${code}\n${fence}`;
}

function renderQuote(tokens: Token[]): string {
  const content = tokens
    .map(plainBlockText)
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return content;
}

function plainBlockText(token: Token): string {
  switch (token.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(token.tokens);
    case 'text':
      return inlineText(token.tokens);
    case 'list':
      return renderList(token as Tokens.List).join('\n');
    case 'table':
      return renderTable(token as Tokens.Table);
    case 'code':
      return renderCodeBlock(token as Tokens.Code);
    case 'blockquote':
      return renderQuote(token.tokens ?? []);
    case 'html':
      return normalizeInlineText(stripHtml(token.text));
    default:
      return normalizeInlineText(inlineTokenText(token));
  }
}

/** Small HTML stripper for raw HTML islands inside Markdown. */
export function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Number(value)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    );
}

export function markdownTitle(source: string): string | null {
  const normalizedSource = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  const firstHeading = lexer(normalizedSource, { gfm: true }).find(
    (token) => token.type === 'heading',
  );
  return firstHeading?.type === 'heading'
    ? normalizeTitle(inlineText(firstHeading.tokens))
    : null;
}
