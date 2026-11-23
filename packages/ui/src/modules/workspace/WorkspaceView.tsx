import type { LinkComponentType } from '../../layouts/types';
import './workspace.css';

export interface RecentResourceView {
  key: string;
  name: string;
  updatedAt: string;
  kind: string;
  editRoute: string;
  chatRoute?: string;
}

export interface WorkspaceViewProps {
  recent: RecentResourceView[] | null;
  error: string;
  onRetry: () => void;
  createRoutes: { agent: string; workflow: string; knowledge: string };
  LinkComponent: LinkComponentType;
}

export function WorkspaceView({ recent, error, onRetry, createRoutes, LinkComponent }: WorkspaceViewProps) {
  return (
    <section className="feature-page workspace-home" aria-label="工作台">
      <h1>工作台</h1>
      <nav className="home-actions" aria-label="快捷创建">
        <LinkComponent to={createRoutes.agent}>创建智能体</LinkComponent>
        <LinkComponent to={createRoutes.workflow}>创建工作流</LinkComponent>
        <LinkComponent to={createRoutes.knowledge}>创建知识库</LinkComponent>
      </nav>
      <div className="home-panel">
        {error ? <div role="alert">{error} <button onClick={onRetry}>重试</button></div>
          : recent === null ? <p role="status">正在加载最近更新…</p>
          : recent.length === 0 ? <>
            <h2>用自己的文档做一个问答助手</h2>
            <ol>
              <li>创建知识库，上传 TXT 或 JSON 文档，等状态变为「可检索」。</li>
              <li>创建智能体，在知识库设置里绑定并启用这份知识库。</li>
              <li>回到工作台，点击智能体旁的「去对话」，问一个文档里有答案的问题。</li>
            </ol>
            <LinkComponent to={createRoutes.knowledge}>开始创建知识库 →</LinkComponent>
          </> : <>
            <h2>最近更新</h2>
            <ul>{recent.map(item => {
              return <li key={item.key}>
                <div><LinkComponent className="home-name" to={item.editRoute}>{item.name}</LinkComponent>
                  <small>{item.kind} · <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('zh-CN')}</time></small>
                </div>
                <div className="home-links"><LinkComponent to={item.editRoute}>继续编辑</LinkComponent>
                  {item.chatRoute && <LinkComponent to={item.chatRoute}>去对话</LinkComponent>}
                </div>
              </li>;
            })}</ul>
          </>}
      </div>
    </section>
  );
}
