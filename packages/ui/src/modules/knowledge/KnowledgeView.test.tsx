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
      documentTitle: '', documentText: '', selectedDocumentId: document.id, selectedDocument: document,
      documentDrawerOpen: false, readyDocuments: [document], hasProcessing: false },
    documentContentState: { content: '第一段识别内容', loading: false, error: '' },
    searchState: { query: '', searchResult: null, contentByDocumentId: {}, searching: false, searchError: '', canSearch: false },
    confirmation: <span>确认弹窗插槽</span>, fileInputRef: createRef<HTMLInputElement>(),
    onBackToCenter: noop,
    actions: {
      onSelectBase: noop, onToggleCreate: noop, onStartCreate: noop, onNameChange: noop,
      onDescriptionChange: noop, handleCreate: noop, handleToggleBaseStatus: noop, handleDeleteBase: noop,
      onActiveTabChange: noop, onToggleDocumentForm: noop, onSourceModeChange: noop,
      onDocumentTitleChange: noop, onDocumentTextChange: noop, onDocumentFileChange: noop,
      handleDocumentSubmit: noop, handleRetry: noop, onViewDocumentChunks: noop,
      onCloseDocumentDrawer: noop,
      handleDeleteDocument: noop, onSelectedDocumentChange: noop,
      onQueryChange: noop, handleSearch: noop,
    },
  };
}

describe('knowledge view', () => {
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
