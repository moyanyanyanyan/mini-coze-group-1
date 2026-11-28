import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KnowledgeView } from './KnowledgeView';
import type { KnowledgeViewProps } from './types';

const noop = () => undefined;
const base = { id: 'base-1', name: '测试资料库', description: '资料说明', status: 'ACTIVE' as const };
const document = {
  id: 'document-1', title: '测试文档', sourceType: 'TEXT' as const, status: 'READY' as const,
  stage: 'COMPLETED', chunkCount: 2, error: null, createdAt: '2026-11-01T00:00:00Z',
};
function props(): KnowledgeViewProps {
  return {
    catalog: { items: [base], name: '', description: '', loading: false, saving: false, creatingBase: false,
      error: '', selectedId: base.id, selectedBase: base, selectedBaseStatus: base.status,
      deletingBase: false, updatingBaseStatus: false, canCreate: false },
    documentState: { activeTab: 'documents', documents: [document], documentError: '', documentLoading: false,
      documentSaving: false, deletingDocumentId: null, addingDocument: false, sourceMode: 'text',
      documentTitle: '', documentText: '', documentFileName: null, selectedDocumentId: document.id, selectedDocument: document,
      documentDrawerOpen: false, readyDocuments: [document], hasProcessing: false },
    documentContentState: {
      content: '第一段识别内容', loading: false, error: '',
      sourceRanges: [], sourceRangesLoading: false, sourceRangesError: '',
    },
    searchState: { query: '', searchResult: null, contentByDocumentId: {}, searching: false, searchError: '', canSearch: false },
    confirmation: <span>确认弹窗插槽</span>, fileInputRef: createRef<HTMLInputElement>(),
    getOriginalFileUrl: (id) => `/api/documents/${id}/file?workspaceId=owner`,
    onBackToCenter: noop,
    editDialogOpen: false, editName: '', editDescription: '', editSaving: false,
    onEditNameChange: noop, onEditDescriptionChange: noop, onEditSubmit: noop, onCloseEditDialog: noop,
    actions: {
      onSelectBase: noop, onToggleCreate: noop, onStartCreate: noop, onNameChange: noop,
      onDescriptionChange: noop, handleCreate: noop, handleToggleBaseStatus: noop, onEditKnowledgeBase: noop, handleDeleteBase: noop,
      onActiveTabChange: noop, onToggleDocumentForm: noop, onSourceModeChange: noop,
      onDocumentTitleChange: noop, onDocumentTextChange: noop, onDocumentFileChange: noop,
      handleDocumentSubmit: noop, handleRetry: noop, onViewDocumentChunks: noop,
      onCloseDocumentDrawer: noop,
      handleDeleteDocument: noop, onReadDocument: noop, onSelectedDocumentChange: noop,
      onQueryChange: noop, handleSearch: noop,
    },
  };
}

describe('knowledge view', () => {
  it.each(['CSV', 'HTML', 'JSON', 'DOCX', 'PDF', 'IMAGE'] as const)('offers the original %s file separately from recognized content', (sourceType) => {
    const input = props();
    input.documentState.documentDrawerOpen = true;
    input.documentState.selectedDocument = { ...document, sourceType, originalFileName: '原始资料.csv' };
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('原始文件');
    expect(html).toContain('原始资料.csv');
    expect(html).toContain('href="/api/documents/document-1/file?workspaceId=owner" download=""');
    expect(html).toContain('下载原文件');
    expect(html).toContain('第一段识别内容');
    if (sourceType === 'PDF' || sourceType === 'IMAGE') {
      expect(html).toContain('href="/api/documents/document-1/file?workspaceId=owner&amp;inline=1" target="_blank"');
      expect(html).toContain('查看原文件');
    } else {
      expect(html).not.toContain('查看原文件');
    }
  });

  it('keeps the original text downloadable when recognition fails', () => {
    const input = props();
    input.documentState.documentDrawerOpen = true;
    input.documentState.selectedDocument = { ...document, status: 'FAILED' };
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('测试文档.txt');
    expect(html).toContain('录入时的原始文本');
    expect(html).toContain('下载原文件');
  });

  it('shows a compact file action and changes it to reselect after choosing a file', () => {
    const input = props();
    input.documentState.addingDocument = true;
    input.documentState.sourceMode = 'file';
    const emptyHtml = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(emptyHtml).toContain('尚未选择文件');
    expect(emptyHtml).toContain('>选择文件</button>');
    expect(emptyHtml).toContain('<button type="submit" disabled="">提交资料</button>');

    input.documentState.documentFileName = '报销规则.txt';
    const selectedHtml = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(selectedHtml).toContain('>重新选择</button>');
    expect(selectedHtml).toContain('已选择：报销规则.txt');
    expect(selectedHtml).toContain('<button type="submit">提交资料</button>');
    expect(selectedHtml).not.toContain('尚未选择文件');
  });

  it('offers PDF upload and displays its extracted text through the existing drawer', () => {
    const input = props();
    input.documentState.addingDocument = true;
    input.documentState.sourceMode = 'file';
    input.documentState.documentDrawerOpen = true;
    input.documentState.documents = [{ ...document, sourceType: 'PDF' }];
    input.documentState.selectedDocument = input.documentState.documents[0];
    input.documentContentState.content = 'Extracted PDF text';
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('accept=".txt,.json,.md,.markdown,.html,.htm,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.xlsx,.csv,.webp"');
    expect(html).toContain('PDF 最多 64 MiB');
    expect(html).toContain('<td>PDF</td>');
    expect(html).toContain('Extracted PDF text');
  });

  it('offers PNG and JPEG uploads and displays the real image format in the list and drawer', () => {
    const input = props();
    input.documentState.addingDocument = true;
    input.documentState.sourceMode = 'file';
    input.documentState.documents = [{ ...document, sourceType: 'IMAGE', originalFileName: 'scan.PNG' }];
    input.documentState.documentDrawerOpen = true;
    input.documentState.selectedDocument = input.documentState.documents[0];
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('PNG / JPG / JPEG 图片最多 10 MiB');
    expect(html).toContain('<td>PNG</td>');
    expect(html).toContain('<dd>PNG</dd>');
    expect(html).not.toContain('<td>TEXT</td>');

    input.documentState.documents = [{ ...document, id: 'document-2', sourceType: 'IMAGE', originalFileName: 'photo.JPEG' }];
    input.documentState.selectedDocument = input.documentState.documents[0];
    const jpegHtml = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(jpegHtml).toContain('<td>JPEG</td>');
    expect(jpegHtml).toContain('<dd>JPEG</dd>');
  });

  it('shows 图片 for an IMAGE document without a usable file name', () => {
    const input = props();
    input.documentState.documents = [{ ...document, sourceType: 'IMAGE', originalFileName: null }];
    input.documentState.documentDrawerOpen = true;
    input.documentState.selectedDocument = input.documentState.documents[0];
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('<td>图片</td>');
    expect(html).toContain('<dd>图片</dd>');
  });

  it('shows the image OCR failure hint', () => {
    const input = props();
    input.documentState.documents = [{ ...document, sourceType: 'IMAGE', originalFileName: 'scan.png', status: 'FAILED', error: { message: '图片中没有识别到有效文本' } }];
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('图片文字识别失败，请检查图片清晰度后重试。');
  });

  it('shows a useful message for an unreadable PDF', () => {
    const input = props();
    input.documentState.documents = [{ ...document, sourceType: 'PDF', status: 'FAILED', error: { message: 'PDF 文件无法解析' } }];
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('PDF 文件无法解析，请检查文件后重试。');
  });
  it('shows Word paragraph and table sources for a DOCX preview', () => {
    const input = props();
    input.documentState.documents = [{ ...document, sourceType: 'DOCX', originalFileName: 'manual.docx' }];
    input.documentState.selectedDocument = input.documentState.documents[0];
    input.documentState.documentDrawerOpen = true;
    input.documentContentState.sourceRanges = [
      { path: 'content.3', kind: 'paragraph', startOffset: 0, endOffset: 5, overlap: false },
      { path: 'content.4.children.0.children.1.children.0', kind: 'tableCell', startOffset: 6, endOffset: 9, overlap: false },
    ];
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('<td>DOCX</td>');
    expect(html).toContain('Word 段落 4');
    expect(html).toContain('Word 表格 5 · 单元格');
  });

  it('shows PPT slide numbers in search results', () => {
    const input = props();
    input.documentState.activeTab = 'search';
    input.searchState.searchResult = {
      status: 'HIT',
      hits: [{
        chunkId: 'chunk-1',
        knowledgeBaseId: 'base-1',
        documentId: 'deck-1',
        documentTitle: 'deck.pptx',
        content: '幻灯片内容',
        startOffset: 0,
        endOffset: 5,
        sourceRanges: {
          version: 1,
          ranges: [{ path: 'content.0', slideNumber: 2, kind: 'heading', startOffset: 0, endOffset: 5, overlap: false }],
        },
        score: 0.9,
      }],
    };
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('PPT 第 2 页 · 标题');
  });

  it('renders disabled libraries without document, chunk or search controls', () => {
    const input = props();
    input.catalog.selectedBaseStatus = 'DISABLED';
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('确认弹窗插槽');
    expect(html).toContain('知识库已停用');
    expect(html).toContain('重新启用');
    expect(html).not.toContain('knowledge-sidebar');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('提交资料');
  });

  it('places knowledge base editing in the management menu', () => {
    const html = renderToStaticMarkup(<KnowledgeView {...props()} />);
    expect(html).toContain('编辑知识库');
  });

  it('prevents deletion while documents are processing and shows failure details', () => {
    const input = props();
    input.documentState.hasProcessing = true;
    input.documentState.documents = [
      { ...document, status: 'PROCESSING', stage: 'EMBEDDING' },
      { ...document, id: 'failed', status: 'FAILED', error: { message: '向量化失败' } },
    ];
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toMatch(/disabled="" title="请等待文档处理完成">删除知识库/);
    expect(html).toMatch(/disabled="" title="请等待资料处理完成">删除/);
    expect(html).toContain('资料暂时无法处理');
    expect(html).toContain('重新处理');
  });

  it('renders complete document content in the drawer and safely escapes it', () => {
    const input = props();
    input.documentState.documentDrawerOpen = true;
    input.documentContentState.content = '<script>识别内容</script>';
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('识别内容');
    expect(html).toContain('&lt;script&gt;识别内容&lt;/script&gt;');
    expect(html).not.toContain('内容片段 1');
  });

  it('shows the full reading entry only when preview has more content', () => {
    const input = props();
    input.documentState.documentDrawerOpen = true;
    input.documentContentState.hasMore = true;
    input.documentContentState.totalLength = 12000;
    const html = renderToStaticMarkup(<KnowledgeView {...input} />);
    expect(html).toContain('阅读全文');
    expect(html).toContain('12,000 字');
  });

  it('distinguishes pending, failed and empty retrieval states', () => {
    const input = props();
    input.documentState.activeTab = 'search';
    input.searchState.searching = true;
    expect(renderToStaticMarkup(<KnowledgeView {...input} />)).toMatch(/disabled="">检索中…/);
    input.searchState.searching = false;
    input.searchState.searchError = '检索失败';
    expect(renderToStaticMarkup(<KnowledgeView {...input} />)).toContain('role="alert">检索失败');
    input.searchState.searchError = '';
    input.searchState.searchResult = { status: 'NO_HIT', hits: [] };
    expect(renderToStaticMarkup(<KnowledgeView {...input} />)).toContain('暂未找到相关资料');
  });
});
