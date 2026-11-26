import { chunkDocument } from './chunk-document';
import {
  mapChunkSources,
  mapSegmentChunks,
  validateChunkSources,
} from './chunk-source';
import { DocumentContentError } from './document-content';
import { parseHtmlDocument } from './html-document';
import { parseMarkdownDocument } from './markdown-document';
import {
  assertNormalizedDocument,
  NormalizedDocument,
} from './normalized-document';
import { parseNormalizedDocument, plainTextDocument } from './parse-document';

function expectOffsets(document: NormalizedDocument) {
  assertNormalizedDocument(document);
  for (const segment of document.segments) {
    expect(document.rawText.slice(segment.startOffset, segment.endOffset)).toBe(
      segment.text,
    );
  }
}

describe('markdown document adapter', () => {
  const markdown = [
    '# 报销制度',
    '',
    '本制度适用于全体员工。',
    '',
    '## 报销标准',
    '',
    '- 餐费每餐 80 元',
    '  - 早餐 20 元',
    '- 市内交通 50 元',
    '',
    '| 项目 | 上限 |',
    '| --- | --- |',
    '| 餐费 | 80 |',
    '| 交通 | 50 |',
    '',
    '> 超出标准需要审批。',
    '',
    '```ts',
    'const limit = 80;',
    'console.log(limit);',
    '```',
    '',
    '结尾段落。',
  ].join('\n');

  it('extracts headings, paragraphs, lists, tables, quotes and code blocks', () => {
    const document = parseMarkdownDocument(markdown);
    expect(document.format).toBe('MARKDOWN');
    expect(document.title).toBe('报销制度');
    expect(document.segments.map((segment) => segment.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'table',
      'quote',
      'code',
      'paragraph',
    ]);
    expect(document.segments[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(document.segments[2]).toMatchObject({ kind: 'heading', level: 2 });
    expect(document.segments[3].text).toContain('- 餐费每餐 80 元');
    expect(document.segments[3].text).toContain('  - 早餐 20 元');
    expect(document.segments[4].text).toContain('| 餐费 | 80 |');
    expect(document.segments[6]).toMatchObject({
      kind: 'code',
      language: 'ts',
    });
    expect(document.segments[6].text).toBe(
      '```ts\nconst limit = 80;\nconsole.log(limit);\n```',
    );
    expect(document.rawText).not.toContain('## 报销标准');
    expectOffsets(document);
  });

  it('rejects empty markdown instead of producing an empty index', () => {
    expect(() => parseMarkdownDocument(' \n\n ')).toThrow(DocumentContentError);
  });
});

describe('html document adapter', () => {
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <title>员工手册</title>
    <style>body { color: red }</style>
  </head>
  <body>
    <header class="site-header"><nav>首页 / 文档 / 登录</nav></header>
    <main>
      <article>
        <h1>员工手册</h1>
        <p>欢迎加入，<strong>请先阅读</strong>以下规则。</p>
        <nav>本章目录</nav>
        <ul>
          <li>工作时间 9:00-18:00</li>
          <li>请假需提前申请
            <ul><li>事假提前一天</li></ul>
          </li>
        </ul>
        <table>
          <thead><tr><th>类型</th><th>天数</th></tr></thead>
          <tbody>
            <tr><td>年假</td><td>5</td></tr>
            <tr><td>病假</td><td>按医嘱</td></tr>
          </tbody>
        </table>
        <pre><code class="language-js">const policy = "ok";</code></pre>
        <div class="cookie-banner">本站使用 Cookie</div>
        <p hidden>隐藏内容</p>
      </article>
    </main>
    <aside>广告位</aside>
    <footer>版权所有</footer>
    <script>alert("x")</script>
  </body>
</html>`;

  it('extracts main content and filters navigation, footer, ads and hidden nodes', () => {
    const document = parseHtmlDocument(html);
    expect(document.format).toBe('HTML');
    expect(document.title).toBe('员工手册');
    expect(document.rawText).toContain('欢迎加入，请先阅读以下规则。');
    expect(document.rawText).toContain('工作时间 9:00-18:00');
    expect(document.rawText).toContain('| 年假 | 5 |');
    expect(document.rawText).toContain('const policy = "ok";');
    expect(document.rawText).not.toContain('首页');
    expect(document.rawText).not.toContain('广告位');
    expect(document.rawText).not.toContain('版权所有');
    expect(document.rawText).not.toContain('Cookie');
    expect(document.rawText).not.toContain('隐藏内容');
    expect(document.rawText).not.toContain('alert');
    expectOffsets(document);
  });

  it('falls back to body content for fragment-like HTML', () => {
    const document = parseHtmlDocument('<h2>标题</h2><p>正文</p>');
    expect(document.segments.map((segment) => segment.kind)).toEqual([
      'heading',
      'paragraph',
    ]);
    expect(document.rawText).toBe('标题\n\n正文');
  });

  it('keeps an article header but drops a link-only site header', () => {
    const document = parseHtmlDocument(
      '<header><a href="/">首页</a><a href="/docs">文档</a></header>' +
        '<main><article><header><h1>标题</h1></header><p>正文</p></article></main>',
    );
    expect(document.rawText).toBe('标题\n\n正文');
    expect(document.rawText).not.toContain('首页');
  });
});

describe('normalized document contract', () => {
  it('dispatches the file adapter from the source type', () => {
    const document = parseNormalizedDocument(
      'MARKDOWN',
      Buffer.from('# 标题\n\n正文'),
    );
    expect(document.format).toBe('MARKDOWN');
    expect(document.title).toBe('标题');
    expect(document.rawText).toBe('标题\n\n正文');
  });

  it('keeps TXT paragraph offsets in the original text coordinate system', () => {
    const source = '第一段第一行\n第一段第二行\n\n\n第二段';
    const document = plainTextDocument('TXT', source);
    expect(document.rawText).toBe(source);
    expect(document.segments).toEqual([
      {
        kind: 'paragraph',
        text: '第一段第一行\n第一段第二行',
        startOffset: 0,
        endOffset: 13,
      },
      { kind: 'paragraph', text: '第二段', startOffset: 16, endOffset: 19 },
    ]);
    expectOffsets(document);
  });
});

describe('chunk source mapping', () => {
  it('maps chunks back to normalized segments and keeps exact source slices', () => {
    const document = parseMarkdownDocument(
      `# 标题\n\n${'正文内容。'.repeat(180)}\n\n- 列表项`,
    );
    const chunks = chunkDocument(document.rawText);
    expect(chunks.length).toBeGreaterThan(1);

    const mappings = mapChunkSources(
      document.rawText,
      chunks,
      document.segments,
    );
    expect(mappings).toHaveLength(chunks.length);
    for (const chunk of chunks) {
      expect(document.rawText.slice(chunk.startOffset, chunk.endOffset)).toBe(
        chunk.content,
      );
    }
    expect(mappings[0].sourceRanges[0]).toMatchObject({
      segmentIndex: 0,
      kind: 'heading',
    });
    expect(
      mappings.some((mapping) =>
        mapping.sourceRanges.some((range) => range.kind === 'list'),
      ),
    ).toBe(true);
    expect(() =>
      validateChunkSources(document.rawText, chunks, document.segments),
    ).not.toThrow();

    const reverse = mapSegmentChunks(chunks, document.segments);
    expect(reverse).toHaveLength(document.segments.length);
    expect(reverse[0].chunkPositions).toContain(0);
  });

  it('rejects a chunk whose content no longer matches its source slice', () => {
    const document = parseMarkdownDocument('# 标题\n\n正文');
    const chunks = [
      { position: 0, content: '被篡改', startOffset: 0, endOffset: 4, bodyStartOffset: 0 },
    ];
    expect(() =>
      validateChunkSources(document.rawText, chunks, document.segments),
    ).toThrow(DocumentContentError);
  });
});
