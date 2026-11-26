import { useEffect, useRef } from 'react';
import type { KnowledgeCenterViewProps } from './types';
import './knowledge.css';

export function KnowledgeCenterView({ items, editingItem, loading, error, name, description, saving, creatingBase, canCreate, actions }: KnowledgeCenterViewProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(saving);
  const toggleCreateRef = useRef(actions.onToggleCreate);
  savingRef.current = saving;
  toggleCreateRef.current = actions.onToggleCreate;
  useEffect(() => {
    if (!creatingBase) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) toggleCreateRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    nameInputRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [creatingBase]);

  const openCreateDialog = () => actions.onToggleCreate();

  return (
    <section className="feature-page knowledge-page" aria-label="知识库中心">
      <div className="knowledge-content knowledge-center-content">
        <header className="knowledge-center-heading">
          <div><h1>知识库</h1><p>集中管理你的知识库，为 Agent 提供可检索的资料</p></div>
          <button type="button" className="knowledge-add-document" onClick={openCreateDialog}>＋ 新建知识库</button>
        </header>
        {error && <p className="knowledge-error" role="alert">{error}</p>}
        {creatingBase && <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) actions.onToggleCreate(); }}>
          <form className="knowledge-modal knowledge-form knowledge-create-form" role="dialog" aria-modal="true" aria-labelledby="center-knowledge-dialog-title" onSubmit={actions.handleCreate} onMouseDown={(event) => event.stopPropagation()}>
            <div className="knowledge-modal-header"><h2 id="center-knowledge-dialog-title">{editingItem ? '编辑知识库' : '新建知识库'}</h2><button type="button" className="knowledge-modal-close" aria-label="关闭弹窗" onClick={actions.onToggleCreate} disabled={saving}>×</button></div>
            <label htmlFor="center-knowledge-name">名称</label>
            <input ref={nameInputRef} id="center-knowledge-name" value={name} onChange={(event) => actions.onNameChange(event.target.value)} maxLength={50} required placeholder="例如：报销制度" />
            <label htmlFor="center-knowledge-description">说明</label>
            <textarea id="center-knowledge-description" value={description} onChange={(event) => actions.onDescriptionChange(event.target.value)} maxLength={200} rows={3} placeholder="这份知识库用于什么？" />
            <span className="knowledge-field-count">{description.length} / 200</span>
            <div className="knowledge-center-create-actions"><button type="submit" disabled={saving || !canCreate}>{saving ? (editingItem ? '保存中…' : '创建中…') : editingItem ? '保存修改' : '创建知识库'}</button><button type="button" onClick={actions.onToggleCreate} disabled={saving}>取消</button></div>
          </form>
        </div>}
        <section className="knowledge-center-section">
          {loading ? <p className="knowledge-empty">正在加载…</p> : items.length === 0 ? <div className="knowledge-card knowledge-center-empty"><h3>还没有知识库</h3><p>创建一个知识库，集中管理可供 Agent 检索的资料。</p><button type="button" className="knowledge-first-create" onClick={openCreateDialog}>创建第一个知识库</button></div> : <div className="knowledge-center-grid">{items.map((item) => <article className="knowledge-card knowledge-base-card" key={item.id} role="button" tabIndex={0} aria-label={`进入知识库 ${item.name}`} onClick={() => actions.onOpenDetail(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actions.onOpenDetail(item.id); } }}><div className="knowledge-base-card-header"><div className="knowledge-base-card-title"><h3>{item.name}</h3></div><span className={`knowledge-status${item.status === 'DISABLED' ? ' is-disabled' : ''}`}>{item.status === 'ACTIVE' ? '已启用' : '已停用'}</span></div><p className={`knowledge-base-card-description${item.description ? '' : ' is-empty'}`}>{item.description || '未添加描述'}</p><div className="knowledge-base-card-footer"><span aria-hidden="true" /> <button type="button" onClick={(event) => { event.stopPropagation(); actions.onOpenDetail(item.id); }}>进入知识库 →</button></div></article>)}</div>}
        </section>
      </div>
    </section>
  );
}
