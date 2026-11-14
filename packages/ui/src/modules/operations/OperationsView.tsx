import { animateOperationsChange } from './motion';
import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import {
  operationsRoot,
  parseOperationsRoute,
  withinDays,
  agentPath,
  basePath,
  time,
} from './model';
import { Breadcrumbs, PageHeader } from './components';
import { Overview } from './Overview';
import { Agents, Conversations, Conversation } from './AgentOperations';
import { Knowledge, Base, Document } from './KnowledgeOperations';
import type { OperationsViewProps, ContentProps } from './view-types';
import './operations.css';

let rememberedDays = 1;

export function OperationsView(props: OperationsViewProps) {
  const { data, pathname, LinkComponent: L } = props;
  const route = parseOperationsRoute(pathname);
  const [days, setDays] = useState(rememberedDays);
  const [refreshedAt, setRefreshedAt] = useState(data.snapshotAt);
  const isKnowledge =
    route.page === 'knowledge' || route.page === 'base' || route.page === 'document';
  const items: [string, string][] =
    route.page === 'overview'
      ? [['首页', '']]
      : [
          [
            isKnowledge ? '知识库' : 'Agent 聊天',
            `${operationsRoot}/${isKnowledge ? 'knowledge' : 'agents'}`,
          ],
        ];
  const p: ContentProps = {
    ...props,
    days,
    runs: data.runs.filter((r) => withinDays(r.startedAt, days, data.snapshotAt)),
    tasks: data.tasks.filter((t) => withinDays(t.startedAt, days, data.snapshotAt)),
  };
  let content: ReactNode;
  if (route.page === 'overview') content = <Overview {...p} />;
  else if (route.page === 'agents') content = <Agents {...p} />;
  else if (route.page === 'knowledge') content = <Knowledge {...p} />;
  else if (route.page === 'conversations' || route.page === 'conversation') {
    const agent = data.agents.find((a) => a.id === route.agentId);
    const conversation =
      route.page === 'conversation'
        ? data.conversations.find(
            (c) => c.id === route.conversationId && c.agentId === route.agentId,
          )
        : undefined;
    if (agent && (route.page === 'conversations' || conversation)) {
      items.push([agent.name, route.page === 'conversation' ? agentPath(agent.id) : '']);
      if (conversation) items.push(['会话详情', '']);
      content =
        route.page === 'conversations' ? (
          <Conversations {...p} agentId={route.agentId} />
        ) : (
          <Conversation
            key={route.conversationId}
            {...p}
            agentId={route.agentId}
            conversationId={route.conversationId}
          />
        );
    }
  } else if (route.page === 'base' || route.page === 'document') {
    const base = data.bases.find((b) => b.id === route.baseId);
    const task =
      route.page === 'document'
        ? data.tasks.find(
            (t) =>
              t.id === route.taskId &&
              data.documents.some((d) => d.id === t.documentId && d.baseId === route.baseId),
          )
        : undefined;
    if (base && (route.page === 'base' || task)) {
      items.push([base.name, route.page === 'document' ? basePath(base.id) : '']);
      if (task) items.push(['文件详情', '']);
      content =
        route.page === 'base' ? (
          <Base {...p} baseId={route.baseId} />
        ) : (
          <Document key={route.taskId} {...p} baseId={route.baseId} taskId={route.taskId} />
        );
    }
  }
  const activeSection =
    route.page === 'overview'
      ? operationsRoot
      : isKnowledge
        ? operationsRoot + '/knowledge'
        : operationsRoot + '/agents';
  const timed = ['agents', 'conversations', 'base'].includes(route.page);
  return (
    <div className={route.page === 'overview' ? 'om om-overview' : 'om'}>
      <header className="om-navigation">
        <h2>运行管理</h2>
        <nav aria-label="运行管理导航">
          {(
            [
              ['首页', operationsRoot, 'home'],
              ['Agent 聊天', operationsRoot + '/agents', 'chat'],
              ['知识库', operationsRoot + '/knowledge', 'book'],
            ] as const
          ).map(([label, href, icon]) => {
            const selected = href === activeSection;
            return (
              <L
                key={href}
                to={href}
                className={selected ? 'is-active' : ''}
                aria-current={selected ? 'page' : undefined}
              >
                <Icon name={icon} />
                {label}
              </L>
            );
          })}
        </nav>
        <div className="om-navigation-foot">
          数据范围<strong>当前工作空间</strong>
        </div>
      </header>
      <section className="om-content" aria-label="运行管理内容">
        <div className="om-topline">
          <Breadcrumbs items={items} LinkComponent={L} />
          <span className="om-demo">模拟数据 · 未连接后端</span>
        </div>
        <div className="om-top-actions">
          {timed && (
            <select
              aria-label="时间范围"
              value={days}
              onChange={(e) => {
                rememberedDays = Number(e.target.value);
                animateOperationsChange(() => setDays(rememberedDays));
              }}
            >
              <option value={1}>最近 24 小时</option>
              <option value={7}>最近 7 天</option>
              <option value={30}>最近 30 天</option>
            </select>
          )}
          <button onClick={() => animateOperationsChange(() => setRefreshedAt(Date.now()))}>
            <Icon name="repeat" />
            刷新快照
          </button>
          <span role="status">查看于 {time(refreshedAt)}</span>
        </div>
        {content ?? (
          <>
            <PageHeader title="记录不存在" description="请检查链接，或返回运行管理查看已有记录。" />
            <L className="om-button" to={operationsRoot}>
              返回首页
            </L>
          </>
        )}
      </section>
    </div>
  );
}
