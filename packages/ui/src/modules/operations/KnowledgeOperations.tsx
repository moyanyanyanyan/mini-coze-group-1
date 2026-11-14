import { animateOperationsChange } from './motion';
import { useState } from 'react';
import {
  basePath,
  taskPath,
  conversationPath,
  baseSummary,
  bytes,
  chunkBytes,
  duration,
  time,
  dateTime,
} from './model';
import {
  PageHeader,
  Stats,
  Records,
  Cell,
  Badge,
  Panel,
  Notice,
  Stages,
  taskLabels,
} from './components';
import type { ContentProps } from './view-types';

export function Knowledge(p: ContentProps) {
  const { data, LinkComponent: L } = p;
  const summaries = data.bases.map((b) => ({ ...b, ...baseSummary(data, b.id) }));
  return (
    <>
      <PageHeader title="知识库运行" description="关注资料处理与检索情况，定位不可用的文档。" />
      <Stats
        items={[
          { label: '知识库', value: data.bases.length, note: '当前工作空间' },
          {
            label: '资料文件',
            value: data.documents.length,
            note: `原始资料共 ${bytes(summaries.reduce((n, b) => n + b.sourceBytes, 0))}`,
          },
          {
            label: '可检索切片',
            value: summaries.reduce((n, b) => n + b.chunkCount, 0),
            note: '仅统计已入库切片',
          },
          {
            label: '需要关注',
            value: summaries.reduce((n, b) => n + b.failed + b.processing, 0),
            note: '处理中及失败的文件',
          },
        ]}
      />
      <Records
        id="knowledge"
        title="知识库"
        initialStatus={new URLSearchParams(p.search).get('status') ?? ''}
        statusOptions={[
          ['failed', '有失败'],
          ['processing', '处理中'],
          ['ready', '全部就绪'],
        ]}
        headers={['知识库', '文件数', '切片数', '原始资料大小', '处理情况', '最近处理', '操作']}
        rows={summaries.map((b) => {
          const latest = data.tasks.find((t) =>
            data.documents.some((d) => d.id === t.documentId && d.baseId === b.id),
          );
          const status = b.failed ? 'failed' : b.processing ? 'processing' : 'ready';
          return {
            id: b.id,
            text: `${b.name} ${b.id}`,
            status,
            statuses: [...(b.failed ? ['failed'] : []), ...(b.processing ? ['processing'] : [])],
            cells: [
              <Cell title={<L to={basePath(b.id)}>{b.name}</L>} subtitle={b.description} />,
              b.files,
              b.chunkCount,
              bytes(b.sourceBytes),
              <Badge tone={status}>
                {b.failed || b.processing
                  ? `${b.processing} 处理中 · ${b.failed} 失败`
                  : '全部就绪'}
              </Badge>,
              latest ? time(latest.startedAt) : '—',
              <L to={basePath(b.id)}>查看 →</L>,
            ],
          };
        })}
      />
      <p className="om-note">容量与处理情况为当前快照；进入知识库后可按时间筛选历史记录。</p>
    </>
  );
}

export function Base(p: ContentProps & { baseId: string }) {
  const { data, baseId, tasks, runs, LinkComponent: L } = p;
  const base = data.bases.find((b) => b.id === baseId)!;
  const summary = baseSummary(data, baseId);
  const retrievalTab = new URLSearchParams(p.search).get('tab') === 'retrieval';
  const selectedTasks = tasks.filter((t) =>
    data.documents.some((d) => d.id === t.documentId && d.baseId === baseId),
  );
  const retrievals = runs.flatMap((run) =>
    run.retrievals.filter((r) => r.baseId === baseId).map((retrieval) => ({ run, retrieval })),
  );
  const hits = retrievals.filter((r) => r.retrieval.status === 'hit');
  return (
    <>
      <PageHeader title={base.name} description={base.description} />
      <Stats
        items={
          retrievalTab
            ? [
                { label: '检索次数', value: retrievals.length, note: '当前时间范围内' },
                {
                  label: '命中率',
                  value: retrievals.length
                    ? `${((hits.length / retrievals.length) * 100).toFixed(1)}%`
                    : '—',
                  note: `${hits.length} 次命中 · ${retrievals.length - hits.length} 次未命中或失败`,
                },
                {
                  label: '平均检索耗时',
                  value: retrievals.length
                    ? duration(
                        Math.round(
                          retrievals.reduce((n, r) => n + r.retrieval.durationMs, 0) /
                            retrievals.length,
                        ),
                      )
                    : '—',
                  note: '仅统计本知识库检索',
                },
                {
                  label: '返回切片总数',
                  value: retrievals.reduce((n, r) => n + r.retrieval.hits.length, 0),
                  note: '按每次检索累加，不去重',
                },
              ]
            : [
                {
                  label: '原始资料总大小',
                  value: bytes(summary.sourceBytes),
                  note: '当前保存的原始资料',
                },
                {
                  label: '切片文本总大小',
                  value: bytes(summary.chunkBytes),
                  note: '已入库文本，包含重叠内容',
                },
                {
                  label: '可检索切片',
                  value: summary.chunkCount,
                  note: `${summary.files} 个资料文件`,
                },
                {
                  label: '处理状态',
                  value: `${summary.processing} 处理中`,
                  note: `${summary.failed} 个文件处理失败`,
                },
              ]
        }
      />
      <nav className="om-tabs" aria-label="知识库运行内容">
        <L className={!retrievalTab ? 'is-active' : ''} to={basePath(baseId)}>
          文件处理
        </L>
        <L className={retrievalTab ? 'is-active' : ''} to={`${basePath(baseId)}?tab=retrieval`}>
          检索记录
        </L>
      </nav>
      {retrievalTab ? (
        <Records
          key="retrievals"
          id={`retrievals-${baseId}`}
          title="检索记录"
          headers={['检索内容 / 来源', '命中文档', '返回切片', '耗时', '结果', '时间', '操作']}
          sourceOptions={data.agents.map((a) => a.name)}
          statusOptions={[
            ['hit', '命中'],
            ['no_hit', '未命中'],
            ['failed', '失败'],
          ]}
          rows={retrievals.map(({ run, retrieval: r }) => {
            const conversation = data.conversations.find((c) => c.id === run.conversationId)!;
            const agent = data.agents.find((a) => a.id === conversation.agentId)!;
            const href = `${conversationPath(agent.id, conversation.id)}?run=${run.id}&node=knowledge`;
            return {
              id: run.id,
              text: `${r.query} ${run.id} ${agent.name}`,
              status: r.status,
              source: agent.name,
              cells: [
                <Cell title={<L to={href}>{r.query}</L>} subtitle={`${agent.name} · ${run.id}`} />,
                new Set(r.hits.map((h) => h.documentId)).size,
                r.hits.length,
                duration(r.durationMs),
                <Badge
                  tone={
                    r.status === 'hit' ? 'success' : r.status === 'failed' ? 'failed' : 'neutral'
                  }
                >
                  {r.status === 'hit' ? '命中' : r.status === 'failed' ? '失败' : '未命中'}
                </Badge>,
                time(run.startedAt),
                <L to={href}>查看链路</L>,
              ],
            };
          })}
        />
      ) : (
        <Records
          key="tasks"
          id={`tasks-${baseId}`}
          title="文件处理记录"
          headers={['文件 / 操作', '原始大小', '当前阶段', '总耗时', '切片数', '开始时间', '操作']}
          statusOptions={[
            ['ready', '可检索'],
            ['failed', '失败'],
            ['processing', '处理中'],
          ]}
          rows={selectedTasks.map((t) => {
            const d = data.documents.find((d) => d.id === t.documentId)!;
            return {
              id: t.id,
              text: `${d.name} ${d.id} ${t.id}`,
              status: t.status,
              cells: [
                <Cell
                  title={<L to={taskPath(baseId, t.id)}>{d.name}</L>}
                  subtitle={`${t.attempt > 1 ? '重新处理' : '上传'} · 第 ${t.attempt} 次 · ${t.id}`}
                />,
                bytes(d.sourceBytes),
                <Badge tone={t.status}>{taskLabels[t.status]}</Badge>,
                <Cell
                  title={duration(t.uploadMs + t.processingMs)}
                  subtitle={t.status === 'processing' ? '演示快照耗时' : undefined}
                />,
                <Cell
                  title={d.chunks.length}
                  subtitle={t.status !== 'ready' ? '已生成，未入库' : undefined}
                />,
                time(t.startedAt),
                <L to={taskPath(baseId, t.id)}>详情 →</L>,
              ],
            };
          })}
        />
      )}
      <p className="om-note">
        {retrievalTab
          ? '未命中表示检索正常执行，但未返回相关切片。'
          : '每次处理保留独立记录；上传成功不代表文件已可检索。'}
      </p>
    </>
  );
}

export function Document(p: ContentProps & { baseId: string; taskId: string }) {
  const { data, baseId, taskId, LinkComponent: L } = p;
  const task = data.tasks.find((t) => t.id === taskId)!;
  const document = data.documents.find((d) => d.id === task.documentId)!;
  const chunkTab = new URLSearchParams(p.search).get('tab') === 'chunks';
  const [chunkPage, setChunkPage] = useState(1);
  const totalPages = Math.ceil(document.chunks.length / 3);
  const current = Math.min(chunkPage, totalPages);
  const shown = document.chunks.slice((current - 1) * 3, current * 3);
  return (
    <>
      <PageHeader
        title={document.name}
        description={`${data.bases.find((b) => b.id === baseId)!.name} · ${task.id} · ${dateTime(task.startedAt)}`}
        action={
          <L className="om-button" to={basePath(baseId)}>
            返回文件记录
          </L>
        }
      />
      <Stats
        items={
          chunkTab
            ? [
                {
                  label: '切片数量',
                  value: document.chunks.length,
                  note: task.status === 'ready' ? '全部可检索' : '已生成，尚未入库',
                },
                {
                  label: '切片文本总大小',
                  value: bytes(chunkBytes(document.chunks)),
                  note: '包含切片重叠部分',
                },
                { label: '最大切片长度', value: '600 字符', note: '按文本顺序切分' },
                { label: '相邻切片重叠', value: '80 字符', note: '保留跨片段上下文' },
              ]
            : [
                {
                  label: '原始文件大小',
                  value: bytes(document.sourceBytes),
                  note: '原始资料字节数',
                },
                { label: '上传请求耗时', value: duration(task.uploadMs), note: '文件接收成功' },
                {
                  label: '后台处理耗时',
                  value: duration(task.processingMs),
                  note:
                    task.status === 'processing'
                      ? '正在处理，演示快照'
                      : task.status === 'failed'
                        ? '终止于向量化阶段'
                        : '解析、切片、向量化与入库',
                },
                {
                  label: '切片数量',
                  value: document.chunks.length,
                  note: task.status === 'ready' ? '已入库，全部可检索' : '已生成，尚未入库',
                },
              ]
        }
      />
      <nav className="om-tabs" aria-label="文件处理内容">
        <L className={!chunkTab ? 'is-active' : ''} to={taskPath(baseId, taskId)}>
          处理详情
        </L>
        <L className={chunkTab ? 'is-active' : ''} to={`${taskPath(baseId, taskId)}?tab=chunks`}>
          切片预览 · {document.chunks.length}
        </L>
      </nav>
      {chunkTab ? (
        <Panel title="切片预览" action={<span className="om-note">按原文顺序排列</span>}>
          <div className="om-padding">
            {shown.map((c) => (
              <article className="om-chunk" key={c.id}>
                <header>
                  <strong>#{String(c.position).padStart(3, '0')}</strong>
                  <span>
                    {bytes(new TextEncoder().encode(c.content).length)} ·{' '}
                    <Badge tone={task.status}>
                      {task.status === 'ready' ? '可检索' : '未入库'}
                    </Badge>
                  </span>
                </header>
                <p>
                  {c.content.slice(0, 140)}
                  {c.content.length > 140 ? '…' : ''}
                </p>
                {c.content.length > 140 && (
                  <details className="om-chunk-full">
                    <summary onClick={event => {
                          event.preventDefault();
                          const details = event.currentTarget.closest('details');
                          if (details) animateOperationsChange(() => { details.open = !details.open; });
                        }}>展开完整切片</summary>
                    <p>{c.content}</p>
                  </details>
                )}
                <footer>
                  字符范围 {c.start + 1}–{c.end} ·{' '}
                  {c.start === 0 ? '首个切片' : '与前片重叠 80 字符'}
                </footer>
              </article>
            ))}
          </div>
          <div className="om-table-footer">
            <span>共 {document.chunks.length} 个切片</span>
            <div>
              <button disabled={current === 1} onClick={() => animateOperationsChange(() => setChunkPage(current - 1))}>
                上一页
              </button>
              <span>
                {current} / {totalPages}
              </span>
              <button disabled={current === totalPages} onClick={() => animateOperationsChange(() => setChunkPage(current + 1))}>
                下一页
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <div className="om-file-layout">
          <Panel
            title="处理阶段"
            action={<span className="om-note">第 {task.attempt} 次处理</span>}
          >
            <div className="om-padding">
              <Stages stages={task.stages} />
            </div>
          </Panel>
          <div>
            <Panel
              title={
                task.status === 'failed'
                  ? '失败原因'
                  : task.status === 'processing'
                    ? '正在处理'
                    : '处理结果'
              }
              action={<Badge tone={task.status}>{taskLabels[task.status]}</Badge>}
            >
              <div className="om-padding">
                {task.error && (
                  <Notice title="向量化服务暂时不可用" tone="failed">
                    {task.error}
                  </Notice>
                )}
                {task.status === 'processing' && (
                  <Notice title="正在生成向量" tone="processing">
                    已完成文本解析和切片，文件尚不可检索。这是模拟数据快照，刷新不会执行真实任务。
                  </Notice>
                )}
                <div className="om-key-value">
                  <span>生成切片</span>
                  <strong>{document.chunks.length} 个</strong>
                </div>
                <div className="om-key-value">
                  <span>切片文本大小</span>
                  <strong>
                    {bytes(chunkBytes(document.chunks))}
                    {task.status !== 'ready' ? '（未入库）' : ''}
                  </strong>
                </div>
                <div className="om-key-value">
                  <span>新增可检索切片</span>
                  <strong>{task.status === 'ready' ? document.chunks.length : 0}</strong>
                </div>
                {task.snapshot && (
                  <>
                    <div className="om-capacity">
                      <small>处理完成时 · 知识库原始资料总大小</small>
                      <strong>
                        {bytes(task.snapshot.sourceBytes)} <small>历史快照</small>
                      </strong>
                      <p>
                        处理前 {bytes(task.snapshot.sourceBytesBefore)} → 新增{' '}
                        {bytes(task.snapshot.sourceBytes - task.snapshot.sourceBytesBefore)}
                      </p>
                    </div>
                    <div className="om-key-value">
                      <span>知识库切片文本总大小</span>
                      <strong>{bytes(task.snapshot.chunkBytes)}</strong>
                    </div>
                    <div className="om-key-value">
                      <span>知识库可检索切片</span>
                      <strong>{task.snapshot.chunkCount}</strong>
                    </div>
                    <p className="om-note">
                      快照时间：{dateTime(task.startedAt + task.uploadMs + task.processingMs)}
                      <br />
                      切片文本大小包含重叠内容，不含向量及索引占用。
                    </p>
                  </>
                )}
                {task.status === 'failed' && (
                  <p className="om-note">
                    上传已成功，但文件无法用于检索。运行管理保留本次失败记录。
                  </p>
                )}
              </div>
            </Panel>
            {task.status !== 'ready' && (
              <Panel title="后续处理">
                <div className="om-padding">
                  <p>请到知识库模块检查相关资料与服务配置。</p>
                  <L className="om-button om-primary" to="/workspace/knowledge">
                    前往知识库模块 ↗
                  </L>
                  <p className="om-note">
                    当前文件为模拟资料，此入口仅打开真实知识库列表，不执行重试。
                  </p>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
