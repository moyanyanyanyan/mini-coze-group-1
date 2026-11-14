import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KnowledgeView } from '@minicoze/ui/knowledge';
import { useConfirm } from '@minicoze/ui/hooks';
import { KnowledgeCenterPage } from './KnowledgeCenterPage';
import { createKnowledgeBase, createTextDocument, getKnowledgeWorkspaceId, deleteKnowledgeBase, deleteKnowledgeDocument, getKnowledgeDocumentContent, listKnowledgeBases, listKnowledgeDocuments, previewKnowledgeSearch, retryKnowledgeDocument, updateKnowledgeBaseStatus, uploadDocumentFile, type KnowledgeBase, type KnowledgeDocument, type KnowledgeSearchResult } from './knowledge.api';
import { navigate, usePathname } from '../../shared/routing/navigation';



export function KnowledgePage() {
  const pathname = usePathname();
  const detailPrefix = '/workspace/knowledge/';
  if (!pathname.startsWith(detailPrefix)) return <KnowledgeCenterPage />;
  const knowledgeBaseId = decodeURIComponent(pathname.slice(detailPrefix.length));
  return <KnowledgeDetailPage knowledgeBaseId={knowledgeBaseId} />;
}

function KnowledgeDetailPage({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { confirm, confirmation } = useConfirm();
  const [workspaceId, setWorkspaceId] = useState('');
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingBase, setCreatingBase] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [documentError, setDocumentError] = useState('');
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [deletingBase, setDeletingBase] = useState(false);
  const [updatingBaseStatus, setUpdatingBaseStatus] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [addingDocument, setAddingDocument] = useState(false);
  const [sourceMode, setSourceMode] = useState<'text' | 'file'>('text');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentDrawerOpen, setDocumentDrawerOpen] = useState(false);
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [documentContentLoading, setDocumentContentLoading] = useState(false);
  const [documentContentError, setDocumentContentError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [contentByDocumentId, setContentByDocumentId] = useState<Record<string, string>>({});
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
      .then((result) => { if (!active) return;
        setItems(result);
        const selected = result.find(item => item.id === knowledgeBaseId);
        setSelectedId(selected?.id ?? null);
        if (!selected) setError('知识库不存在或无权访问'); })
      .catch((cause: unknown) => { if (active) setError(getMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId, knowledgeBaseId]);

  const hasProcessing = documents.some((document) => document.status === 'PROCESSING');
  useEffect(() => {
    searchGenerationRef.current += 1;
    setActiveTab('documents');
    setAddingDocument(false);
    setSelectedDocumentId(null);
    setDocumentDrawerOpen(false);
    setDocumentContent(null);
    setDocumentContentError('');
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
        setDocumentError('');
      } })
      .catch((cause: unknown) => { if (active) setDocumentError(getMessage(cause)); })
      .finally(() => { if (active) setDocumentLoading(false); });
    void refresh();
    const timer = hasProcessing ? window.setInterval(() => void refresh(), 2000) : undefined;
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); };
  }, [workspaceId, selectedId, selectedBaseStatus, hasProcessing]);

  useEffect(() => {
    const selectedDocumentStatus = documents.find((document) => document.id === selectedDocumentId)?.status;
    if (!workspaceId || !selectedDocumentId || !documentDrawerOpen || selectedDocumentStatus !== 'READY') {
      setDocumentContent(null);
      setDocumentContentLoading(false);
      setDocumentContentError('');
      return;
    }
    let active = true;
    setDocumentContentLoading(true);
    setDocumentContentError('');
    getKnowledgeDocumentContent(selectedDocumentId, workspaceId)
      .then((result) => { if (active) setDocumentContent(result.content); })
      .catch((cause: unknown) => { if (active) { setDocumentContent(null); setDocumentContentError(getMessage(cause)); } })
      .finally(() => { if (active) setDocumentContentLoading(false); });
    return () => { active = false; };
  }, [workspaceId, selectedDocumentId, documentDrawerOpen, documents]);

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
    if (!await confirm(`确定删除知识库「${base?.name ?? '当前知识库'}」吗？其中的 ${documents.length} 份文档、切片和向量也会永久删除，无法恢复。`)) return;
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
    if (!await confirm(`确定删除文档「${document.title}」吗？其 ${document.chunkCount} 个切片和向量也会永久删除，无法恢复。`)) return;
    setDeletingDocumentId(document.id);
    setDocumentError('');
    try {
      await deleteKnowledgeDocument(document.id, workspaceId);
      if (selectedId === document.knowledgeBaseId) {
        const remaining = await listKnowledgeDocuments(selectedId, workspaceId);
        setDocuments(remaining);
        setSelectedDocumentId((current) => current === document.id ? null : current);
        setDocumentDrawerOpen((current) => current && selectedDocumentId !== document.id);
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
    const generation = ++searchGenerationRef.current;
    try {
      const result = await previewKnowledgeSearch(selectedId, workspaceId, query.trim());
      if (searchGenerationRef.current === generation) {
        setSearchResult(result);
        const documentIds = [...new Set(result.hits.map((hit) => hit.documentId))];
        const contents = await Promise.all(documentIds.map(async (documentId) => {
          try { return [documentId, (await getKnowledgeDocumentContent(documentId, workspaceId)).content] as const; }
          catch { return null; }
        }));
        if (searchGenerationRef.current === generation) setContentByDocumentId(Object.fromEntries(contents.filter((entry): entry is readonly [string, string] => entry !== null)));
      }
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
    <KnowledgeView
      catalog={{
        items, name, description, loading, saving, creatingBase, error, selectedId,
        selectedBase, selectedBaseStatus, deletingBase, updatingBaseStatus, canCreate: Boolean(name.trim()),
      }}
      documentState={{
        activeTab, documents, documentError, documentLoading, documentSaving, deletingDocumentId,
        addingDocument, sourceMode, documentTitle, documentText, selectedDocumentId, selectedDocument,
        documentDrawerOpen, readyDocuments, hasProcessing,
      }}
      documentContentState={{ content: documentContent, loading: documentContentLoading, error: documentContentError }}
      searchState={{ query, searchResult, contentByDocumentId, searching, searchError, canSearch: Boolean(query.trim()) }}
      confirmation={confirmation}
      fileInputRef={fileInputRef}
      onBackToCenter={() => navigate('/workspace/knowledge')}
      actions={{
        onSelectBase: setSelectedId,
        onToggleCreate: () => setCreatingBase((current) => !current),
        onStartCreate: () => setCreatingBase(true),
        onNameChange: setName,
        onDescriptionChange: setDescription,
        handleCreate,
        handleToggleBaseStatus,
        handleDeleteBase,
        onActiveTabChange: setActiveTab,
        onToggleDocumentForm: () => setAddingDocument(!addingDocument),
        onSourceModeChange: setSourceMode,
        onDocumentTitleChange: setDocumentTitle,
        onDocumentTextChange: setDocumentText,
        onDocumentFileChange: setDocumentFile,
        handleDocumentSubmit,
        handleRetry,
        onViewDocumentChunks: (id) => { setSelectedDocumentId(id); setDocumentDrawerOpen(true); },
        onCloseDocumentDrawer: () => setDocumentDrawerOpen(false),
        handleDeleteDocument: (id) => {
          const document = documents.find((item) => item.id === id);
          if (document) void handleDeleteDocument(document);
        },
        onSelectedDocumentChange: setSelectedDocumentId,
        onQueryChange: setQuery,
        handleSearch,
      }}
    />
  );
}

function getMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '请求失败，请稍后重试';
}
