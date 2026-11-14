import { useRef } from 'react';
import type { KnowledgeCenterViewProps } from './types';
import './knowledge.css';

export function KnowledgeCenterView({ items, loading, error, name, description, saving, creatingBase, canCreate, actions }: KnowledgeCenterViewProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="feature-page knowledge-page" aria-label="知识库中心">
      <div className="knowledge-content knowledge-center-content">
        <header className="knowledge-center-heading">
          <div><h1>知识库</h1><p>集中管理你的知识库，为 Agent 提供可检索的资料。</p></div>
          <button type="button" className="knowledge-add-document" onClick={() => { actions.onToggleCreate(); setTimeout(() => nameInputRef.current?.focus(), 0); }}>＋ 新建知识库</button>
        </header>
        {error && <p className="knowledge-error" role="alert">{error}</p>}
        {creatingBase && <form className="knowledge-card knowledge-form knowledge-create-form knowledge-center-create" onSubmit={actions.handleCreate}>
          <h2>新建知识库</h2>
          <label htmlFor="center-knowledge-name">名称</label>
          <input ref={nameInputRef} autoFocus id="center-knowledge-name" value={name} onChange={(event) => actions.onNameChange(event.target.value)} maxLength={50} required placeholder="例如：报销制度" />
          <label htmlFor="center-knowledge-description">说明</label>
          <textarea id="center-knowledge-description" value={description} onChange={(event) => actions.onDescriptionChange(event.target.value)} maxLength={200} rows={3} placeholder="这份知识库用于什么？" />
          <div className="knowledge-center-create-actions"><button type="submit" disabled={saving || !canCreate}>{saving ? '创建中…' : '创建知识库'}</button><button type="button" onClick={actions.onToggleCreate}>取消</button></div>
        </form>}
        <section className="knowledge-center-section">

          {loading ? <p className="knowledge-empty">正在加载…</p> : items.length === 0 ? <div className="knowledge-card knowledge-center-empty"><h3>还没有知识库</h3><p>创建一个知识库，集中管理可供 Agent 检索的资料。</p><button type="button" className="knowledge-first-create" onClick={() => { actions.onToggleCreate(); setTimeout(() => nameInputRef.current?.focus(), 0); }}>创建第一个知识库</button></div> : <div className="knowledge-center-grid">{items.map((item) => <article className="knowledge-card knowledge-base-card" key={item.id} onClick={() => actions.onOpenDetail(item.id)}><div className="knowledge-base-card-header"><h3>{item.name}</h3><span className={`knowledge-status${item.status === 'DISABLED' ? ' is-disabled' : ''}`}>{item.status === 'ACTIVE' ? '已启用' : '已停用'}</span></div>{item.description? <p>{item.description}</p>:<p>暂无描述</p>}<button type="button" onClick={(event) => { event.stopPropagation(); actions.onOpenDetail(item.id); }}>进入知识库 →</button></article>)}</div>}
        </section>
      </div>
    </section>
  );
}
