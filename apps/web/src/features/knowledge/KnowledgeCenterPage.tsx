import { useEffect, useState, type FormEvent } from 'react';
import { KnowledgeCenterView } from '@minicoze/ui/knowledge';
import { createKnowledgeBase, getKnowledgeWorkspaceId, listKnowledgeBases, type KnowledgeBase } from './knowledge.api';
import { navigate } from '../../shared/routing/navigation';

export function KnowledgeCenterPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingBase, setCreatingBase] = useState(false);

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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const created = await createKnowledgeBase({ workspaceId, name: name.trim(), description: description.trim() });
      setItems(await listKnowledgeBases(workspaceId));
      setName('');
      setDescription('');
      setCreatingBase(false);
      navigate(`/workspace/knowledge/${encodeURIComponent(created.id)}`);
    } catch (cause) {
      setError(getMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return <KnowledgeCenterView
    items={items.map((item) => ({ id: item.id, name: item.name, description: item.description, status: item.status }))}
    loading={loading}
    error={error}
    name={name}
    description={description}
    saving={saving}
    creatingBase={creatingBase}
    canCreate={Boolean(name.trim())}
    actions={{
      onToggleCreate: () => setCreatingBase((current) => !current),
      onNameChange: setName,
      onDescriptionChange: setDescription,
      handleCreate,
      onOpenDetail: (id) => navigate(`/workspace/knowledge/${encodeURIComponent(id)}`),
    }}
  />;
}

function getMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '请求失败，请稍后重试';
}
