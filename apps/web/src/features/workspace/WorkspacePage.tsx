import { useEffect, useState } from 'react';
import { AppLink } from '../../shared/routing/AppLink';
import { listAgents, listKnowledgeBases } from '../agent-builder/agent.api';
import { agentBuilderManifest } from '../agent-builder/agent-builder.manifest';
import { knowledgeManifest } from '../knowledge/knowledge.manifest';
import { workflowManifest } from '../workflow-editor/workflow-editor.manifest';
import { agentChatManifest } from '../agent-chat/agent-chat.manifest';
import './workspace.css';

const agents = agentBuilderManifest.route;
const knowledge = knowledgeManifest.route;
type RecentItem = { id: string; name: string; updatedAt: string; kind: '智能体' | '知识库' };

export function WorkspacePage() {
  const [recent, setRecent] = useState<RecentItem[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([listAgents(), listKnowledgeBases()]).then(([page, bases]) => {
      if (!active) return;
      const items: RecentItem[] = [
        ...page.items.map(item => ({ ...item, kind: '智能体' as const })),
        ...bases.map(item => ({ ...item, kind: '知识库' as const })),
      ];
      setRecent(items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5));
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : '资源加载失败');
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <section className="feature-page workspace-home" aria-label="工作台">
      <h1>工作台</h1>
      <nav className="home-actions" aria-label="快捷创建">
        <AppLink to={agents + '?action=new'}>创建智能体</AppLink>
        <AppLink to={workflowManifest.route + '?action=new'}>创建工作流</AppLink>
        <AppLink to={knowledge + '?action=new'}>创建知识库</AppLink>
      </nav>
      <div className="home-panel">
        {error ? <div role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>重试</button></div>
          : recent === null ? <p role="status">正在加载最近更新…</p>
          : recent.length === 0 ? <>
            <h2>用自己的文档做一个问答助手</h2>
            <ol>
              <li>创建知识库，上传 TXT 或 JSON 文档，等状态变为「可检索」。</li>
              <li>创建智能体，在知识库设置里绑定并启用这份知识库。</li>
              <li>回到工作台，点击智能体旁的「去对话」，问一个文档里有答案的问题。</li>
            </ol>
            <AppLink to={knowledge + '?action=new'}>开始创建知识库 →</AppLink>
          </> : <>
            <h2>最近更新</h2>
            <ul>{recent.map(item => {
              const isAgent = item.kind === '智能体';
              const id = encodeURIComponent(item.id);
              const edit = (isAgent ? agents : knowledge) + '?id=' + id;
              return <li key={item.kind + id}>
                <div><AppLink className="home-name" to={edit}>{item.name}</AppLink>
                  <small>{item.kind} · <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('zh-CN')}</time></small>
                </div>
                <div className="home-links"><AppLink to={edit}>继续编辑</AppLink>
                  {isAgent && <AppLink to={agentChatManifest.route + '?agentId=' + id}>去对话</AppLink>}
                </div>
              </li>;
            })}</ul>
          </>}
      </div>
    </section>
  );
}
