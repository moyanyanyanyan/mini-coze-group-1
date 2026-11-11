import { useRef } from 'react';
import { ActionMenu } from '../../components/ActionMenu';
import type { KnowledgeViewProps } from './types';
import './knowledge.css';

export function KnowledgeView({
  catalog, documentState, chunkState, searchState, actions, confirmation, fileInputRef,
}: KnowledgeViewProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { items, name, description, loading, saving, creatingBase, error, selectedId,
    selectedBase, selectedBaseStatus, deletingBase, updatingBaseStatus, canCreate } = catalog;
  const { activeTab, documents, documentError, documentLoading, documentSaving, deletingDocumentId,
    addingDocument, sourceMode, documentTitle, documentText, selectedDocumentId, selectedDocument,
    readyDocuments, hasProcessing } = documentState;
  const { chunkPage, chunks, chunkLoading, chunkError } = chunkState;
  const { query, searchResult, searching, searchError, canSearch } = searchState;
  const { onSelectBase, onToggleCreate, onStartCreate, onNameChange, onDescriptionChange,
    handleCreate, handleToggleBaseStatus, handleDeleteBase, onActiveTabChange, onToggleDocumentForm,
    onSourceModeChange, onDocumentTitleChange, onDocumentTextChange, onDocumentFileChange,
    handleDocumentSubmit, handleRetry, onViewDocumentChunks, handleDeleteDocument,
    onSelectedDocumentChange, onChunkPageChange, onQueryChange, handleSearch } = actions;

  return (
    <section className="feature-page knowledge-page" aria-label="知识库">
      {confirmation}
      <div className="knowledge-content">
        <header className="knowledge-heading">
          <h1>知识库</h1>
        </header>

        <div className="knowledge-shell">
          <aside className="knowledge-sidebar" aria-label="知识库列表">
            <div className="knowledge-card knowledge-catalog">
              <div className="knowledge-list-heading"><h2>我的资料库</h2><span>{items.length} 个</span></div>
              {error && <p className="knowledge-error" role="alert">{error}</p>}
              {loading ? <p className="knowledge-empty">正在加载…</p> : items.length === 0 ? (
                <p className="knowledge-empty">还没有知识库。</p>
              ) : <ul>{items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`knowledge-catalog-item ${selectedId === item.id ? 'is-selected' : ''}`} disabled={deletingBase || updatingBaseStatus || deletingDocumentId !== null} onClick={() => onSelectBase(item.id)} aria-current={selectedId === item.id ? 'page' : undefined}>
                    <span><strong>{item.name}</strong>{item.status === 'DISABLED' && <span className="knowledge-status is-disabled">已停用</span>}</span>
                  </button>
                </li>
              ))}</ul>}
              <button className="knowledge-create-toggle" type="button" onClick={() => onToggleCreate()}>{creatingBase ? '收起新建' : '＋ 新建知识库'}</button>
            </div>
            {creatingBase && <form className="knowledge-card knowledge-form knowledge-create-form" onSubmit={handleCreate}>
              <h2>新建知识库</h2>
              <label htmlFor="knowledge-name">名称</label>
              <input ref={nameInputRef} autoFocus id="knowledge-name" value={name} onChange={(event) => onNameChange(event.target.value)} maxLength={50} required placeholder="例如：报销制度" />
              <label htmlFor="knowledge-description">说明</label>
              <textarea id="knowledge-description" value={description} onChange={(event) => onDescriptionChange(event.target.value)} maxLength={200} rows={3} placeholder="这份知识库用于什么？" />
              <button type="submit" disabled={saving || !canCreate}>{saving ? '创建中…' : '创建知识库'}</button>
            </form>}
          </aside>

          <div className="knowledge-workbench">
            {selectedId ? <>
              <div className="knowledge-workbench-heading">
                <div className="knowledge-base-summary">
                  <h2>{selectedBase?.name ?? '知识库'}</h2>
                  {selectedBase?.description && <p>{selectedBase.description}</p>}
                  {selectedBaseStatus === 'ACTIVE' ? <div className="knowledge-workbench-stats"><span>{documents.length} 份文档</span><span>{documents.reduce((sum, document) => sum + document.chunkCount, 0)} 个切片</span></div> : <span className="knowledge-status is-disabled">已停用 · 资料保留</span>}
                </div>
                <ActionMenu key={selectedId} label="管理知识库">
                  <button className="knowledge-status-toggle" type="button" disabled={updatingBaseStatus || deletingBase} onClick={() => void handleToggleBaseStatus()}>{updatingBaseStatus ? '更新中…' : selectedBaseStatus === 'DISABLED' ? '重新启用' : '停用知识库'}</button>
                  <button className="knowledge-delete" type="button" disabled={deletingBase || updatingBaseStatus || hasProcessing} title={hasProcessing ? '请等待文档处理完成' : undefined} onClick={() => void handleDeleteBase()}>{deletingBase ? '删除中…' : '删除知识库'}</button>
                </ActionMenu>
              </div>
              {selectedBaseStatus === 'DISABLED' && <section className="knowledge-card knowledge-disabled-panel" role="status"><h2>知识库已停用</h2><p>资料、切片和向量仍保留。停用期间不能录入资料、查看切片或检索；重新启用后可继续使用。</p></section>}
              {selectedBaseStatus === 'ACTIVE' && <>
              <div className="knowledge-tabs" role="tablist" aria-label="知识库功能">
                <button type="button" role="tab" aria-selected={activeTab === 'documents'} className={activeTab === 'documents' ? 'is-active' : ''} onClick={() => onActiveTabChange('documents')}>文档管理</button>
                <button type="button" role="tab" aria-selected={activeTab === 'chunks'} className={activeTab === 'chunks' ? 'is-active' : ''} onClick={() => onActiveTabChange('chunks')}>切片查看</button>
                <button type="button" role="tab" aria-selected={activeTab === 'search'} className={activeTab === 'search' ? 'is-active' : ''} onClick={() => onActiveTabChange('search')}>检索预览</button>
              </div>

              {activeTab === 'documents' && <div className="knowledge-documents-view" role="tabpanel">
                <section className="knowledge-card knowledge-list">
                  <div className="knowledge-doc-toolbar">
                    <h2>文档列表</h2>
                    <button type="button" className="knowledge-add-document" aria-expanded={addingDocument} onClick={() => onToggleDocumentForm()}>
                      {addingDocument ? '收起表单' : '＋ 录入资料'}
                    </button>
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
                  ) : <ul>{documents.map((document) => (
                    <li key={document.id}>
                      <div><strong>{document.title}</strong><span className={`knowledge-document-status status-${document.status.toLowerCase()}`}>{document.status === 'PROCESSING' ? '处理中' : document.status === 'READY' ? '可检索' : '处理失败'}</span></div>
                      <p>{document.sourceType} · {document.status === 'PROCESSING' ? document.stage : `片段数 ${document.chunkCount}`}</p>
                      {document.error && <p className="knowledge-document-error">{document.error.message}</p>}
                      {document.status === 'READY' && <button className="knowledge-retry" type="button" onClick={() => { onViewDocumentChunks(document.id); }}>查看切片</button>}
                      {document.status === 'FAILED' && <button className="knowledge-retry" type="button" onClick={() => void handleRetry(document.id)}>重新处理</button>}
                      <button className="knowledge-delete knowledge-delete-document" type="button" disabled={document.status === 'PROCESSING' || deletingDocumentId !== null} title={document.status === 'PROCESSING' ? '请等待文档处理完成' : undefined} onClick={() => void handleDeleteDocument(document.id)}>{deletingDocumentId === document.id ? '删除中…' : '删除文档'}</button>
                      <small>{new Date(document.createdAt).toLocaleString('zh-CN')}</small>
                    </li>
                  ))}</ul>}
                </section>
              </div>}

              {activeTab === 'chunks' && <section className="knowledge-card knowledge-preview" role="tabpanel" aria-label="切片内容">
                <div className="knowledge-panel-heading"><div><h2>切片查看</h2><p>查看资料入库后实际生成的片段。</p></div><span>{chunks?.total ?? 0} 个片段</span></div>
                <label className="knowledge-document-picker" htmlFor="knowledge-document-picker">选择文档
                  <select id="knowledge-document-picker" value={selectedDocumentId ?? ''} onChange={(event) => { onSelectedDocumentChange(event.target.value || null); }}>
                    {readyDocuments.length === 0 && <option value="">暂无已完成文档</option>}
                    {readyDocuments.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
                  </select>
                </label>
                {chunkError && <p className="knowledge-error" role="alert">{chunkError}</p>}
                {documentLoading ? <p className="knowledge-empty">正在读取文档…</p> : !selectedDocument ? <p className="knowledge-empty">暂无切片。请先录入资料并等待处理完成。</p> : chunkLoading ? <p className="knowledge-empty">正在读取切片…</p> : chunks?.items.length === 0 ? (
                  <p className="knowledge-empty">这份文档暂无切片。</p>
                ) : <ol className="knowledge-snippets knowledge-snippets-scroll">{chunks?.items.map((chunk) => (
                  <li key={chunk.id}>
                    <div className="knowledge-snippet-meta"><strong>片段 {chunk.position + 1}</strong><span>字符位置 {chunk.startOffset}–{chunk.endOffset}</span></div>
                    <p>{chunk.content}</p>
                  </li>
                ))}</ol>}
                {chunks && chunks.total > chunks.pageSize && <div className="knowledge-pagination">
                  <button type="button" disabled={chunkPage === 1 || chunkLoading} onClick={() => onChunkPageChange(chunkPage - 1)}>上一页</button>
                  <span>第 {chunkPage} / {Math.ceil(chunks.total / chunks.pageSize)} 页</span>
                  <button type="button" disabled={chunkPage * chunks.pageSize >= chunks.total || chunkLoading} onClick={() => onChunkPageChange(chunkPage + 1)}>下一页</button>
                </div>}
              </section>}

              {activeTab === 'search' && <section className="knowledge-card knowledge-preview" role="tabpanel" aria-label="检索预览">
                <div className="knowledge-panel-heading"><div><h2>检索预览</h2><p>输入问题，查看当前知识库实际匹配的片段；这里不生成 AI 回答。</p></div></div>
                <form className="knowledge-search-form" onSubmit={handleSearch}>
                  <label htmlFor="knowledge-query">问题</label>
                  <div className="knowledge-search-row"><textarea id="knowledge-query" value={query} onChange={(event) => onQueryChange(event.target.value)} rows={2} maxLength={8000} placeholder="例如：出差交通费怎么报销？" required />
                    <button type="submit" disabled={searching || !canSearch}>{searching ? '检索中…' : '检索片段'}</button></div>
                </form>
                {searchError && <p className="knowledge-error" role="alert">{searchError}</p>}
                {searchResult && <div className="knowledge-search-result">
                  <p className="knowledge-result-summary">{searchResult.status === 'HIT' ? `命中 ${searchResult.hits.length} 个片段` : '没有可检索的片段'}</p>
                  {searchResult.status === 'HIT' && <ol className="knowledge-snippets knowledge-snippets-scroll">{searchResult.hits.map((hit) => (
                    <li key={`${hit.knowledgeBaseId}:${hit.documentId}:${hit.chunkId}`}>
                      <div className="knowledge-snippet-meta"><strong>{hit.documentTitle}</strong><span>分数 {hit.score.toFixed(3)}</span></div>
                      <p>{hit.content}</p>
                      <small>片段 ID：{hit.chunkId}</small>
                    </li>
                  ))}</ol>}
                </div>}
              </section>}
              </>}
            </> : items.length > 0 ? (
              <div className="knowledge-card knowledge-empty-workbench"><h2>选择知识库</h2><p>从列表选择一个知识库，开始管理文档、查看切片或预览检索。</p></div>
            ) : !loading && !error ? (
              <div className="knowledge-card knowledge-empty-workbench">
                <h2>创建第一个知识库</h2>
                <button type="button" className="knowledge-first-create" onClick={() => {
                  onStartCreate();
                  nameInputRef.current?.focus();
                }}>创建第一个知识库</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
