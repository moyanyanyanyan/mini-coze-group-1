import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createKnowledgeBase, createTextDocument, getKnowledgeWorkspaceId, deleteKnowledgeBase, deleteKnowledgeDocument, listDocumentChunks, listKnowledgeBases, listKnowledgeDocuments, previewKnowledgeSearch, retryKnowledgeDocument, updateKnowledgeBaseStatus, uploadDocumentFile, type KnowledgeBase, type KnowledgeChunkPage, type KnowledgeDocument, type KnowledgeSearchResult } from './knowledge.api';
import './knowledge.css';



export function KnowledgePage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingBase, setCreatingBase] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'chunks' | 'search'>('documents');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [documentError, setDocumentError] = useState('');
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [deletingBase, setDeletingBase] = useState(false);
  const [updatingBaseStatus, setUpdatingBaseStatus] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<'text' | 'file'>('text');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [chunkPage, setChunkPage] = useState(1);
  const [chunks, setChunks] = useState<KnowledgeChunkPage | null>(null);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [chunkError, setChunkError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchGenerationRef = useRef(0);
  const selectedBaseStatus = items.find((item) => item.id === selectedId)?.status;

  useEffect(() => {
    let active = true;
    getKnowledgeWorkspaceId()
      .then((id) => { if (active) setWorkspaceId(id); })
      .catch((cause: unknown) => { if (active) { setError(getMessage(cause)); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    listKnowledgeBases(workspaceId)
      .then((result) => { if (active) { setItems(result); setSelectedId(result[0]?.id ?? null); setCreatingBase(result.length === 0); } })
      .catch((cause: unknown) => { if (active) setError(getMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId]);

  const hasProcessing = documents.some((document) => document.status === 'PROCESSING');
  useEffect(() => {
    searchGenerationRef.current += 1;
    setActiveTab('documents');
    setSelectedDocumentId(null);
    setChunkPage(1);
    setChunks(null);
    setSearchResult(null);
    setSearchError('');
    setSearching(false);
  }, [selectedId, selectedBaseStatus]);

  useEffect(() => {
    if (!workspaceId || !selectedId || selectedBaseStatus !== 'ACTIVE') {
      setDocuments([]);
      setDocumentLoading(false);
      setDocumentError('');
      setSelectedDocumentId(null);
      return;
    }
    let active = true;
    setDocumentLoading(true);
    const refresh = () => listKnowledgeDocuments(selectedId, workspaceId)
      .then((result) => { if (active) {
        setDocuments(result);
        setSelectedDocumentId((current) => current && result.some((document) => document.id === current && document.status === 'READY')
          ? current : result.find((document) => document.status === 'READY')?.id ?? null);
        setDocumentError('');
      } })
      .catch((cause: unknown) => { if (active) setDocumentError(getMessage(cause)); })
      .finally(() => { if (active) setDocumentLoading(false); });
    void refresh();
    const timer = hasProcessing ? window.setInterval(() => void refresh(), 2000) : undefined;
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); };
  }, [workspaceId, selectedId, selectedBaseStatus, hasProcessing]);

  useEffect(() => {
    if (!workspaceId || !selectedId || selectedBaseStatus !== 'ACTIVE' || !selectedDocumentId) {
      setChunks(null);
      setChunkLoading(false);
      setChunkError('');
      return;
    }
    let active = true;
    setChunkLoading(true);
    setChunkError('');
    listDocumentChunks(selectedId, selectedDocumentId, workspaceId, chunkPage)
      .then((result) => { if (active) setChunks(result); })
      .catch((cause: unknown) => { if (active) { setChunks(null); setChunkError(getMessage(cause)); } })
      .finally(() => { if (active) setChunkLoading(false); });
    return () => { active = false; };
  }, [workspaceId, selectedId, selectedBaseStatus, selectedDocumentId, chunkPage]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !name.trim() || saving) return;

    setSaving(true);
    setError('');
    try {
      const created = await createKnowledgeBase({ workspaceId: workspaceId, name: name.trim(), description: description.trim() });
      setItems(await listKnowledgeBases(workspaceId));
      setSelectedId(created.id);
      setName('');
      setDescription('');
      setCreatingBase(false);
    } catch (cause) {
      setError(getMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleDocumentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || selectedBaseStatus !== 'ACTIVE' || documentSaving) return;
    setDocumentSaving(true);
    setDocumentError('');
    try {
      if (sourceMode === 'text') {
        await createTextDocument(selectedId, { workspaceId: workspaceId, title: documentTitle.trim(), text: documentText });
      } else {
        if (!documentFile) throw new Error('请选择 TXT 或 JSON 文件');
        await uploadDocumentFile(selectedId, { workspaceId: workspaceId, title: documentTitle, file: documentFile });
      }
      setDocuments(await listKnowledgeDocuments(selectedId, workspaceId));
      setDocumentTitle('');
      setDocumentText('');
      setDocumentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (cause) {
      setDocumentError(getMessage(cause));
    } finally {
      setDocumentSaving(false);
    }
  }

  async function handleRetry(documentId: string) {
    setDocumentError('');
    try {
      await retryKnowledgeDocument(documentId, workspaceId);
      if (selectedId) setDocuments(await listKnowledgeDocuments(selectedId, workspaceId));
    } catch (cause) {
      setDocumentError(getMessage(cause));
    }
  }

  async function handleToggleBaseStatus() {
    if (!selectedId || !selectedBaseStatus || updatingBaseStatus || deletingBase) return;
    const status = selectedBaseStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setUpdatingBaseStatus(true);
    setError('');
    try {
      const updated = await updateKnowledgeBaseStatus(selectedId, workspaceId, status);
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(getMessage(cause));
    } finally {
      setUpdatingBaseStatus(false);
    }
  }

  async function handleDeleteBase() {
    if (!selectedId || deletingBase || updatingBaseStatus) return;
    const baseId = selectedId;
    const base = items.find((item) => item.id === baseId);
    if (!window.confirm(`确定删除知识库「${base?.name ?? '当前知识库'}」吗？其中的 ${documents.length} 份文档、切片和向量也会永久删除，无法恢复。`)) return;
    setDeletingBase(true);
    setError('');
    try {
      await deleteKnowledgeBase(baseId, workspaceId);
      const remaining = await listKnowledgeBases(workspaceId);
      setItems(remaining);
      setSelectedId((current) => current === baseId ? remaining[0]?.id ?? null : current);
      if (remaining.length === 0) setCreatingBase(true);
    } catch (cause) {
      setError(getMessage(cause));
    } finally {
      setDeletingBase(false);
    }
  }

  async function handleDeleteDocument(document: KnowledgeDocument) {
    if (deletingDocumentId || document.status === 'PROCESSING') return;
    if (!window.confirm(`确定删除文档「${document.title}」吗？其 ${document.chunkCount} 个切片和向量也会永久删除，无法恢复。`)) return;
    setDeletingDocumentId(document.id);
    setDocumentError('');
    try {
      await deleteKnowledgeDocument(document.id, workspaceId);
      if (selectedId === document.knowledgeBaseId) {
        const remaining = await listKnowledgeDocuments(selectedId, workspaceId);
        setDocuments(remaining);
        setSelectedDocumentId((current) => current === document.id ? remaining.find((item) => item.status === 'READY')?.id ?? null : current);
        setChunkPage(1);
        searchGenerationRef.current += 1;
        setSearchResult(null);
        setSearching(false);
      }
    } catch (cause) {
      setDocumentError(getMessage(cause));
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || selectedBaseStatus !== 'ACTIVE' || !query.trim() || searching) return;
    setSearching(true);
    setSearchError('');
    setSearchResult(null);
    const generation = ++searchGenerationRef.current;
    try {
      const result = await previewKnowledgeSearch(selectedId, workspaceId, query.trim());
      if (searchGenerationRef.current === generation) setSearchResult(result);
    } catch (cause) {
      if (searchGenerationRef.current === generation) setSearchError(getMessage(cause));
    } finally {
      if (searchGenerationRef.current === generation) setSearching(false);
    }
  }

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const selectedBase = items.find((item) => item.id === selectedId);
  const readyDocuments = documents.filter((document) => document.status === 'READY');

  return (
    <section className="feature-page knowledge-page" aria-label="知识库">
      <div className="knowledge-content">
        <header className="knowledge-heading">
          <div>
            <p className="knowledge-eyebrow">KNOWLEDGE / 01</p>
            <h1>知识库</h1>
            <p>创建知识库、录入资料，并查看切片与检索结果。</p>
          </div>
          <span className="knowledge-workspace">{workspaceId === 'ws-local-demo' ? '本地测试工作空间' : '个人工作空间'}：{workspaceId}</span>
        </header>

        <div className="knowledge-shell">
          <aside className="knowledge-sidebar" aria-label="知识库列表">
            <div className="knowledge-card knowledge-catalog">
              <div className="knowledge-list-heading"><h2>知识库</h2><span>{items.length} 个</span></div>
              {error && <p className="knowledge-error" role="alert">{error}</p>}
              {loading ? <p className="knowledge-empty">正在加载…</p> : items.length === 0 ? (
                <p className="knowledge-empty">还没有知识库，先在下方创建一个。</p>
              ) : <ul>{items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`knowledge-catalog-item ${selectedId === item.id ? 'is-selected' : ''}`} disabled={deletingBase || updatingBaseStatus || deletingDocumentId !== null} onClick={() => setSelectedId(item.id)} aria-current={selectedId === item.id ? 'page' : undefined}>
                    <span><strong>{item.name}</strong><span className={`knowledge-status ${item.status === 'DISABLED' ? 'is-disabled' : ''}`}>{item.status === 'ACTIVE' ? '可用' : '已停用'}</span></span>
                    <small>{item.description || '暂无说明'}</small>
                  </button>
                </li>
              ))}</ul>}
              <button className="knowledge-create-toggle" type="button" onClick={() => setCreatingBase((current) => !current)}>{creatingBase ? '收起新建' : '＋ 新建知识库'}</button>
            </div>
            {creatingBase && <form className="knowledge-card knowledge-form knowledge-create-form" onSubmit={handleCreate}>
              <h2>新建知识库</h2>
              <label htmlFor="knowledge-name">名称</label>
              <input id="knowledge-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} required placeholder="例如：报销制度" />
              <label htmlFor="knowledge-description">说明</label>
              <textarea id="knowledge-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} rows={3} placeholder="这份知识库用于什么？" />
              <button type="submit" disabled={saving || !name.trim()}>{saving ? '创建中…' : '创建知识库'}</button>
            </form>}
          </aside>

          <div className="knowledge-workbench">
            {selectedId ? <>
              <div className="knowledge-workbench-heading">
                <div><p>当前知识库</p><h2>{selectedBase?.name ?? '知识库'}</h2><span>{selectedBase?.description || '暂无说明'}</span></div>
                <div className="knowledge-workbench-actions">
                  {selectedBaseStatus === 'ACTIVE' ? <div className="knowledge-workbench-stats"><span>{documents.length} 份文档</span><span>{documents.reduce((sum, document) => sum + document.chunkCount, 0)} 个切片</span></div> : <span className="knowledge-status is-disabled">已停用 · 资料保留</span>}
                  <div className="knowledge-status-actions">
                    <button className="knowledge-status-toggle" type="button" disabled={updatingBaseStatus || deletingBase} onClick={() => void handleToggleBaseStatus()}>{updatingBaseStatus ? '更新中…' : selectedBaseStatus === 'DISABLED' ? '重新启用' : '停用知识库'}</button>
                    <button className="knowledge-delete" type="button" disabled={deletingBase || updatingBaseStatus || hasProcessing} title={hasProcessing ? '请等待文档处理完成' : undefined} onClick={() => void handleDeleteBase()}>{deletingBase ? '删除中…' : '删除知识库'}</button>
                  </div>
                </div>
              </div>
              {selectedBaseStatus === 'DISABLED' && <section className="knowledge-card knowledge-disabled-panel" role="status"><h2>知识库已停用</h2><p>资料、切片和向量仍保留。停用期间不能录入资料、查看切片或检索；重新启用后可继续使用。</p></section>}
              {selectedBaseStatus === 'ACTIVE' && <>
              <div className="knowledge-tabs" role="tablist" aria-label="知识库功能">
                <button type="button" role="tab" aria-selected={activeTab === 'documents'} className={activeTab === 'documents' ? 'is-active' : ''} onClick={() => setActiveTab('documents')}>文档管理</button>
                <button type="button" role="tab" aria-selected={activeTab === 'chunks'} className={activeTab === 'chunks' ? 'is-active' : ''} onClick={() => setActiveTab('chunks')}>切片查看</button>
                <button type="button" role="tab" aria-selected={activeTab === 'search'} className={activeTab === 'search' ? 'is-active' : ''} onClick={() => setActiveTab('search')}>检索预览</button>
              </div>

              {activeTab === 'documents' && <div className="knowledge-documents-view" role="tabpanel">
                <form className="knowledge-card knowledge-form" onSubmit={handleDocumentSubmit}>
                  <h2>录入资料</h2>
                  <p className="knowledge-hint">资料将保存到当前知识库。</p>
                  <div className="knowledge-mode" role="group" aria-label="录入方式">
                    <button type="button" className={sourceMode === 'text' ? 'is-active' : ''} onClick={() => setSourceMode('text')}>粘贴文本</button>
                    <button type="button" className={sourceMode === 'file' ? 'is-active' : ''} onClick={() => setSourceMode('file')}>上传文件</button>
                  </div>
                  <label htmlFor="document-title">文档标题{sourceMode === 'file' ? '（可选）' : ''}</label>
                  <input id="document-title" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} maxLength={100} required={sourceMode === 'text'} placeholder={sourceMode === 'file' ? '留空则使用文件名' : '例如：报销规则'} />
                  {sourceMode === 'text' ? (
                    <><label htmlFor="document-text">正文</label><textarea id="document-text" value={documentText} onChange={(event) => setDocumentText(event.target.value)} rows={8} required placeholder="在此粘贴资料正文" /></>
                  ) : (
                    <><label htmlFor="document-file">TXT / JSON 文件，最多 1 MB</label><input id="document-file" ref={fileInputRef} type="file" accept=".txt,.json" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required /></>
                  )}
                  <button type="submit" disabled={documentSaving}>{documentSaving ? '提交中…' : '提交资料'}</button>
                </form>
                <section className="knowledge-card knowledge-list">
                  <div className="knowledge-list-heading"><h2>文档处理状态</h2><span>{documents.length} 份</span></div>
                  {documentError && <p className="knowledge-error" role="alert">{documentError}</p>}
                  {documentLoading && documents.length === 0 ? <p className="knowledge-empty">正在加载…</p> : documents.length === 0 ? (
                    <p className="knowledge-empty">这个知识库还没有资料。</p>
                  ) : <ul>{documents.map((document) => (
                    <li key={document.id}>
                      <div><strong>{document.title}</strong><span className={`knowledge-document-status status-${document.status.toLowerCase()}`}>{document.status === 'PROCESSING' ? '处理中' : document.status === 'READY' ? '可检索' : '处理失败'}</span></div>
                      <p>{document.sourceType} · {document.status === 'PROCESSING' ? document.stage : `片段数 ${document.chunkCount}`}</p>
                      {document.error && <p className="knowledge-document-error">{document.error.message}</p>}
                      {document.status === 'READY' && <button className="knowledge-retry" type="button" onClick={() => { setSelectedDocumentId(document.id); setChunkPage(1); setActiveTab('chunks'); }}>查看切片</button>}
                      {document.status === 'FAILED' && <button className="knowledge-retry" type="button" onClick={() => void handleRetry(document.id)}>重新处理</button>}
                      <button className="knowledge-delete knowledge-delete-document" type="button" disabled={document.status === 'PROCESSING' || deletingDocumentId !== null} title={document.status === 'PROCESSING' ? '请等待文档处理完成' : undefined} onClick={() => void handleDeleteDocument(document)}>{deletingDocumentId === document.id ? '删除中…' : '删除文档'}</button>
                      <small>{new Date(document.createdAt).toLocaleString('zh-CN')}</small>
                    </li>
                  ))}</ul>}
                </section>
              </div>}

              {activeTab === 'chunks' && <section className="knowledge-card knowledge-preview" role="tabpanel" aria-label="切片内容">
                <div className="knowledge-panel-heading"><div><h2>切片查看</h2><p>查看资料入库后实际生成的片段。</p></div><span>{chunks?.total ?? 0} 个片段</span></div>
                <label className="knowledge-document-picker" htmlFor="knowledge-document-picker">选择文档
                  <select id="knowledge-document-picker" value={selectedDocumentId ?? ''} onChange={(event) => { setSelectedDocumentId(event.target.value || null); setChunkPage(1); }}>
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
                  <button type="button" disabled={chunkPage === 1 || chunkLoading} onClick={() => setChunkPage((page) => page - 1)}>上一页</button>
                  <span>第 {chunkPage} / {Math.ceil(chunks.total / chunks.pageSize)} 页</span>
                  <button type="button" disabled={chunkPage * chunks.pageSize >= chunks.total || chunkLoading} onClick={() => setChunkPage((page) => page + 1)}>下一页</button>
                </div>}
              </section>}

              {activeTab === 'search' && <section className="knowledge-card knowledge-preview" role="tabpanel" aria-label="检索预览">
                <div className="knowledge-panel-heading"><div><h2>检索预览</h2><p>输入问题，查看当前知识库实际匹配的片段；这里不生成 AI 回答。</p></div></div>
                <form className="knowledge-search-form" onSubmit={handleSearch}>
                  <label htmlFor="knowledge-query">问题</label>
                  <div className="knowledge-search-row"><textarea id="knowledge-query" value={query} onChange={(event) => setQuery(event.target.value)} rows={2} maxLength={8000} placeholder="例如：出差交通费怎么报销？" required />
                    <button type="submit" disabled={searching || !query.trim()}>{searching ? '检索中…' : '检索片段'}</button></div>
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
            </> : <div className="knowledge-card knowledge-empty-workbench"><h2>选择知识库</h2><p>从左侧选择一个知识库，开始管理文档、查看切片或预览检索。</p></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function getMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '请求失败，请稍后重试';
}
