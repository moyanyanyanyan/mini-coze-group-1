import { KnowledgeTokenTrend } from './KnowledgeTokenTrend';
import { DocumentHistory } from './DocumentHistory';
import { useState, type CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { animateOperationsChange } from "./motion";
import {
  Panel,
  Pagination,
  PageHeader,
  Badge,
  Empty,
  Records,
  Cell,
  Notice,
} from "./components";
import {
  basePath,
  taskPath,
  operationsRoot,
  bytes,
  dateTime,
  duration,
  matchesText,
  latestTask,
  type OperationDocument,
  type OperationTask,
} from "./model";
import {
  fileType,
  displaySize,
  baseFiles,
  groupShares,
  originalText,
  taskState,
  slicingState,
  uploadFailed,
  failedStage,
  stageNames,
} from "./knowledge-display";
import type { ContentProps } from "./view-types";
import type { LinkComponentType } from "../../layouts/types";
import "./knowledge.css";

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      style={back ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </svg>
  );
}

function Sample({ children = "模拟数据" }: { children?: string }) {
  return <span className="om-k-sample">{children}</span>;
}

export function StorageRing({
  items,
  label,
  LinkComponent: L,
  href,
  compact = false,
  sample = true,
  trendAt,
  onSelect,
}: {
  items: { id: string; name: string; value: number }[];
  label: string;
  LinkComponent: LinkComponentType;
  href?: (id: string) => string;
  compact?: boolean;
  sample?: boolean;
  trendAt?: number;
  onSelect?: (id: string) => void;
}) {
  const shares = groupShares(items);
  const total = shares.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <div className={`om-k-storage ${compact ? "is-compact" : ""} ${trendAt !== undefined ? "has-trend" : ""}`}>
      <div className="om-k-ring">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${label}：${bytes(total)}${sample ? "，含模拟数据" : ""}`}
        >
          <circle
            className="om-k-ring-track"
            cx="80"
            cy="80"
            r="62"
            fill="none"
            strokeWidth="17"
          />
          {shares.map((item, index) => {
            const percent = (item.value / total) * 100;
            const start = offset;
            offset += percent;
            const circle = (
              <circle
                cx="80"
                cy="80"
                r="62"
                pathLength="100"
                fill="none"
                strokeWidth="17"
                strokeDasharray={`${Math.max(0.1, percent - 0.8)} ${100 - Math.max(0.1, percent - 0.8)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 80 80)"
                style={{ stroke: `var(--om-k-chart-${index})` }}
              >
                <title>
                  {item.name} · {percent.toFixed(1)}% · {bytes(item.value)}
                </title>
              </circle>
            );
            return href && item.id !== "__other" ? (
              <L
                key={item.id}
                to={href(item.id)}
                aria-label={`查看${item.name}`}
              >
                {circle}
              </L>
            ) : (
              <g key={item.id}>{circle}</g>
            );
          })}
        </svg>
        <div className="om-k-ring-label">
          <strong>{items.length ? bytes(total) : "暂无文件"}</strong>
          <span>{label}</span>
          {sample && <Sample>含模拟数据</Sample>}
        </div>
      </div>
      {trendAt !== undefined && <KnowledgeTokenTrend snapshotAt={trendAt} />}
      {!compact && (
        <ul className="om-k-legend">
          {shares.map((item, index) => (
            <li
              key={item.id}
              style={
                { "--swatch": `var(--om-k-chart-${index})` } as CSSProperties
              }
            >
              <i />
              {href && item.id !== "__other" ? (
                <L to={href(item.id)}>{item.name}</L>
              ) : onSelect && item.id !== "__other" ? (
                <button
                  onClick={() =>
                    animateOperationsChange(() => onSelect(item.id))
                  }
                >
                  {item.name}
                </button>
              ) : (
                <span>{item.name}</span>
              )}
              <strong>{((item.value / total) * 100).toFixed(1)}%</strong>
              <small>{bytes(item.value)}</small>
            </li>
          ))}
        </ul>
      )}
      {!total && !compact && <p className="om-note">暂无可统计的文件。</p>}
    </div>
  );
}

const cardMemory = { query: "", page: 1 };
export function Knowledge(p: ContentProps) {
  const { data, LinkComponent: L } = p;
  const [query, setQuery] = useState(cardMemory.query);
  const [page, setPage] = useState(cardMemory.page);
  const [errorPage, setErrorPage] = useState(1);
  const bases = data.bases.filter((b) => matchesText(b.name, query));
  const pages = Math.max(1, Math.ceil(bases.length / 6));
  const current = Math.min(page, pages);
  const errors = data.tasks
    .filter((task) => task.status === "failed")
    .map((task) => ({
      task,
      document: data.documents.find((d) => d.id === task.documentId)!,
    }))
    .filter((item) => item.document)
    .sort((a, b) => errorAt(b.task) - errorAt(a.task));
  const errorPages = Math.max(1, Math.ceil(errors.length / 4));
  const currentError = Math.min(errorPage, errorPages);
  const sampleSizes = data.documents.some(document => document.observed?.sourceSize == null);
  return (
    <div className="om-knowledge">
      <PageHeader
        title="知识库运行"
      />
      <div className="om-k-top">
        <Panel title="文件存储分布" action={sampleSizes ? <Sample>含模拟容量</Sample> : undefined}>
          <StorageRing
            sample={sampleSizes}
            label="原文件总大小"
            items={data.bases.map((base) => ({
              id: base.id,
              name: base.name,
              value: baseFiles(data, base.id).reduce(
                (sum, { document }) => sum + displaySize(document),
                0,
              ),
            }))}
            LinkComponent={L}
            href={basePath}
          />
          <p className="om-note">
            原文件大小
          </p>
        </Panel>
        <Panel
          title="最近错误记录"
          action={
            <span className="om-sub">按时间倒序 · {errors.length} 条</span>
          }
        >
          <div className="om-k-errors">
            {errors
              .slice((currentError - 1) * 4, currentError * 4)
              .map(({ task, document }) => (
                <article key={task.id}>
                  <div>
                    <strong>{document.name}</strong>
                    <Badge tone="failed">{failedStage(task)}</Badge>
                    {!task.observed && <Sample />}
                  </div>
                  <p>
                    {
                      data.bases.find((base) => base.id === document.baseId)
                        ?.name
                    }{" "}
                    · {task.observed ? "文档更新时间" : "模拟错误时间"}{" "}
                    {dateTime(errorAt(task))}
                  </p>
                  <div className="om-k-error-bottom">
                    <span>
                      {task.observed?.error
                        ? `${task.observed.error.code} · ${task.observed.error.message}`
                        : task.error || "未提供错误原因"}
                    </span>
                    <L to={`${taskPath(document.baseId, task.id)}?focus=error`}>
                      查看错误 <Arrow />
                    </L>
                  </div>
                </article>
              ))}
          </div>
          {!errors.length && <Empty>暂无错误记录，文件处理情况正常。</Empty>}
          <Pagination
            page={currentError}
            total={errorPages}
            onChange={page => animateOperationsChange(() => setErrorPage(page))}
          />
        </Panel>
      </div>
      <div className="om-k-section-heading">
        <h2>
          我的知识库 <small>{data.bases.length}</small>
        </h2>
        <input
          type="search"
          aria-label="知识库名称搜索"
          placeholder="搜索知识库名称"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            cardMemory.query = event.target.value;
            cardMemory.page = 1;
          }}
        />
      </div>
      <div className="om-k-cards">
        {bases.slice((current - 1) * 6, current * 6).map((base) => {
          const files = baseFiles(data, base.id);
          const types = new Map<string, number>();
          for (const { document } of files)
            types.set(
              fileType(document),
              (types.get(fileType(document)) ?? 0) + displaySize(document),
            );
          const created = base.observed?.createdAt ? Date.parse(base.observed.createdAt) :
            data.snapshotAt - (30 + data.bases.indexOf(base) * 7) * 86400_000;
          return (
            <article className="om-k-card" key={base.id}>
              <header>
                <L to={basePath(base.id)}>
                  <Icon name="book" />
                  {base.name}
                </L>
                <Badge
                  tone={
                    base.observed?.status === "DISABLED" ? "neutral" : "success"
                  }
                >
                  {base.observed?.status === "DISABLED" ? "已停用" : "可用"}
                  {!base.observed ? " · 模拟" : ""}
                </Badge>
              </header>
              <div className="om-k-card-body">
                <StorageRing
                  compact
                  sample={files.some(({ document }) => document.observed?.sourceSize == null)}
                  label={files.some(({ document }) => document.observed?.sourceSize == null) ? "文件总大小（含模拟）" : "文件总大小"}
                  items={[...types].map(([name, value]) => ({
                    id: name,
                    name,
                    value,
                  }))}
                  LinkComponent={L}
                />
                <dl>
                  <div>
                    <dt>文件数量</dt>
                    <dd>{base.observed?.documentCount ?? files.length} 个</dd>
                  </div>
                  <div>
                    <dt>
                      创建时间 {!base.observed?.createdAt && <Sample />}
                    </dt>
                    <dd>{new Date(created).toLocaleDateString("zh-CN")}</dd>
                  </div>
                  <div>
                    <dt>处理情况</dt>
                    <dd>
                      {base.observed?.failedDocuments ??
                        files.filter((f) => f.task?.status === "failed")
                          .length}{" "}
                      个失败 ·{" "}
                      {base.observed?.processingDocuments ??
                        files.filter((f) => f.task?.status === "processing")
                          .length}{" "}
                      个处理中
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="om-k-type-legend">
                {groupShares(
                  [...types].map(([name, value]) => ({
                    id: name,
                    name,
                    value,
                  })),
                ).map((type, index, all) => (
                  <span key={type.id}>
                    <i style={{ background: `var(--om-k-chart-${index})` }} />
                    {type.name}{" "}
                    {(
                      (type.value / all.reduce((sum, t) => sum + t.value, 0)) *
                      100
                    ).toFixed(1)}
                    % · {bytes(type.value)}
                  </span>
                ))}
              </div>
              <footer>
                <L to={basePath(base.id)}>
                  查看文件 <Arrow />
                </L>
              </footer>
            </article>
          );
        })}
      </div>
      {!bases.length && (
        <Empty>
          {data.bases.length
            ? "没有匹配的知识库，请调整搜索名称。"
            : "暂无知识库。"}
        </Empty>
      )}
      <Pagination
        page={current}
        total={pages}
        onChange={(next) => {
          setPage(next);
          cardMemory.page = next;
        }}
      />
    </div>
  );
}

function errorAt(task: OperationTask) {
  return task.observed
    ? Date.parse(task.observed.updatedAt)
    : task.startedAt + task.uploadMs + task.processingMs;
}

export function BaseFiles(p: ContentProps & { baseId: string }) {
  const { data, baseId, LinkComponent: L } = p;
  const base = data.bases.find((b) => b.id === baseId)!;
  const files = baseFiles(data, baseId);
  const sampleSizes = files.some(({ document }) => document.observed?.sourceSize == null);
  const [selected, setSelected] = useState("");
  return (
    <div className="om-knowledge">
      <L className="om-k-back" to={`${operationsRoot}/knowledge`}>
        <Arrow back />
        返回知识库列表
      </L>
      <PageHeader
        title={base.name}
        description={`${base.observed?.documentCount ?? files.length} 个文件`}
        action={
          <Badge
            tone={base.observed?.status === "DISABLED" ? "neutral" : "success"}
          >
            {base.observed?.status === "DISABLED" ? "已停用" : "可用"}
            {!base.observed && " · 模拟"}
          </Badge>
        }
      />
      <nav className="om-tabs" aria-label="知识库运行内容">
        <L className="is-active" to={basePath(baseId)}>
          文件处理
        </L>
        <L to={`${basePath(baseId)}?tab=retrieval`}>检索记录</L>
      </nav>
      <Panel title="存储与检索用量" action={sampleSizes ? <Sample>含模拟容量</Sample> : undefined}>
        <StorageRing
          sample={sampleSizes}
          trendAt={data.snapshotAt}
          items={files.map(({ document }) => ({
            id: document.id,
            name: document.name,
            value: displaySize(document),
          }))}
          label="原文件总大小"
          LinkComponent={L}
          onSelect={(id) => {
            setSelected(id);
            window.document
              .getElementById("om-k-files")
              ?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
              });
          }}
        />
        <p className="om-note">
          点击图例筛选文件
        </p>
      </Panel>
      <div id="om-k-files">
        {selected && (
          <div className="om-toolbar">
            <span>
              正在查看：
              {files.find((f) => f.document.id === selected)?.document.name}
            </span>
            <button
              onClick={() => animateOperationsChange(() => setSelected(""))}
            >
              显示全部文件
            </button>
          </div>
        )}
        <Records
          id={`knowledge-files-${baseId}`}
          title="文件列表"
          headers={[
            "文件名",
            "文件大小",
            "类型",
            "切片数量",
            "切片状态",
            "上传时间",
            "处理状态",
            "操作",
          ]}
          statusOptions={[
            ["ready", "处理完成"],
            ["failed", "失败"],
            ["processing", "处理中"],
          ]}
          rows={files
            .filter((f) => !selected || f.document.id === selected)
            .map(({ document, task }) => ({
              id: document.id,
              text: document.name,
              status: task?.status,
              cells: [
                <Cell
                  title={
                    task ? (
                      <L to={taskPath(baseId, task.id)}>{document.name}</L>
                    ) : (
                      document.name
                    )
                  }
                  subtitle={document.id}
                />,
                uploadFailed(task) ? "未知" : `${bytes(displaySize(document))}${document.observed?.sourceSize == null ? "（模拟）" : ""}`,
                fileType(document),
                document.observed?.chunkCount ??
                  (slicingState(task) === "成功"
                    ? document.chunks.length
                    : "—"),
                slicingState(task),
                <Cell
                  title={task ? dateTime(task.startedAt) : "未采集"}
                  subtitle={document.observed ? "文档创建时间" : "模拟时间"}
                />,
                <Cell title={<Badge tone={task?.status ?? "neutral"}>{document.observed?.attempts?.latestSource === 'RETRY' && task?.status === 'processing' ? '重新处理中' : taskState(task)}</Badge>}
                  subtitle={document.observed?.attempts?.recordedCount ? `${document.observed.attempts.latestSource === 'RETRY' && task?.status === 'ready' ? '重试后完成 · ' : ''}已记录 ${document.observed.attempts.recordedCount} 次处理` : document.observed ? '历史尚未采集' : '模拟记录'} />,
                task ? (
                  <L className="om-k-open" to={taskPath(baseId, task.id)}>
                    查看 <Arrow />
                  </L>
                ) : (
                  "—"
                ),
              ],
            }))}
        />
      </div>
    </div>
  );
}

function Preview({
  document,
  task,
}: {
  document: OperationDocument;
  task: OperationTask;
}) {
  const [textMode, setTextMode] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const type = fileType(document);
  const text = originalText(document);
  if (uploadFailed(task))
    return (
      <Empty>
        <strong>文件上传失败</strong>
        <p>{task.error ?? task.observed?.error?.message}</p>
        <span>原文件不可用，请查看右侧失败节点。</span>
      </Empty>
    );
  if (document.parsedText != null) return <>
    <pre className="om-k-text-preview">{document.parsedText || '解析文本为空'}</pre>
  </>;
  return (
    <>
      <div className="om-k-preview-toolbar">
        <Sample>模拟预览 · 非真实原文件</Sample>
        <button
          onClick={() => animateOperationsChange(() => setTextMode(!textMode))}
        >
          {textMode ? "返回文件预览" : "查看解析文本"}
        </button>
      </div>
      {textMode || ["TXT", "Markdown", "JSON"].includes(type) ? (
        <pre className="om-k-text-preview">{text}</pre>
      ) : type === "图片" ? (
        <>
          <button
            className="om-k-image"
            aria-label={zoom ? "缩小图片" : "放大图片"}
            aria-pressed={zoom}
            onClick={() => animateOperationsChange(() => setZoom(!zoom))}
          >
            <img
              key={retry}
              className={zoom ? "is-zoomed" : ""}
              src="/operations-samples/document.svg"
              alt="模拟资料图片，展示售后服务流程"
              onError={() => setFailed(true)}
            />
          </button>
          <p className="om-note">点击图片放大／缩小。</p>
        </>
      ) : type === "PDF" ? (
        <iframe
          key={retry}
          title="模拟 PDF 文件预览"
          className="om-k-pdf"
          src="/operations-samples/document.pdf"
          onError={() => setFailed(true)}
        />
      ) : (
        <Empty>
          <p>暂不支持此格式在线预览。</p>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
            download="模拟解析文本.txt"
          >
            下载模拟解析文本
          </a>
        </Empty>
      )}
      {(failed || type === "PDF") && (
        <div className="om-k-preview-fallback">
          <span>
            {failed
              ? "预览加载失败"
              : "若浏览器无法显示 PDF，可单独打开模拟文件。"}
          </span>
          <button
            onClick={() => {
              setFailed(false);
              setRetry(retry + 1);
            }}
          >
            重新加载
          </button>
          {type === "PDF" && (
            <a
              href="/operations-samples/document.pdf"
              target="_blank"
              rel="noreferrer"
            >
              打开模拟 PDF
            </a>
          )}
        </div>
      )}
      <p className="om-note">
        示例预览
      </p>
    </>
  );
}

export function Document(p: ContentProps & { baseId: string; taskId: string }) {
  const { data, baseId, taskId, LinkComponent: L } = p;
  const task = data.tasks.find((t) => t.id === taskId)!;
  const document = data.documents.find((d) => d.id === task.documentId)!;
  const base = data.bases.find((b) => b.id === baseId)!;
  const chunkTab = new URLSearchParams(p.search).get("tab") === "chunks";
  const focusError = new URLSearchParams(p.search).get("focus") === "error";
  const [chunkPage, setChunkPage] = useState(1);
  const [sampleChain, setSampleChain] = useState(false);
  const chunks = uploadFailed(task) ? [] : document.chunks;
  const pages = Math.max(1, Math.ceil(chunks.length / 3));
  const page = Math.min(chunkPage, pages);
  const latest = latestTask(data, document.id);
  const actual = task.observed;
  return (
    <div className="om-knowledge">
      <L className="om-k-back" to={basePath(baseId)}>
        <Arrow back />
        返回{base.name}
      </L>
      <PageHeader
        title={document.name}
        description={`${fileType(document)} · ${actual ? "当前文档状态" : `第 ${task.attempt} 次处理 · 模拟记录`}`}
        action={<Badge tone={task.status}>{taskState(task)}</Badge>}
      />
      <div className="om-k-file-meta">
        <span>
          文件大小{" "}
          <strong>
            {uploadFailed(task) ? "未知" : bytes(displaySize(document))}
          </strong>{" "}
          {document.observed?.sourceSize == null && <Sample />}
        </span>
        <span>
          {actual ? "文档创建时间" : "上传时间（模拟）"}{" "}
          <strong>{dateTime(task.startedAt)}</strong>
        </span>
        <span>
          切片数量 <strong>{actual?.chunkCount ?? chunks.length}</strong>
        </span>
        <span>
          切片状态 <strong>{slicingState(task)}</strong>
        </span>
      </div>
      {latest && latest.id !== task.id && (
        <Notice title="正在查看历史处理记录" tone="neutral">
          本次记录不会被重试结果覆盖。
          <L to={taskPath(baseId, latest.id)}>
            查看最新处理：{taskState(latest)}
          </L>
        </Notice>
      )}
      <nav className="om-tabs" aria-label="文件处理内容">
        <L
          className={!chunkTab ? "is-active" : ""}
          to={taskPath(baseId, taskId)}
        >
          文件预览
        </L>
        <L
          className={chunkTab ? "is-active" : ""}
          to={`${taskPath(baseId, taskId)}?tab=chunks`}
        >
          切片预览 · {actual?.chunkCount ?? chunks.length}
        </L>
      </nav>
      {chunkTab ? (
        <Panel
          title="切片预览"
          action={
            actual ? (
              <span className="om-sub">当前接口返回 · 非历史快照</span>
            ) : (
              <Sample />
            )
          }
        >
          {task.status !== "ready" && chunks.length > 0 && (
            <p className="om-note">
              已生成，尚未入库
            </p>
          )}
          {!chunks.length && (
            <Empty>
              {uploadFailed(task)
                ? "文件上传失败，未生成切片内容。"
                : task.status === "failed"
                  ? `${taskState(task)}，暂无可展示的切片内容。`
                  : base.observed?.status === "DISABLED"
                    ? "知识库已停用，当前接口不支持查看切片。"
                    : task.status === "processing"
                      ? "文件处理中，切片尚未生成或尚不可读取。"
                      : "暂无可展示的切片内容。"}
            </Empty>
          )}
          <div className="om-padding">
            {chunks.slice((page - 1) * 3, page * 3).map((chunk) => (
              <article className="om-chunk" key={chunk.id}>
                <header>
                  <strong>#{String(chunk.position).padStart(3, "0")}</strong>
                  <Badge
                    tone={
                      task.status === "ready" && chunk.enabled !== false
                        ? "success"
                        : "neutral"
                    }
                  >
                    {task.status !== "ready"
                      ? "未入库"
                      : chunk.enabled === false
                        ? "停用"
                        : "可检索"}
                  </Badge>
                </header>
                <p>{chunk.content}</p>
                <footer>
                  字符范围 {chunk.start + 1}–{chunk.end} ·{" "}
                  {bytes(new TextEncoder().encode(chunk.content).length)}
                </footer>
              </article>
            ))}
          </div>
          <Pagination
            page={page}
            total={pages}
            onChange={setChunkPage}
          />
        </Panel>
      ) : (
        <div className="om-k-document-layout">
          <Panel
            title={document.parsedText != null ? "解析文本预览" : "原文件预览"}
            action={
              <Badge tone={task.status}>
                {uploadFailed(task) ? "上传失败" : taskState(task)}
              </Badge>
            }
          >
            <Preview document={document} task={task} />
          </Panel>
          <section
            className={focusError ? "om-k-chain is-focused" : "om-k-chain"}
            aria-label="文件处理链路"
          >
            {actual && <DocumentHistory document={document} baseId={baseId} LinkComponent={L} />}
            <Panel
              title="文件处理链路"
              action={<span className="om-sub">{actual ? "当前状态" : "模拟链路"}</span>}
            >
              {actual && (
                <div className="om-k-preview-toolbar">
                  <button
                    aria-expanded={sampleChain}
                    onClick={() =>
                      animateOperationsChange(() =>
                        setSampleChain(!sampleChain),
                      )
                    }
                  >
                    {sampleChain ? "返回实际状态" : "查看完整模拟链路"}
                  </button>
                </div>
              )}
              {actual && sampleChain && (
                <Notice title="完整链路为模拟数据" tone="neutral">
                  下面的阶段结果和耗时只用于 UI 演示，与此文件实际处理结果无关。
                </Notice>
              )}
              {actual && !sampleChain ? (
                <div className="om-padding">
                  <ol className="om-stages">
                    <li>
                      <span className={`om-stage-dot om-tone-${task.status}`}>
                        <Icon
                          name={
                            task.status === "failed"
                              ? "close"
                              : task.status === "ready"
                                ? "check"
                                : "more"
                          }
                        />
                      </span>
                      <div>
                        <div className="om-stage-title">
                          <strong>
                            {stageNames[actual.stage] ?? actual.stage}
                          </strong>
                          <span>{taskState(task)}</span>
                        </div>
                        <p>更新时间 {dateTime(Date.parse(actual.updatedAt))}</p>
                        <p>阶段耗时：未采集</p>
                      </div>
                    </li>
                  </ol>
                </div>
              ) : (
                <ol className="om-stages om-padding">
                  {task.stages.map((stage, index) => (
                    <li
                      key={stage.name}
                      className={
                        stage.status === "failed" ? "om-k-failed-stage" : ""
                      }
                    >
                      <span className={`om-stage-dot om-tone-${stage.status}`}>
                        <Icon
                          name={
                            stage.status === "success"
                              ? "check"
                              : stage.status === "failed"
                                ? "close"
                                : "more"
                          }
                        />
                      </span>
                      <div>
                        <div className="om-stage-title">
                          <strong>{stage.name}</strong>
                          <span>
                            {stage.status === "pending"
                              ? "未执行"
                              : stage.status === "running"
                                ? "进行中"
                                : stage.status === "failed"
                                  ? "失败"
                                  : "完成"}
                          </span>
                        </div>
                        <p>
                          {index === 0 && stage.status === "success"
                            ? "文件接收成功 · "
                            : ""}
                          {stage.description}
                        </p>
                        {stage.status !== "pending" &&
                          stage.status !== "running" && (
                            <small>
                              {duration(stage.durationMs)} · 模拟耗时
                            </small>
                          )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {task.status === "failed" && (
                <Notice title={taskState(task)} tone="failed">
                  {actual?.error
                    ? `${actual.error.code} · ${actual.error.message}`
                    : task.error || "未提供具体错误原因"}
                </Notice>
              )}
              {task.status === "processing" && (
                <p className="om-note">
                  {!actual && slicingState(task) === "成功"
                    ? "正在生成向量 · 已生成，尚未入库"
                    : "处理尚未结束。"}
                </p>
              )}
              <L className="om-k-open" to="/workspace/knowledge">
                前往知识库模块 <Arrow />
              </L>
            </Panel>
          </section>
        </div>
      )}
    </div>
  );
}
