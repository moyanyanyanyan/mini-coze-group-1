# 知识库本地索引验证

本地处理链路：NestJS 解码 TXT/JSON 或文本 → 按字符固定切片（基础片段最多 500 字符，后续片段加前片约 50 字符重叠）→ FastAPI 使用 `BAAI/bge-small-zh-v1.5` 生成 512 维向量 → NestJS 在同一数据库事务中保存片段、向量并将文档置为 `READY`。解析、模型或数据库失败时置为 `FAILED`，不留下已提交的半套索引。

## 首次准备

在仓库根目录：

先确认 `python --version` 指向正常的 Python 3.11+ 安装，而不是其他软件内置的 Python；若不是，请在以下命令中改用该 Python 的绝对路径。

```powershell
Copy-Item .env.example .env
pnpm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/agent/requirements.txt
docker compose up -d
pnpm --filter @minicoze/backend prisma:generate
pnpm --filter @minicoze/backend exec prisma db push --schema prisma
```

在 `.env` 中为 `INTERNAL_SERVICE_TOKEN` 设置双方共用的本地随机值，不要提交该文件。若本机 5432 已占用，同时修改 `POSTGRES_PORT` 和 `DATABASE_URL`（例如都改为 5433）。首次生成向量时模型会从 Hugging Face 下载，之后使用本地缓存。模型版本由 `EMBEDDING_MODEL_REVISION` 固定；变更模型或版本后，已有向量须重建。

`db push` 只用于个人本地验证；正式 migration 和向量索引 SQL 由集成分支统一生成、审核。目前小数据量使用 pgvector 精确查询能力，HNSW 索引留到检索阶段的受控 migration。

## 启动与验收

分别在三个终端运行：

```powershell
pnpm dev:backend
pnpm dev:web
pnpm dev:agent
```

运行根目录 `pnpm dev:agent` 前先激活 `.venv`。也可进入 `apps/agent`，直接用仓库根目录 `.venv\Scripts\python.exe -m app.main` 启动。

打开 `http://localhost:5173/workspace/knowledge`，导入一段含明确事实的文本或 TXT/JSON。提交接口先返回 `202 + documentId`；页面轮询直到 `READY` 或 `FAILED`。`READY` 的 `chunkCount` 必须大于 0，且每个 Chunk 都有 512 维向量。此前因 `INDEXING_NOT_READY` 失败的文档可在页面点击“重新处理”。

当前页面使用本地演示工作空间 `ws-local-demo`，尚未接入登录和 workspace 鉴权。后台处理为 NestJS 进程内调度，并在重启时恢复 `PROCESSING` 文档；正式队列、多实例抢占和向量索引迁移仍需后续处理。

## 第 5 步：检索自测

### 可复现的合成样例

仓库提供 [合成餐费文本](fixtures/rag-reimbursement-sample.txt) 和 `apps/backend/scripts/seed-rag-demo.ts`。启动 PostgreSQL、NestJS、Python Embedding 服务后，在仓库根目录运行：

```powershell
pnpm --filter @minicoze/backend exec ts-node scripts/seed-rag-demo.ts
```

脚本只访问本机 `http://localhost:3000/api` 和演示工作空间 `ws-local-demo`。如果后端使用其他本机端口，可设置 `KNOWLEDGE_API_BASE_URL`（需以 `/api` 结尾）。它创建或复用 `RAG联调-命中库-20261023`、`RAG联调-空库-20261023`，为命中库录入一份合成文本，等待文档 `READY`，检查切片包含餐费上限，再分别验证 `HIT` 与确定性 `NO_HIT`。重复运行不会重复录入；如果同名样例库已有其他资料，脚本会报错，不会删除或覆盖。输出包含当前数据库实际生成的 KB、文档 ID，这些 ID 不能在别人的数据库直接复用。

该文本只含虚构规则，可以提交到 GitHub。脚本不验证内部检索入口的服务身份、Agent 绑定或用户权限；这些仍需与 Agent/Auth/Runtime 联调。

### 手动检索

知识库页面提供三个选项卡：先在左侧选知识库；“文档管理”中录入资料，点击已 `READY` 文档的“查看切片”会直接切到“切片查看”；“检索预览”中输入问题可查看当前知识库匹配的片段、文档标题与分数。长片段列表在内容面板中滚动。页面预览接口仅允许本机开发环境和 `ws-local-demo`，不代替 Runtime 的权限联调。启动 PostgreSQL、NestJS 和 Python 服务，并确认目标知识库已有 `READY` 文档后，也可在仓库根目录运行开发自测脚本：

文档列表提供“删除文档”，知识库标题区提供“删除知识库”。操作前会显示确认提示；删除文档会连同它的切片和向量删除，删除知识库会连同所有文档、切片和向量删除，无法在页面撤销。正在处理的文档不能删除；知识库中存在正在处理的文档时，也不能删除知识库。删除接口目前仅允许本机开发环境的 `ws-local-demo` 使用，正式接入用户和工作空间鉴权后再开放其他工作空间。

```powershell
pnpm --filter @minicoze/backend exec ts-node scripts/retrieval-smoke.ts <真实知识库ID> "报销标准是什么？" HIT
```

脚本直接调用知识库检索核心，输出 `HIT/NO_HIT`、片段内容、文档标题和 `score`。它仅供本地开发验证，不是对外接口，也不验证用户或 Agent 权限。确定性 `NO_HIT` 请使用 ACTIVE、无 READY 片段的空知识库：

```powershell
pnpm --filter @minicoze/backend exec ts-node scripts/retrieval-smoke.ts <空知识库ID> "任意问题" NO_HIT
```

检索核心对每个知识库最多取 5 条，使用相同模型生成问题向量，通过 pgvector 余弦距离计算 `score = 1 - cosine_distance`，只查询 ACTIVE 知识库中 READY 文档的已启用片段。不同模型的旧向量不会混入结果。无分数阈值，因此“无关问题”不保证返回 `NO_HIT`。

Runtime 契约入口是 `POST /internal/knowledge/retrieval`，请求含 `{runId,actorId,agentId,knowledgeBaseIds,query,topK:5}`，成功外壳为 `{code:200,message:"ok",data:{status:"HIT"|"NO_HIT",hits:[...]}}`。当前仓库没有 Agent 绑定与用户权限实现，该 HTTP 入口在服务凭证通过后仍会返回 `403`，避免越权检索。Agent/Auth 模块提供权威校验后，应替换 `KnowledgeRetrievalAccess.assertAllowed()` 并做真实联调；不要通过本地脚本代替权限验收。内部接口错误统一返回 `{code,message,data:null}`。
