import { InfoTooltip } from '../../components/uiverse/InfoTooltip';
import { Icon } from '../../components/Icon';
import { animateOperationsChange } from './motion';
import { useEffect, useRef, useState } from 'react';
import {
  agentPath,
  conversationPath,
  operationsRoot,
  runSummary,
  time,
  duration,
  type OperationsData,
  type OperationRun,
} from './model';
import {
  PageHeader,
  RunMetrics,
  Records,
  Cell,
  Badge,
  Empty,
  Panel,
  Notice,
  Stages,
  runLabels,
} from './components';
import type { ContentProps } from './view-types';

export function Agents(p: ContentProps) {
  const { data, runs, LinkComponent: L } = p;
  return (
    <>
      <PageHeader title="Agent 聊天" />
      <RunMetrics runs={runs} />
      <Records
        id="agents"
        title="智能体运行情况"
        initialStatus={new URLSearchParams(p.search).get('status') ?? ''}
        statusOptions={[
          ['failed', '存在失败'],
          ['success', '无失败'],
        ]}
        headers={['智能体', '会话数', '执行次数', '成功率', '平均耗时', '最近执行', '操作']}
        rows={data.agents.map((a) => {
          const selected = runs.filter((r) =>
            data.conversations.some((c) => c.id === r.conversationId && c.agentId === a.id),
          );
          const s = runSummary(selected);
          return {
            id: a.id,
            text: `${a.name} ${a.description} ${a.id}`,
            status: s.failed ? 'failed' : 'success',
            cells: [
              <Cell title={<L to={agentPath(a.id)}>{a.name}</L>} />,
              a.conversationCount ?? new Set(selected.map((r) => r.conversationId)).size,
              s.count,
              <Cell title={s.rate} subtitle={`${s.failed} 次失败`} />,
              s.average,
              selected[0] ? time(selected[0].startedAt) : '—',
              <L to={agentPath(a.id)}>会话 →</L>,
            ],
          };
        })}
      />
    </>
  );
}

export function Conversations(p: ContentProps & { agentId: string }) {
  const { data, agentId, runs, LinkComponent: L } = p;
  const agent = data.agents.find((a) => a.id === agentId)!;
  const selected = runs.filter((r) =>
    data.conversations.some((c) => c.id === r.conversationId && c.agentId === agentId),
  );
  return (
    <>
      <PageHeader title={agent.name} />
      <RunMetrics runs={selected} />
      <Records
        id={`conversations-${agentId}`}
        title="会话记录"
        sourceOptions={['平台聊天', 'SDK/API', '混合来源', '历史未记录']}
        statusOptions={[
          ['failed', '有失败'],
          ['warning', '有节点异常'],
          ['success', '全部成功'],
        ]}
        headers={['会话', '来源', '执行次数', '失败次数', '执行概况', '最近活动', '操作']}
        rows={data.conversations
          .filter((c) => c.agentId === agentId)
          .flatMap((c) => {
            const items = selected.filter((r) => r.conversationId === c.id);
            if (!items.length && !agent.actual) return [];
            const summary = runSummary(items);
            const status = summary.failed ? 'failed' : summary.warnings ? 'warning' : items.find(item => ['running', 'cancelled', 'interrupted'].includes(item.status))?.status ?? 'success';
            return [
              {
                id: c.id,
                text: `${c.title} ${c.id} ${c.actor}`,
                source: c.source,
                status,
                cells: [
                  <Cell
                    title={<L to={conversationPath(agentId, c.id)}>{c.title}</L>}
                    subtitle={`${c.id} · ${c.actor}`}
                  />,
                  c.source,
                  items.length,
                  summary.failed,
                  <Badge tone={status}>
                    {status === 'failed'
                      ? '有失败'
                      : status === 'warning'
                        ? '有节点异常'
                        : !items.length ? '尚无采集记录' : status === 'success' ? '全部成功' : runLabels[status]}
                  </Badge>,
                  items[0] ? time(items[0].startedAt) : '尚无采集记录',
                  <L to={conversationPath(agentId, c.id)}>查看 →</L>,
                ],
              },
            ];
          })}
      />
    </>
  );
}

function CollectedTrace({ run }: { run: OperationRun }) {
  const actual = run.observed!;
  const stages = actual.stages ?? [];
  const measured = stages.map(stage => ({
    id: stage.stageId,
    name: `${({ retrieval: '知识库检索', context: '上下文组装', model: '模型调用', tool: '工具执行' })[stage.kind]}${stage.round ? ` · 第 ${stage.round} 轮` : ''}${stage.toolName ? ` · ${stage.toolName}` : ''}（已采集）`,
    status: stage.status === 'completed' ? 'success' as const : stage.status,
    durationMs: stage.durationMs,
    description: [stage.model, stage.outcome === 'tool_calls' ? '返回工具调用' : stage.outcome === 'answer' ? '返回回答' : '',
      stage.chunkCount === undefined ? '' : `${stage.kind === 'context' ? '组装上下文' : '返回'} ${stage.chunkCount} 个切片`,
      stage.usage ? `本轮已报告 Token：输入 ${stage.usage.promptTokens} / 输出 ${stage.usage.completionTokens}` : stage.kind === 'model' ? '本轮 Token 未报告' : '',
      stage.errorCode, `实际耗时 ${duration(stage.durationMs)}`].filter(Boolean).join(' · '),
  }));
  const labels: Record<string, string> = { completed: 'Runtime 已完成', failed: '失败', running: '处理中', pending: '等待保存', cancelled: '已取消', interrupted: '采集中断' };
  return <>
    <div className="om-trace-metrics">
      <span>调用耗时 <b>{actual.durationMs === null ? '未采集' : duration(actual.durationMs)}</b></span>
      <span>首字响应 <b>{actual.firstTokenMs === null ? '未采集' : duration(actual.firstTokenMs)}</b></span>
      <span>Token <b>{actual.totalTokens ?? '未报告'}</b></span>
    </div>
    <p className="om-note">输入 {actual.inputTokens ?? '未报告'} / 输出 {actual.outputTokens ?? '未报告'} Token。</p>
    <div className="om-key-value"><span>Runtime 结果</span><strong>{labels[actual.status] ?? actual.status}</strong></div>
    <div className="om-key-value"><span>消息保存状态</span><strong>{actual.messageStatus === 'completed' ? '已保存' : labels[actual.messageStatus ?? ''] ?? '不可用'}</strong></div>
    {actual.errorCode && <Notice title="实际调用异常" tone="failed">{actual.errorCode}</Notice>}
    <h3>已采集执行链路</h3>
    {!actual.events ? <p>正在读取本轮采集事件…</p> : !actual.events.length ? <p>尚无过程事件，事件在本轮调用结束后保存。</p> : actual.events.filter(event => event.type !== 'runtime.stage').map((event, index) => <details className="om-snippet" key={index}>
      <summary>{({ 'tool.started': '工具调用开始', 'tool.completed': '工具调用结果', 'knowledge.result': '知识库引用', 'knowledge.retrieval': '实际检索候选与相似度', 'tool.request': '实际工具参数与结果', 'runtime.result': 'Runtime 返回结果', 'run.failed': '调用失败' } as Record<string, string>)[event.type] ?? event.type}</summary>
      <pre>{JSON.stringify(event.data, null, 2)}</pre>
    </details>)}
    {actual.truncated && <p className="om-note">部分事件已按大小上限截断或省略。</p>}
    <details className="om-snippet" open={stages.length > 0}><summary>内部阶段（实际采集）</summary>
      {stages.length > 0 ? <Stages stages={measured} /> : <p>{actual.events ? '暂无阶段数据' : '正在读取本轮阶段数据…'}</p>}
    </details>
  </>;
}

export function Conversation(p: ContentProps & { agentId: string; conversationId: string }) {
  const { data, agentId, conversationId, LinkComponent: L } = p;
  const conversation = data.conversations.find((c) => c.id === conversationId)!;
  const runs = data.runs
    .filter((r) => r.conversationId === conversationId)
    .sort((a, b) => a.startedAt - b.startedAt);
  const params = new URLSearchParams(p.search);
  const expanded = params.has('run') || params.has('node');
  const [retainedSearch, setRetainedSearch] = useState<string | null>(() => expanded ? p.search : null);
  const closing = !expanded && retainedSearch !== null;
  const detailParams = new URLSearchParams(expanded ? p.search : retainedSearch ?? '');
  const detailRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (expanded) {
      setRetainedSearch(p.search);
      detailRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1100px)').matches) {
        detailRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    } else {
      // 保留当前链路直到退场完成；重新展开时清理定时器，避免误卸载。
      const timer = window.setTimeout(() => {
        setRetainedSearch(null);
        triggerRef.current?.focus({ preventScroll: true });
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
      return () => window.clearTimeout(timer);
    }
  }, [expanded, p.search]);
  const run = detailParams.has('run') ? runs.find((r) => r.id === detailParams.get('run')) : runs.at(-1);
  if (!run)
    return (
      <><PageHeader title={conversation.title} description="当前会话尚无对应的采集记录，以下为已有消息。" />
      <ConversationMemory memory={data.memory} error={data.memoryError} loading={p.loading} onRefresh={p.onRefresh} />
      {data.messages?.map(message => <Panel key={message.id} title={message.role === 'user' ? '用户' : '助手'}><p className="om-answer">{message.content}</p></Panel>)}
      <Empty>
        执行记录不存在，或不属于当前会话。
        <L to={conversationPath(agentId, conversationId)}>返回会话</L>
      </Empty></>
    );
  const node = detailParams.get('node');
  const path = `${conversationPath(agentId, conversationId)}?run=${run.id}`;
  const detail =
    node === 'knowledge' ? 'knowledge' : 'trace';
  const retrievalEvent = run.observed?.events?.find(event => event.type === 'knowledge.result');
  const retrievalData = retrievalEvent?.data as { status?: string } | undefined;
  const failedRetrieval = (run.observed?.stages ?? []).some(stage => stage.kind === 'retrieval' && stage.status === 'failed');
  const retrievalLabel = failedRetrieval ? '检索失败' : retrievalData?.status === 'matched' ? '命中' : retrievalData?.status === 'no_match' ? '未命中' : '结果未记录';
  return (
    <>
      <L className="om-conversation-back" to={agentPath(agentId)}>
        <span aria-hidden="true">←</span> 返回会话列表
      </L>
      <PageHeader
        title={conversation.title}
        description={`${data.agents.find((a) => a.id === agentId)!.name} · ${conversation.id}`}
      />
      <ConversationMemory memory={data.memory} error={data.memoryError} loading={p.loading} onRefresh={p.onRefresh} />
      <div className={`om-chat-layout om-conversation-layout${expanded ? ' is-expanded' : closing ? ' is-closing' : ''}`}>
        <Panel
          title="对话记录"
          action={<span className="om-note">{runs.length} 次执行 · 已载入采集记录</span>}
        >
          <div className="om-thread">
            {data.messages?.length ? data.messages.map(message => {
              const associated = runs.find(item => item.observed?.assistantMessageId === message.id);
              return <article className="om-turn" key={message.id}>
                <div className={`om-replay-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                  <span className="om-replay-avatar" aria-hidden="true">{message.role === 'user' ? '用' : '助'}</span>
                  <div className="om-replay-body"><div className="om-speaker">{message.role === 'user' ? '用户' : '助手'} · {({ completed: '已完成', failed: '失败', cancelled: '已取消', running: '生成中', pending: '等待生成' } as Record<string,string>)[message.status] ?? message.status}</div><p className="om-answer">{message.content || '没有已保存的正文'}</p></div>
                </div>
                {associated ? <L className="om-run-link" to={`${conversationPath(agentId, conversationId)}?run=${associated.id}`} aria-expanded={expanded && run.id === associated.id}><Badge tone={associated.status}>{runLabels[associated.status]}</Badge><span>{duration(associated.durationMs)}</span><span>查看第 {runs.indexOf(associated) + 1} 轮执行链路</span></L>
                  : message.role === 'assistant' ? <p className="om-note">这条历史消息没有采集执行链路。</p> : null}
              </article>;
            }) : runs.map((r, i) => (
              <article className={`om-turn${expanded && r.id === run.id ? ' is-selected' : ''}`} key={r.id}>
                <div className="om-replay-time">第 {i + 1} 轮 · <time>{time(r.startedAt)}</time></div>
                <div className="om-replay-message is-user">
                  <span className="om-replay-avatar" aria-hidden="true">用</span>
                  <div className="om-replay-body">
                    <div className="om-speaker">用户</div>
                    <div className="om-bubble">{r.question}</div>
                  </div>
                </div>
                <div className="om-replay-message is-assistant">
                  <span className="om-replay-avatar" aria-hidden="true">{data.agents.find((a) => a.id === agentId)!.name.slice(0, 1)}</span>
                  <div className="om-replay-body">
                    <div className="om-speaker">{data.agents.find((a) => a.id === agentId)!.name}</div>
                    <p className="om-answer">{r.answer || (r.observed ? '当前没有已保存的回复内容。' : '本轮执行失败，没有生成回复。')}</p>
                  </div>
                </div>
                <L
                  className={`om-run-link ${expanded && r.id === run.id ? 'is-active' : ''}`}
                  to={`${conversationPath(agentId, conversationId)}?run=${r.id}`}
                  aria-current={expanded && r.id === run.id ? 'true' : undefined}
                  aria-expanded={expanded && r.id === run.id}
                  onClick={event => { triggerRef.current = event.currentTarget; }}
                >
                  <Badge tone={r.status}>{runLabels[r.status]}</Badge>
                  <span>{r.observed?.durationMs === null ? '未采集' : duration(r.durationMs)}</span>
                  <span>{expanded && r.id === run.id ? `正在查看第 ${i + 1} 轮` : `查看第 ${i + 1} 轮执行链路`}</span>
                </L>
              </article>
            ))}
          </div>
          <div className="om-panel-foot">
            {conversation.source} · {conversation.actor}
            <br />
            只读记录，不会重新发起对话
          </div>
        </Panel>
        {(expanded || closing) && <section inert={closing} aria-hidden={closing || undefined} className="om-execution-detail" ref={detailRef} tabIndex={-1} aria-label="执行链路详情">
        <Panel
          title={
            <span className="om-detail-heading">
              <L className="om-detail-back" to={conversationPath(agentId, conversationId)} aria-label="返回对话记录" title="收起执行链路，返回对话记录">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
              </L>
              <span>{detail === 'trace'
                ? `第 ${runs.indexOf(run) + 1} 轮 · 执行链路`
                : '知识库检索'}</span>
            </span>
          }
          action={<Badge tone={detail === 'knowledge' ? failedRetrieval ? 'failed' : retrievalData?.status === 'matched' ? 'success' : 'neutral' : run.status}>{detail === 'knowledge' ? retrievalLabel : runLabels[run.status]}</Badge>}
        >
          <div className="om-padding">
            {detail !== 'trace' && (
              <L className="om-back" to={path}>
                ← 返回执行链路
              </L>
            )}
            {run.observed ? <CollectedTrace run={run} /> : <Empty>此记录没有实际执行链路。</Empty>}
          </div>
        </Panel>
        </section>}
      </div>
    </>
  );
}
import { ConversationMemory } from '../agent-chat/ConversationMemory';
