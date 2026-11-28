import React from 'react';
import type { Workflow } from '../types/workflow';
import '../workflow-editor.css';
export interface WorkflowListContentProps {
  notice: string;
  confirmation: React.ReactNode;
  data: Workflow[];
  loading: boolean;
  appliedKeyword: string;
  keyword: string;
  createOpen: boolean;
  form: { name: string; description: string };
  submitting: boolean;
  renameTarget: Workflow | null;
  renameName: string;
  renaming: boolean;
  setNotice: (value: string) => void;
  setKeyword: (value: string) => void;
  setCreateOpen: (value: boolean) => void;
  setForm: (value: { name: string; description: string }) => void;
  setRenameTarget: (value: null) => void;
  setRenameName: (value: string) => void;
  load: (query: string) => void;
  handleOpen: (id: string) => void;
  handleCreate: () => void;
  handleDelete: (id: string, name: string) => void;
  openRename: (id: string) => void;
  handleRename: () => void;
}

export function WorkflowListContent({
  notice,
  confirmation,
  data,
  loading,
  appliedKeyword,
  keyword,
  createOpen,
  form,
  submitting,
  renameTarget,
  renameName,
  renaming,
  setNotice,
  setKeyword,
  setCreateOpen,
  setForm,
  setRenameTarget,
  setRenameName,
  load,
  handleOpen,
  handleCreate,
  handleDelete,
  openRename,
  handleRename,
}: WorkflowListContentProps) {
  const statusLabel = (s: Workflow['status']) =>
    s === 'DRAFT' ? '草稿' : s === 'ACTIVE' ? '已发布' : '已归档';

  return (
    <section className="wf-list-page" aria-label="工作流列表">
      {confirmation}
      {notice && <div className="wf-notice wf-feedback-fixed" role="alert"><span>{notice}</span><button className="wf-btn wf-btn-outline" onClick={() => setNotice('')}>关闭提示</button></div>}
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
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && load(keyword.trim())}
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
          {appliedKeyword ? (
            <>
              <p>未找到“{appliedKeyword}”</p>
              <button className="wf-btn wf-btn-outline" onClick={() => {
                setKeyword('');
                void load('');
              }}>清除搜索</button>
            </>
          ) : (
            <>
              <p>还没有工作流</p>
              <button className="wf-btn wf-btn-primary" onClick={() => setCreateOpen(true)}>
                新建第一个工作流
              </button>
            </>
          )}
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
                <button className="wf-btn wf-btn-outline" onClick={() => openRename(wf.id)}>
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
