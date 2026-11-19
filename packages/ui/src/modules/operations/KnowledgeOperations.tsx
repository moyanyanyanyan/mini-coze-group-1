import { basePath, conversationPath, duration, time } from "./model";
import { PageHeader, Stats, Records, Cell, Badge, Notice } from "./components";
import type { ContentProps } from "./view-types";

import { BaseFiles } from "./KnowledgeWorkspace";
export { Knowledge, Document } from "./KnowledgeWorkspace";
export function Base(p: ContentProps & { baseId: string }) {
  return new URLSearchParams(p.search).get("tab") === "retrieval" ? (
    <RetrievalRecords {...p} />
  ) : (
    <BaseFiles {...p} />
  );
}

function RetrievalRecords(p: ContentProps & { baseId: string }) {
  const { data, baseId, runs, LinkComponent: L } = p;
  const base = data.bases.find((b) => b.id === baseId)!;
  const actualRetrievals = runs.flatMap((run) =>
    run.retrievals
      .filter((r) => r.baseId === baseId)
      .map((retrieval) => ({ run, retrieval })),
  );
  const retrievalSample = Boolean(
    base.observed && !actualRetrievals.length && data.examples,
  );
  const retrievalData = retrievalSample ? data.examples! : data;
  const retrievals = retrievalSample
    ? retrievalData.runs
        .slice(0, 3)
        .flatMap((run) =>
          run.retrievals.map((retrieval) => ({ run, retrieval })),
        )
    : actualRetrievals;
  const hits = retrievals.filter((r) => r.retrieval.status === "hit");
  return (
    <div className="om-knowledge">
      <PageHeader title={base.name} description={base.description} />
      {retrievalSample && (
        <Notice title="检索过程示例" tone="neutral">
          以下为示例查询和指标，不属于当前知识库的真实检索；已采集的引用请在对应会话执行链路查看。
        </Notice>
      )}
      <Stats
        items={[
          {
            label: "检索次数",
            value: retrievals.length,
            note: "当前时间范围内",
          },
          {
            label: "命中率",
            value: retrievals.length
              ? `${((hits.length / retrievals.length) * 100).toFixed(1)}%`
              : "—",
            note: `${hits.length} 次命中 · ${retrievals.length - hits.length} 次未命中或失败`,
          },
          {
            label: "平均检索耗时",
            value: retrievals.length
              ? duration(
                  Math.round(
                    retrievals.reduce((n, r) => n + r.retrieval.durationMs, 0) /
                      retrievals.length,
                  ),
                )
              : "—",
            note: "仅统计本知识库检索",
          },
          {
            label: "返回切片总数",
            value: retrievals.reduce((n, r) => n + r.retrieval.hits.length, 0),
            note: "按每次检索累加，不去重",
          },
        ]}
      />
      <nav className="om-tabs" aria-label="知识库运行内容">
        <L className="" to={basePath(baseId)}>
          文件处理
        </L>
        <L className="is-active" to={`${basePath(baseId)}?tab=retrieval`}>
          检索记录
        </L>
      </nav>

      <Records
        key="retrievals"
        id={`retrievals-${baseId}`}
        title="检索记录"
        headers={[
          "检索内容 / 来源",
          "命中文档",
          "返回切片",
          "耗时",
          "结果",
          "时间",
          "操作",
        ]}
        sourceOptions={data.agents.map((a) => a.name)}
        statusOptions={[
          ["hit", "命中"],
          ["no_hit", "未命中"],
          ["failed", "失败"],
        ]}
        rows={retrievals.map(({ run, retrieval: r }) => {
          const conversation = retrievalData.conversations.find(
            (c) => c.id === run.conversationId,
          )!;
          const agent = retrievalData.agents.find(
            (a) => a.id === conversation.agentId,
          )!;
          const href = `${conversationPath(agent.id, conversation.id)}?run=${run.id}&node=knowledge`;
          return {
            id: run.id,
            text: `${r.query} ${run.id} ${agent.name}`,
            status: r.status,
            source: agent.name,
            cells: [
              <Cell
                title={
                  retrievalSample ? (
                    `${r.query}（示例）`
                  ) : (
                    <L to={href}>{r.query}</L>
                  )
                }
                subtitle={`${agent.name} · ${run.id}`}
              />,
              new Set(r.hits.map((h) => h.documentId)).size,
              r.hits.length,
              duration(r.durationMs),
              <Badge
                tone={
                  r.status === "hit"
                    ? "success"
                    : r.status === "failed"
                      ? "failed"
                      : "neutral"
                }
              >
                {r.status === "hit"
                  ? "命中"
                  : r.status === "failed"
                    ? "失败"
                    : "未命中"}
              </Badge>,
              time(run.startedAt),
              retrievalSample ? <span>示例</span> : <L to={href}>查看链路</L>,
            ],
          };
        })}
      />
      <p className="om-note">未命中表示检索正常执行，但未返回相关切片。</p>
    </div>
  );
}
