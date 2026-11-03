// src/features/workflow-editor/components/WorkflowListView.tsx
import React from 'react';
import { useEffect, useState } from 'react';
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

export function WorkflowListView() {
  const [data, setData] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // 重命名相关 state —— 必须在组件内
  const [renameTarget, setRenameTarget] = useState<Workflow | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listWorkflows({ keyword });
      setData(res.items);
    } catch (e) {
      alert(getErrorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
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
      alert('请输入名称');
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
      alert(getErrorMessage(e, '创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除「${name}」？`)) return;
    try {
      await deleteWorkflow(id);
      load();
    } catch (e) {
      alert(getErrorMessage(e, '删除失败'));
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
      alert('请输入名称');
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
      alert(getErrorMessage(e, '重命名失败'));
    } finally {
      setRenaming(false);
    }
  };

  const statusLabel = (s: Workflow['status']) =>
    s === 'DRAFT' ? '草稿' : s === 'ACTIVE' ? '已发布' : '已归档';

  return (
    <section className="wf-list-page" aria-label="工作流列表">
      <header className="wf-list-header">
        <div>
          <h1>工作流</h1>
          <p className="wf-list-subtitle">编排并运行智能体流程</p>
        </div>
        <div className="wf-list-actions">
          <input
            className="wf-input"
            placeholder="搜索工作流名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button className="wf-btn wf-btn-primary" onClick={() => setCreateOpen(true)}>
            + 新建工作流
          </button>
        </div>
      </header>

      {loading ? (
        <div className="wf-empty">加载中...</div>
      ) : data.length === 0 ? (
        <div className="wf-empty">
          <p>还没有工作流</p>
          <button className="wf-btn wf-btn-primary" onClick={() => setCreateOpen(true)}>
            新建第一个工作流
          </button>
        </div>
      ) : (
        <div className="wf-grid">
          {data.map((wf) => (
            <article className="wf-card" key={wf.id}>
              <div className="wf-card-head">
                <button className="wf-card-title" onClick={() => handleOpen(wf.id)}>
                  {wf.name}
                </button>
                <span className={`wf-status wf-status-${wf.status.toLowerCase()}`}>
                  {statusLabel(wf.status)}
                </span>
              </div>
              <p className="wf-card-desc">{wf.description || '暂无描述'}</p>
              <div className="wf-card-meta">
                <span>{wf.nodeCount ?? 0} 个节点</span>
                <span>{new Date(wf.updatedAt).toLocaleString()}</span>
              </div>
              <div className="wf-card-actions">
                <button className="wf-btn wf-btn-outline" onClick={() => handleOpen(wf.id)}>
                  编辑
                </button>
                <button className="wf-btn wf-btn-outline" onClick={() => openRename(wf)}>
                  重命名
                </button>
                <button
                  className="wf-btn wf-btn-outline wf-btn-danger"
                  onClick={() => handleDelete(wf.id, wf.name)}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="wf-modal-mask" onClick={() => setCreateOpen(false)}>
          <div className="wf-modal" onClick={(e) => e.stopPropagation()}>
            <h3>新建工作流</h3>
            <label className="wf-field">
              <span>名称 <em>*</em></span>
              <input
                className="wf-input"
                value={form.name}
                maxLength={50}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：客户问答流程"
                autoFocus
              />
            </label>
            <label className="wf-field">
              <span>描述</span>
              <textarea
                className="wf-textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="选填"
              />
            </label>
            <div className="wf-modal-foot">
              <button className="wf-btn wf-btn-outline" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button
                className="wf-btn wf-btn-primary"
                onClick={handleCreate}
                disabled={submitting}
              >
                {submitting ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="wf-modal-mask" onClick={() => setRenameTarget(null)}>
          <div className="wf-modal" onClick={(e) => e.stopPropagation()}>
            <h3>重命名工作流</h3>
            <label className="wf-field">
              <span>名称 <em>*</em></span>
              <input
                className="wf-input"
                value={renameName}
                maxLength={50}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                autoFocus
              />
            </label>
            <div className="wf-modal-foot">
              <button className="wf-btn wf-btn-outline" onClick={() => setRenameTarget(null)}>
                取消
              </button>
              <button
                className="wf-btn wf-btn-primary"
                onClick={handleRename}
                disabled={renaming}
              >
                {renaming ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}