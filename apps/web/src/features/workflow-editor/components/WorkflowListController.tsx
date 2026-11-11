import { WorkflowListContent } from '@minicoze/ui/workflow-editor';
// src/features/workflow-editor/components/WorkflowListController.tsx
import React from 'react';
import { useConfirm } from '@minicoze/ui/hooks';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../../shared/routing/navigation';
import {
  listWorkflows,
  createWorkflow,
  deleteWorkflow,
  updateWorkflow,
} from '../services/workflow';
import type { Workflow } from '../types/workflow';

const BASE = '/workspace/workflows';

function getErrorMessage(e: unknown, fallback = '未知错误'): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return fallback;
}

export function WorkflowListController() {
  const [notice, setNotice] = useState('');
  const { confirm, confirmation } = useConfirm();
  const [data, setData] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const latestLoad = useRef(0);
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(() => new URLSearchParams(window.location.search).get('action') === 'new');
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // 重命名相关 state —— 必须在组件内
  const [renameTarget, setRenameTarget] = useState<Workflow | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = async (query = appliedKeyword) => {
    const request = ++latestLoad.current;
    setLoading(true);
    try {
      const res = await listWorkflows({ keyword: query });
      if (request !== latestLoad.current) return;
      setAppliedKeyword(query);
      setData(res.items);
    } catch (e) {
      if (request === latestLoad.current) setNotice(getErrorMessage(e, '加载失败'));
    } finally {
      if (request === latestLoad.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = (id: string) => {
    navigate(`${BASE}/${id}`);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setNotice('请输入名称');
      return;
    }
    setSubmitting(true);
    try {
      const wf = await createWorkflow({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      handleOpen(wf.id);
    } catch (e) {
      setNotice(getErrorMessage(e, '创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm(`确定删除「${name}」？删除后无法恢复。`)) return;
    try {
      await deleteWorkflow(id);
      load();
    } catch (e) {
      setNotice(getErrorMessage(e, '删除失败'));
    }
  };

  // 重命名 —— 也在组件内
  const openRename = (wf: Workflow) => {
    setRenameTarget(wf);
    setRenameName(wf.name);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) {
      setNotice('请输入名称');
      return;
    }
    if (name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setRenaming(true);
    try {
      await updateWorkflow(renameTarget.id, { name });
      setData((prev) =>
        prev.map((w) =>
          w.id === renameTarget.id
            ? { ...w, name, updatedAt: new Date().toISOString() }
            : w,
        ),
      );
      setRenameTarget(null);
    } catch (e) {
      setNotice(getErrorMessage(e, '重命名失败'));
    } finally {
      setRenaming(false);
    }
  };

  return <WorkflowListContent
    notice={notice}
    confirmation={confirmation}
    data={data}
    loading={loading}
    appliedKeyword={appliedKeyword}
    keyword={keyword}
    createOpen={createOpen}
    form={form}
    submitting={submitting}
    renameTarget={renameTarget}
    renameName={renameName}
    renaming={renaming}
    setNotice={setNotice}
    setKeyword={setKeyword}
    setCreateOpen={setCreateOpen}
    setForm={setForm}
    setRenameTarget={setRenameTarget}
    setRenameName={setRenameName}
    load={load}
    handleOpen={handleOpen}
    handleCreate={handleCreate}
    handleDelete={handleDelete}
    openRename={(id) => { const workflow = data.find((item) => item.id === id); if (workflow) openRename(workflow); }}
    handleRename={handleRename}
  />;
}
