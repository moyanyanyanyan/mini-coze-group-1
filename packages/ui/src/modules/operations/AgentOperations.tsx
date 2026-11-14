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
      <PageHeader title="Agent 聊天" description="从智能体进入会话，追踪每一轮执行。" />
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
              <Cell title={<L to={agentPath(a.id)}>{a.name}</L>} subtitle={a.description} />,
              new Set(selected.map((r) => r.conversationId)).size,
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
      <PageHeader title={agent.name} description="查看会话中的执行记录，失败和内部异常分别标记。" />
      <RunMetrics runs={selected} />
      <Records
        id={`conversations-${agentId}`}
        title="会话记录"
        sourceOptions={['平台聊天', 'SDK/API']}
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
            if (!items.length) return [];
            const summary = runSummary(items);
            const status = summary.failed ? 'failed' : summary.warnings ? 'warning' : 'success';
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
                        : '全部成功'}
                  </Badge>,
                  time(items[0].startedAt),
                  <L to={conversationPath(agentId, c.id)}>查看 →</L>,
                ],
              },
            ];
          })}
      />
    </>
  );
}

export function RetrievalDetail({ data, run }: { data: OperationsData; run: OperationRun }) {
  const hits = run.retrievals.flatMap((r) => r.hits);
  return (
    <>
      <div className="om-query">
        <small>检索问题</small>
        {run.question}
      </div>
      <div className="om-mini-stats">
        <div>
          <strong>{new Set(hits.map((h) => h.documentId)).size}</strong>命中文档
        </div>
        <div>
          <strong>{hits.length}</strong>返回切片
        </div>
        <div>
          <strong>{hits.filter((h) => h.used).length}</strong>送入模型
        </div>
      </div>
      {run.retrievals.map((r) => (
        <section className="om-kb-group" key={r.baseId}>
          <header>
            <strong>{data.bases.find((b) => b.id === r.baseId)?.name}</strong>
            <span>
              {duration(r.durationMs)} · {r.hits.length} 个切片
            </span>
          </header>
          <div className="om-padding">
            {r.status === 'no_hit' ? (
              <Notice title="未命中" tone="neutral">
                检索正常执行，但未返回相关切片。
              </Notice>
            ) : r.status === 'failed' ? (
              <Notice title="检索失败" tone="failed">
                知识库检索服务暂时不可用。
              </Notice>
            ) : (
              [...new Set(r.hits.map((h) => h.documentId))].map((id) => {
                const document = data.documents.find((d) => d.id === id)!;
                const documentHits = r.hits.filter((h) => h.documentId === id);
                return (
                  <div key={id}>
                    <div className="om-stage-title">
                      <strong>{document.name}</strong>
                      <span>{documentHits.length} 个切片</span>
                    </div>
                    {documentHits.map((h, i) => (
                      <details className="om-snippet" key={h.chunkId} open={i === 0}>
                        <summary onClick={event => {
                          event.preventDefault();
                          const details = event.currentTarget.closest('details');
                          if (details) animateOperationsChange(() => { details.open = !details.open; });
                        }}>
                          切片 #{document.chunks.find((c) => c.id === h.chunkId)?.position} · 相似度{' '}
                          {h.score.toFixed(2)} · {h.used ? '送入模型' : '未采用'}
                        </summary>
                        <p>{document.chunks.find((c) => c.id === h.chunkId)?.content}</p>
                      </details>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ))}
      <p className="om-note">
        相似度用于检索排序，不代表回答准确率。返回与送入模型的切片分别统计。
      </p>
    </>
  );
}

export function PluginDetail({ run }: { run: OperationRun }) {
  const plugin = run.plugin!;
  const [feedback, setFeedback] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ input: plugin.input, output: plugin.output }, null, 2),
      );
      setFeedback('已复制脱敏内容');
    } catch {
      setFeedback('复制失败，请手动选择下方文本复制');
    }
  }
  return (
    <>
      {plugin.failed && (
        <Notice title="上游服务请求超时" tone="failed">
          UPSTREAM_TIMEOUT · 在 {duration(plugin.durationMs)} 内未收到订单服务响应。
        </Notice>
      )}
      <div className="om-key-value">
        <span>工具</span>
        <strong>{plugin.tool}</strong>
      </div>
      <div className="om-key-value">
        <span>耗时</span>
        <strong>{duration(plugin.durationMs)}</strong>
      </div>
      <div className="om-key-value">
        <span>来源执行</span>
        <strong>{run.id}</strong>
      </div>
      <div className="om-section-heading">
        <h3>输入参数</h3>
        <span>敏感字段已脱敏</span>
      </div>
      <pre>{JSON.stringify(plugin.input, null, 2)}</pre>
      <h3>返回结果</h3>
      <pre>{JSON.stringify(plugin.output, null, 2)}</pre>
      <button onClick={copy}>复制调用信息</button>
      <span className="om-note" role="status">
        {feedback}
      </span>
      <Notice title={run.status === 'failed' ? '整轮执行失败' : '整轮执行已完成'} tone="neutral">
        {run.status === 'failed'
          ? '后续模型调用失败，没有生成最终回复。'
          : '后续模型生成了最终回答，并保存回复。'}
      </Notice>
    </>
  );
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
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1050);
      return () => window.clearTimeout(timer);
    }
  }, [expanded, p.search]);
  const run = detailParams.has('run') ? runs.find((r) => r.id === detailParams.get('run')) : runs.at(-1);
  if (!run)
    return (
      <Empty>
        执行记录不存在，或不属于当前会话。
        <L to={conversationPath(agentId, conversationId)}>返回会话</L>
      </Empty>
    );
  const node = detailParams.get('node');
  const path = `${conversationPath(agentId, conversationId)}?run=${run.id}`;
  const detail =
    node === 'knowledge' ? 'knowledge' : node === 'plugin' && run.plugin ? 'plugin' : 'trace';
  return (
    <>
      <L className="om-conversation-back" to={agentPath(agentId)}>
        <span aria-hidden="true">←</span> 返回会话列表
      </L>
      <PageHeader
        title={conversation.title}
        description={`${data.agents.find((a) => a.id === agentId)!.name} · ${conversation.id}`}
      />
      <div className={`om-chat-layout om-conversation-layout${expanded ? ' is-expanded' : closing ? ' is-closing' : ''}`}>
        <Panel
          title="对话记录"
          action={<span className="om-note">{runs.length} 次执行 · 全部历史</span>}
        >
          <p className="om-conversation-hint">先浏览对话，点击每轮下方的“查看执行链路”了解处理过程。</p>
          <div className="om-thread">
            {runs.map((r, i) => (
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
                    <p className="om-answer">{r.answer || '本轮执行失败，没有生成回复。'}</p>
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
                  <span>{duration(r.durationMs)}</span>
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
                : detail === 'knowledge' ? '知识库检索' : run.plugin!.name}</span>
            </span>
          }
          action={
            <Badge
              tone={
                detail === 'knowledge'
                  ? run.retrievals.some((r) => r.status === 'failed')
                    ? 'failed'
                    : run.retrievals.some((r) => r.status === 'hit')
                      ? 'success'
                      : 'neutral'
                  : detail === 'plugin'
                    ? run.plugin!.failed
                      ? 'failed'
                      : 'success'
                    : run.status
              }
            >
              {detail === 'knowledge'
                ? run.retrievals.some((r) => r.status === 'failed')
                  ? '检索失败'
                  : run.retrievals.some((r) => r.status === 'hit')
                    ? '命中'
                    : '未命中'
                : detail === 'plugin'
                  ? run.plugin!.failed
                    ? '调用失败'
                    : '调用成功'
                  : runLabels[run.status]}
            </Badge>
          }
        >
          <div className="om-padding">
            {detail !== 'trace' && (
              <L className="om-back" to={path}>
                ← 返回执行链路
              </L>
            )}
            {detail === 'knowledge' ? (
              <RetrievalDetail key={run.id} data={data} run={run} />
            ) : detail === 'plugin' ? (
              <PluginDetail key={run.id} run={run} />
            ) : (
              <>
                <div className="om-trace-metrics">
                  <span>
                    总耗时 <b>{duration(run.durationMs)}</b>
                  </span>
                  <span>
                    首字响应 <b>{run.firstTokenMs === null ? '—' : duration(run.firstTokenMs)}</b>
                  </span>
                  <span>
                    Token <b>{run.inputTokens + run.outputTokens}</b>
                  </span>
                </div>
                {run.status !== 'success' && (
                  <Notice
                    title={run.status === 'warning' ? '回答已完成，存在节点异常' : '本轮执行失败'}
                    tone={run.status}
                  >
                    {run.status === 'warning'
                      ? '插件调用失败，智能体已告知用户暂时无法查询。'
                      : '模型服务不可用，未生成最终回复。'}
                  </Notice>
                )}
                <Stages
                  stages={run.stages}
                  onNode={(name) =>
                    name === '知识库检索' ? (
                      <L to={`${path}&node=knowledge`}>查看检索详情 →</L>
                    ) : name === '订单查询插件' ? (
                      <L to={`${path}&node=plugin`}>查看调用详情 →</L>
                    ) : null
                  }
                />
                <p className="om-note">
                  {run.id} · 输入 {run.inputTokens} / 输出 {run.outputTokens} Token
                </p>
              </>
            )}
          </div>
        </Panel>
        </section>}
      </div>
    </>
  );
}
