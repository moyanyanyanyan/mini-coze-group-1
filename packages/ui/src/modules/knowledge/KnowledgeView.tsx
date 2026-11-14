import { useEffect, useState } from 'react';
import { ActionMenu } from '../../components/ActionMenu';
import type { KnowledgeViewProps } from './types';
import { groupSearchResults } from './search-results';
import './knowledge.css';

export function KnowledgeView({
  catalog, documentState, documentContentState, searchState, actions, confirmation, fileInputRef, onBackToCenter,
}: KnowledgeViewProps) {
  const { error, selectedId, selectedBase, selectedBaseStatus, deletingBase, updatingBaseStatus } = catalog;
  const { activeTab, documents, documentError, documentLoading, documentSaving, deletingDocumentId,
    addingDocument, sourceMode, documentTitle, documentText, selectedDocument, documentDrawerOpen,
    hasProcessing } = documentState;
  const { content: documentContent, loading: documentContentLoading, error: documentContentError } = documentContentState;
  const { query, searchResult, contentByDocumentId, searching, searchError, canSearch } = searchState;
  const [documentQuery, setDocumentQuery] = useState('');
  const [documentStatusFilter, setDocumentStatusFilter] = useState<'ALL' | 'READY' | 'PROCESSING' | 'FAILED'>('ALL');
  const visibleDocuments = documents.filter((document) => {
    const matchesQuery = document.title.toLowerCase().includes(documentQuery.trim().toLowerCase());
    const matchesStatus = documentStatusFilter === 'ALL' || document.status === documentStatusFilter;
    return matchesQuery && matchesStatus;
  });
  const groupedSearchResults = searchResult?.status === 'HIT' ? groupSearchResults(searchResult.hits, contentByDocumentId) : [];
  const { handleToggleBaseStatus, handleDeleteBase, onActiveTabChange, onToggleDocumentForm,
    onSourceModeChange, onDocumentTitleChange, onDocumentTextChange, onDocumentFileChange,
    handleDocumentSubmit, handleRetry, onViewDocumentChunks, handleDeleteDocument,
    onCloseDocumentDrawer, onQueryChange, handleSearch } = actions;
  useEffect(() => {
    if (!documentDrawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseDocumentDrawer(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [documentDrawerOpen, onCloseDocumentDrawer]);

  return (
    <section className="feature-page knowledge-page" aria-label="知识库">
      {confirmation}
      <div className="knowledge-content">
        <div className="knowledge-detail-breadcrumb"><button type="button" onClick={onBackToCenter}>← 返回知识库中心</button><span>知识库</span><span>/</span><strong>{selectedBase?.name ?? '知识库详情'}</strong></div>
        <div className="knowledge-workbench knowledge-detail-workbench">
            {selectedId ? <>
              <div className="knowledge-workbench-heading">
                <div className="knowledge-base-summary">
                  <h2>{selectedBase?.name ?? '知识库'}</h2>
                  {selectedBase?.description && <p>{selectedBase.description}</p>}
                  {selectedBaseStatus === 'ACTIVE' ? <div className="knowledge-workbench-stats"><span><strong>{documents.length}</strong> 全部资料</span><span className="is-ready"><strong>{documents.filter((document) => document.status === 'READY').length}</strong> 可检索</span><span className="is-processing"><strong>{documents.filter((document) => document.status === 'PROCESSING').length}</strong> 处理中</span><span className="is-failed"><strong>{documents.filter((document) => document.status === 'FAILED').length}</strong> 处理失败</span></div> : <span className="knowledge-status is-disabled">已停用 · 资料保留</span>}
                </div>
                <ActionMenu key={selectedId} label="管理知识库">
                  <button className="knowledge-status-toggle" type="button" disabled={updatingBaseStatus || deletingBase} onClick={() => void handleToggleBaseStatus()}>{updatingBaseStatus ? '更新中…' : selectedBaseStatus === 'DISABLED' ? '重新启用' : '停用知识库'}</button>
                  <button className="knowledge-delete" type="button" disabled={deletingBase || updatingBaseStatus || hasProcessing} title={hasProcessing ? '请等待文档处理完成' : undefined} onClick={() => void handleDeleteBase()}>{deletingBase ? '删除中…' : '删除知识库'}</button>
                </ActionMenu>
              </div>
              {selectedBaseStatus === 'DISABLED' && <section className="knowledge-card knowledge-disabled-panel" role="status"><h2>知识库已停用</h2><p>资料、切片和向量仍保留。停用期间不能录入资料、查看切片或检索；重新启用后可继续使用。</p></section>}
              {selectedBaseStatus === 'ACTIVE' && <>
              <div className="knowledge-tabs" role="tablist" aria-label="知识库功能">
                <button type="button" role="tab" aria-selected={activeTab === 'documents'} className={activeTab === 'documents' ? 'is-active' : ''} onClick={() => onActiveTabChange('documents')}>资料管理</button>
                <button type="button" role="tab" aria-selected={activeTab === 'search'} className={activeTab === 'search' ? 'is-active' : ''} onClick={() => onActiveTabChange('search')}>检索预览</button>
              </div>

              {activeTab === 'documents' && <div className="knowledge-documents-view" role="tabpanel">
                <section className="knowledge-card knowledge-list">
                  <div className="knowledge-doc-toolbar">
                    <h2>资料列表 <span className="knowledge-count">共 {documents.length} 份资料</span></h2>
                    <button type="button" className="knowledge-add-document" aria-expanded={addingDocument} onClick={() => onToggleDocumentForm()}>
                      {addingDocument ? '收起表单' : '＋ 录入资料'}
                    </button>
                  </div>
                  <div className="knowledge-document-toolbar">
                    <input aria-label="搜索资料名称" value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="搜索资料名称…" />
                    <select aria-label="资料状态筛选" value={documentStatusFilter} onChange={(event) => setDocumentStatusFilter(event.target.value as typeof documentStatusFilter)}>
                      <option value="ALL">全部状态</option><option value="READY">可检索</option><option value="PROCESSING">处理中</option><option value="FAILED">处理失败</option>
                    </select>
                  </div>
                  <form hidden={!addingDocument} className="knowledge-form knowledge-document-form" onSubmit={handleDocumentSubmit}>
                    <div className="knowledge-mode" role="group" aria-label="录入方式">
                      <button type="button" className={sourceMode === 'text' ? 'is-active' : ''} onClick={() => onSourceModeChange('text')}>粘贴文本</button>
                      <button type="button" className={sourceMode === 'file' ? 'is-active' : ''} onClick={() => onSourceModeChange('file')}>上传文件</button>
                    </div>
                    <label htmlFor="document-title">文档标题{sourceMode === 'file' ? '（可选）' : ''}</label>
                    <input id="document-title" value={documentTitle} onChange={(event) => onDocumentTitleChange(event.target.value)} maxLength={100} required={sourceMode === 'text'} placeholder={sourceMode === 'file' ? '留空则使用文件名' : '例如：报销规则'} />
                    {sourceMode === 'text' ? (
                      <><label htmlFor="document-text">正文</label><textarea id="document-text" value={documentText} onChange={(event) => onDocumentTextChange(event.target.value)} rows={8} required placeholder="在此粘贴资料正文" /></>
                    ) : (
                      <><label htmlFor="document-file">TXT / JSON 文件，最多 1 MB</label><input id="document-file" ref={fileInputRef} type="file" accept=".txt,.json" onChange={(event) => onDocumentFileChange(event.target.files?.[0] ?? null)} required /></>
                    )}
                    <button type="submit" disabled={documentSaving}>{documentSaving ? '提交中…' : '提交资料'}</button>
                  </form>
                  {documentError && <p className="knowledge-error" role="alert">{documentError}</p>}
                  {documentLoading && documents.length === 0 ? <p className="knowledge-empty">正在加载…</p> : documents.length === 0 ? (
                    <p className="knowledge-empty">这个知识库还没有资料。</p>
                  ) : visibleDocuments.length === 0 ? <p className="knowledge-empty">没有符合条件的资料。</p> : <div className="knowledge-document-table-wrap"><table className="knowledge-document-table"><thead><tr><th>资料名称</th><th>格式</th><th>状态</th><th>添加时间</th><th>操作</th></tr></thead><tbody>{visibleDocuments.map((document) => (
                    <tr key={document.id} onClick={() => onViewDocumentChunks(document.id)}>
                      <td><button type="button" className="knowledge-document-link" onClick={() => onViewDocumentChunks(document.id)}>{document.title}</button></td>
                      <td>{document.sourceType}</td>
                      <td><span className={`knowledge-document-status status-${document.status.toLowerCase()}`}>{document.status === 'PROCESSING' ? `处理中` : document.status === 'READY' ? '可检索' : '处理失败'}</span>{document.error && <small className="knowledge-document-error">{friendlyDocumentError(document.error.message)}</small>}</td>
                      <td>{new Date(document.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="knowledge-row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); onViewDocumentChunks(document.id); }}>查看</button>{document.status === 'FAILED' && <button type="button" onClick={(event) => { event.stopPropagation(); void handleRetry(document.id); }}>重新处理</button>}<button type="button" className="knowledge-delete" disabled={document.status === 'PROCESSING' || deletingDocumentId !== null} title={document.status === 'PROCESSING' ? '请等待资料处理完成' : undefined} onClick={(event) => { event.stopPropagation(); void handleDeleteDocument(document.id); }}>{deletingDocumentId === document.id ? '删除中…' : '删除'}</button></td>
                    </tr>
                  ))}</tbody></table></div>}
                </section>
              </div>}

              {activeTab === 'search' && <section className="knowledge-card knowledge-preview" role="tabpanel" aria-label="检索预览">
                <div className="knowledge-panel-heading"><div><h2>检索验证</h2><p>输入一个问题，检查当前知识库能否找到相关资料。此功能只验证资料召回，不会生成 AI 回答。</p></div></div>
                <form className="knowledge-search-form" onSubmit={handleSearch}>
                  <label htmlFor="knowledge-query">问题</label>
                  <div className="knowledge-search-row"><textarea id="knowledge-query" value={query} onChange={(event) => onQueryChange(event.target.value)} rows={2} maxLength={8000} placeholder="例如：出差交通费怎么报销？" required />
                  <button type="submit" disabled={searching || !canSearch}>{searching ? '检索中…' : '检索验证'}</button></div>
                </form>
                {searchError && <p className="knowledge-error" role="alert">{searchError}</p>}
                {searchResult && <div className="knowledge-search-result">
                  <p className="knowledge-result-summary">{searchResult.status === 'HIT' ? `命中 ${searchResult.hits.length} 个片段，来自 ${groupedSearchResults.length} 份资料` : '暂未找到相关资料。可以换一种问法，或检查资料是否已经处理完成。'}</p>
                  {searchResult.status === 'HIT' && <div className="knowledge-search-groups">{groupedSearchResults.map((group) => (
                    <article className="knowledge-search-group" key={group.documentId}>
                      <div className="knowledge-search-group-header"><button type="button" className="knowledge-document-link" onClick={() => onViewDocumentChunks(group.documentId)}>{group.documentTitle}</button><span>{group.segments.length} 处相关内容</span><button type="button" onClick={() => onViewDocumentChunks(group.documentId)}>查看资料</button></div>
                      <ol className="knowledge-search-segments">{group.segments.map((segment, index) => <li key={`${group.documentId}:${segment.startOffset ?? 'unknown'}:${index}`}><strong>相关内容 {index + 1}</strong><p>{segment.content}</p></li>)}</ol>
                    </article>
                  ))}</div>}
                </div>}
              </section>}
              {documentDrawerOpen && selectedDocument && <div className="knowledge-drawer-layer" role="presentation">
                <button type="button" className="knowledge-drawer-backdrop" aria-label="关闭资料详情" onClick={onCloseDocumentDrawer} />
                <aside className="knowledge-drawer" role="dialog" aria-modal="true" aria-label="资料详情">
                  <header className="knowledge-drawer-header"><div><span>资料详情</span><h2>{selectedDocument.title}</h2></div><button type="button" aria-label="关闭" onClick={onCloseDocumentDrawer}>×</button></header>
                  <div className="knowledge-drawer-body">
                    <div className="knowledge-drawer-status-row"><span className={`knowledge-document-status status-${selectedDocument.status.toLowerCase()}`}>{selectedDocument.status === 'READY' ? '可检索' : selectedDocument.status === 'PROCESSING' ? '处理中' : '处理失败'}</span>{selectedDocument.status === 'PROCESSING' && <span className="knowledge-stage">当前步骤：{selectedDocument.stage}</span>}</div>
                    <section className="knowledge-detail-section"><h3>资料信息</h3><dl className="knowledge-detail-grid"><div><dt>资料格式</dt><dd>{selectedDocument.sourceType}</dd></div><div><dt>添加时间</dt><dd>{new Date(selectedDocument.createdAt).toLocaleString('zh-CN')}</dd></div><div><dt>原始文件名</dt><dd>{selectedDocument.originalFileName || selectedDocument.title}</dd></div><div><dt>处理状态</dt><dd>{selectedDocument.status === 'READY' ? '处理完成' : selectedDocument.status === 'PROCESSING' ? '正在处理' : '处理失败'}</dd></div></dl></section>
                    {selectedDocument.status === 'PROCESSING' && <section className="knowledge-processing-panel"><strong>正在处理这份资料</strong><p>处理完成后，资料会自动变为可检索状态。请稍候。</p></section>}
                    {selectedDocument.status === 'FAILED' && <section className="knowledge-failed-panel"><strong>这份资料暂时无法处理</strong><p>{friendlyDocumentError(selectedDocument.error?.message)}</p><button type="button" className="knowledge-primary-button" disabled={deletingDocumentId !== null} onClick={() => void handleRetry(selectedDocument.id)}>重新处理</button></section>}
                    {selectedDocument.status === 'READY' && <section className="knowledge-detail-section"><div className="knowledge-panel-heading"><div><h3>识别内容</h3><p>以下内容为资料处理后识别出的连续文本。</p></div></div>{documentContentError && <p className="knowledge-error" role="alert">{documentContentError}</p>}{documentContentLoading ? <p className="knowledge-empty">正在加载识别内容…</p> : documentContent === null ? null : documentContent ? <div className="knowledge-document-content">{documentContent}</div> : <p className="knowledge-empty">这份资料没有可展示的识别内容。</p>}</section>}
                  </div>
                  <footer className="knowledge-drawer-footer"><button type="button" className="knowledge-delete" disabled={selectedDocument.status === 'PROCESSING' || deletingDocumentId !== null} onClick={() => void handleDeleteDocument(selectedDocument.id)}>{deletingDocumentId === selectedDocument.id ? '删除中…' : '删除资料'}</button></footer>
                </aside>
              </div>}
              </>}
            </> : <div className="knowledge-card knowledge-detail-error" role="alert"><h2>无法打开知识库</h2><p>{error || '知识库不存在或无权访问。'}</p><button type="button" className="knowledge-first-create" onClick={onBackToCenter}>返回知识库中心</button></div>}
        </div>
      </div>
    </section>
  );
}

function friendlyDocumentError(message?: string | null): string {
  if (!message) return '处理失败，请检查资料格式后重试。';
  if (/utf|编码|encoding/i.test(message)) return '文件编码无法识别，请转换为 UTF-8 后重试。';
  if (/empty|空|content/i.test(message)) return '资料内容为空，请补充内容后重试。';
  if (/size|大小|limit/i.test(message)) return '资料大小超过限制，请压缩后重试。';
  return '资料暂时无法处理，请稍后重新处理。';
}
