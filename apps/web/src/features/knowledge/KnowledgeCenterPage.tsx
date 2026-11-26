import { useEffect, useState, type FormEvent } from 'react';
import { KnowledgeCenterView } from '@minicoze/ui/knowledge';
import { createKnowledgeBase, getKnowledgeWorkspaceId, listKnowledgeBases, updateKnowledgeBase, type KnowledgeBase } from './knowledge.api';
import { navigate, useRouteLocation } from '../../shared/routing/navigation';

export function KnowledgeCenterPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingBase, setCreatingBase] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingItem = items.find((item) => item.id === editingId) ?? null;
  const routeLocation = useRouteLocation();
  const editId = new URLSearchParams(routeLocation.split('?')[1] ?? '').get('edit');

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
      .then((result) => { if (active) { setItems(result); setError(''); } })
      .catch((cause: unknown) => { if (active) setError(getMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    if (editId && !editingId && items.some((item) => item.id === editId)) openEdit(editId);
  }, [editId, editingId, items]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const input = { workspaceId, name: name.trim(), description: description.trim() };
      const saved = editingId ? await updateKnowledgeBase(editingId, input) : await createKnowledgeBase(input);
      setItems(await listKnowledgeBases(workspaceId));
      setName('');
      setDescription('');
      setCreatingBase(false);
      setEditingId(null);
      if (editingId) navigate('/workspace/knowledge');
      else navigate(`/workspace/knowledge/${encodeURIComponent(saved.id)}`);
    } catch (cause) {
      setError(getMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    setCreatingBase(false);
    setEditingId(null);
    setName('');
    setDescription('');
  }

  function openCreate() {
    setEditingId(null);
    setName('');
    setDescription('');
    setCreatingBase(true);
  }

  function openEdit(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    setEditingId(id);
    setName(item.name);
    setDescription(item.description);
    setCreatingBase(true);
  }

  return <KnowledgeCenterView
    items={items.map((item) => ({ id: item.id, name: item.name, description: item.description, status: item.status }))}
    editingItem={editingItem ? { id: editingItem.id, name: editingItem.name, description: editingItem.description, status: editingItem.status } : null}
    loading={loading}
    error={error}
    name={name}
    description={description}
    saving={saving}
    creatingBase={creatingBase}
    canCreate={Boolean(name.trim())}
    actions={{
      onToggleCreate: () => { if (creatingBase) closeEditor(); else openCreate(); },
      onNameChange: setName,
      onDescriptionChange: setDescription,
      handleCreate,
      onOpenDetail: (id) => navigate(`/workspace/knowledge/${encodeURIComponent(id)}`),
      onOpenEdit: openEdit,
    }}
  />;
}

function getMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '请求失败，请稍后重试';
}
