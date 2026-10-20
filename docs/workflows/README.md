# Week2 工作流服务交付说明

负责人：康雨萱。分支：`kyx/workflowService`。实现基线：编辑器新版 v1.0 契约。

## 当前交付状态

- 已实现 8 个 NestJS 接口、Prisma 领域模型、Python 校验/执行器、变量替换、运行结果落库逻辑和自动测试。
- 尚未完成真实数据库验收：本次环境没有 Docker/PostgreSQL 命令；没有生成或提交 migration。
- 尚未完成真实 DeepSeek 验收：仓库 `app/runtime` 目前没有模型调用实现；不另写 DeepSeek 客户端，不静默降级 Mock。
- 尚未与同学实际联调，以下协调清单供负责人发送和约时间。自动测试不能替代真实模型、数据库和编辑器验收。
- 鉴权、发布、版本、SSE、运行取消和历史查询接口不在本次交付中。`currentVersionId` 始终为 null。

## 启动与数据库部署

沿用仓库 README 安装依赖和启动三个服务。仅限本地开发，在根 `.env` 加：

```dotenv
WORKFLOW_DEV_MODE=true
```

其他配置沿用 `DATABASE_URL`、`AGENT_SERVICE_URL`（默认 http://localhost:8000）、`PORT`（3000）。不要提交 `.env`。

未显式打开开发开关，或 `NODE_ENV=production` 时，所有工作流业务接口返回 503。当前没有 JWT 权限隔离，所有本地调用共享服务端固定身份 `workflow-dev-user`、workspace `workflow-dev-workspace`；前端不需要 JWT，未来由真实 CurrentUser 替换。创建请求的 workspaceId 可省略，若提供必须为这个固定 workspace。禁止将此开发配置用于公开部署。

领域模型位于 `apps/backend/prisma/schema/workflows.prisma`。遵循仓库约定：由集成人员将 Schema 合入集成分支后，针对开发数据库统一生成、审核和应用 migration：

```sh
pnpm --filter @minicoze/backend prisma:validate
pnpm --filter @minicoze/backend prisma:migrate --name workflow_week2
pnpm --filter @minicoze/backend prisma:generate
```

然后运行 `pnpm dev`。不要在个人分支提交并行 migration；不要用共享数据库测试破坏性操作。Python 不连接数据库。内部 Python 接口仅供可信本地/内部网络调用；本轮未创建独立内部 token 机制，待与组长统一。

## 接口文档

Base URL：`http://localhost:3000/api`。Content-Type：`application/json`。

| 方法/路径 | 请求 | 响应 |
|---|---|---|
| POST /workflows | `{ "name":"问答", "description":"可选", "workspaceId":"workflow-dev-workspace" }` | 201；完整 Workflow，draftDefinition=null、status=DRAFT、currentVersionId=null |
| GET /workflows | page=1，size=10（1–50），keyword 可选，status 可选 | 200；`{items,total,page,size}`，列表项含 nodeCount、currentVersionId，不含 draftDefinition |
| GET /workflows/:id | 无 | 200；完整 Workflow，包括 draftDefinition |
| PUT /workflows/:id/draft | `{ "definition": WorkflowDefinition }` | 200；`{id,updatedAt}` |
| PATCH /workflows/:id | name、description 至少按需传递 | 200；`{id,updatedAt}` |
| DELETE /workflows/:id | 无 | 204，无响应体；归档后详情不可访问 |
| POST /workflows/:id/validate | `{ "definition": WorkflowDefinition }` 或 `{}` | 200；`{valid,errors}` |
| POST /workflows/:id/run | `{ "input": { "query":"你好" } }` | 200；WorkflowRunResult；运行前请求错误见下 |

列表默认隐藏 ARCHIVED，可显式传 status=ARCHIVED 查询归档元数据。ACTIVE 为保留状态，本轮无激活/发布入口。找不到或已归档的工作流返回 404。

Workflow 公共字段：id、workspaceId、creatorId、name、description、status、draftDefinition、currentVersionId、createdAt、updatedAt。时间由 NestJS 序列化为 ISO 8601。名称长 1–120，描述最多 2000 字符。列表支持名称不区分大小写包含搜索，按更新时间倒序排列。

### Definition 和草稿

完整可复制示例见 [example.workflow.json](example.workflow.json)。顶层 `{version:"1.0",nodes:[],edges:[]}`，仅一个 Start、一个 LLM、一个 End，最多 50 节点的通用上限仍保留校验。执行顺序由边决定，不依赖数组顺序。

- Start：inputs 至少一个，name 唯一且符合标识符规则，type 为 string/number/boolean，required 为布尔值。未提供的可选输入不会生成输出字段；若后续引用该缺失值，会报告节点失败。defaultValue 是 UI 元数据，本轮不由服务端补值。
- LLM：model 非空；本轮联调使用 deepseek-chat；temperature 默认 0.7、范围 0–2；maxTokens 默认 2048、整数 1–8192。systemPrompt 默认空；userPromptTemplate 必填且非空，两者均支持 `{{nodeId.field}}`。若提供 outputs 必须是 `[{"name":"text","type":"string"}]`。输出允许额外 usage，但变量只允许引用 text。
- End：outputs 至少一个，name 合法且唯一；type 为上述三种；valueFrom 是 `nodeId.field`，不带花括号，引用字段类型必须与声明一致。
- 节点 id 允许英文、数字、下划线、连字符；引用只允许上游已声明字段。不支持表达式、嵌套属性、默认值或花括号内空白。
- number/boolean 在 Start 和 End 保留原类型；插入 prompt 时按 JSON 文本编码（false 为 `false`）。required 表示必须提供键；空字符串、0、false 不当作缺失，null 不符合三种输入类型。

保存草稿只检查 version 为字符串、nodes/edges 为数组、节点与连线的基本字段类型；保留 label、position、handles 和附加 UI 字段。缺失连线、未完成的节点参数、重复 ID、错误引用可以保存，由完整校验拦截执行。新建草稿为 null，前端自行生成默认模板。

### 校验与错误

`/validate` 的业务校验失败始终 HTTP 200：

```json
{"valid":false,"errors":[{"code":"INVALID_REFERENCE","message":"INVALID_REFERENCE: data.userPromptTemplate","nodeId":"node-llm-1","edgeId":null,"field":"data.userPromptTemplate"}]}
```

前端按 code 识别错误、nodeId/edgeId 高亮、field 定位表单；不要解析 message。校验覆盖 R01–R24，并增加 LLM 数量固定为一、字段类型、required 布尔类型和 End 输出类型匹配检查。非法引用示例：把样例中 userPromptTemplate 改为 `{{node-end-1.result}}`。

`/run` 在创建运行记录前验证 Definition 和 input：图非法返回 422 + WORKFLOW_INVALID；输入缺失/类型错误返回 400 + INVALID_INPUT。两者使用现有全局异常格式并保留 details：

```json
{"statusCode":422,"message":"WORKFLOW_INVALID","path":"/api/workflows/wf/run","timestamp":"2026-10-20T00:00:00.000Z","details":[{"code":"INVALID_REFERENCE","message":"引用非法","nodeId":"node-llm-1","edgeId":null,"field":"data.userPromptTemplate"}]}
```

沿用仓库 `path/timestamp` 异常封装，没有额外添加附件示例中的 error 字段。Agent 在预校验阶段不可达返回 503，不创建 RUNNING 记录。

### 同步运行结果

前端先保存当前画布，然后运行；运行使用读取时的草稿快照，即使运行期间又保存，也不改变本次执行内容。

```json
{
  "runId":"uuid",
  "status":"SUCCEEDED",
  "output":{"result":"你好"},
  "nodeResults":[
    {"nodeId":"node-start-1","type":"start","status":"SUCCEEDED","input":{"query":"你好"},"output":{"query":"你好"},"error":null,"durationMs":0},
    {"nodeId":"node-llm-1","type":"llm","status":"SUCCEEDED","input":{"query":"你好"},"output":{"text":"你好","usage":{"totalTokens":30}},"error":null,"durationMs":1200},
    {"nodeId":"node-end-1","type":"end","status":"SUCCEEDED","input":{"result":"你好"},"output":{"result":"你好"},"error":null,"durationMs":0}
  ],
  "error":null
}
```

已开始执行后的节点失败返回 HTTP 200 + FAILED，保留前序结果；失败节点 error.code 为 LLM_TIMEOUT、LLM_UNAVAILABLE 或 NODE_EXECUTION_FAILED；顶层 error 为 NODE_EXECUTION_FAILED 并含 nodeId。后续节点 SKIPPED，output=null。LLM 超时 60 秒，NestJS 每次内部请求超时 75 秒，不自动重试。

Python 不可达、超时或响应异常发生在创建记录之后：返回 FAILED、顶层 WORKFLOW_SERVICE_UNAVAILABLE，nodeResults=[]（服务端无法确认执行到哪个节点，不伪造结果）。每个正常返回的终态先更新数据库再返回。数据库故障可能导致写入终态失败并返回 500；进程被强制停止可能留下 RUNNING，自动恢复任务属于后续工作。

运行记录持久化 Definition 快照、input/output、nodeResults、error、startedAt/endedAt；本轮不提供运行历史查询接口。

## Runtime 交接：王一恒

工作流没有另建 DeepSeek 客户端。由 Runtime 负责人提供一个公开异步非流式函数，并在 FastAPI 启动期间注入：

```python
# complete 必须来自 Runtime 的公开入口；具体 import 待双方确认。
app.state.workflow_complete = complete

async def complete(*, model: str, system_prompt: str, user_prompt: str,
                   temperature: float, max_tokens: int) -> dict:
    # return {"text": str, "usage": optional dict}
    ...
```

这是工作流适配器提出的接入签名，不代表王一恒已确认。接入时只改适配器/启动装配，不改 Definition 或前端接口。usage 若存在应使用 promptTokens、completionTokens、totalTokens。异常需向上传播；TimeoutError 映射 LLM_TIMEOUT，其他异常映射 LLM_UNAVAILABLE，不暴露异常原文或 Key。现有适配器施加 60 秒 asyncio 超时，Provider 不应吞掉取消或执行同步阻塞 I/O。

未注入 Provider 时仍可保存和校验；运行会在 LLM 节点 FAILED，不能当作真实模型验收通过。

内部 API：POST /internal/workflow/validate，body `{definition}`；为 NestJS 运行预检也接受 `{definition,input}`，图合法后检查输入。POST /internal/workflow/run，body `{definition,input}`，图非法 422、输入非法 400，均使用 FastAPI detail；成功/执行失败返回不含 runId 的运行结果。runId 与持久化完全由 NestJS 管理。

## 验证与联调清单

自动检查（macOS；先安装依赖）：

```sh
pnpm --filter @minicoze/backend prisma:validate
pnpm --filter @minicoze/backend prisma:generate
pnpm --filter @minicoze/backend typecheck
pnpm --filter @minicoze/backend test
pnpm --filter @minicoze/backend build
.venv/bin/python -m pytest apps/agent/tests
```

本次自动结果：Python 21 项、NestJS 8 项通过，Prisma validate/generate、后端类型检查和构建通过。NestJS HTTP 测试使用 Repository/Agent 桩，覆盖真实 DTO、Controller、Service 和异常过滤器，尚不证明 PostgreSQL 读写。Python 测试使用固定返回的异步 Provider，不调用真实模型。

真实服务就绪后可运行 `.venv/bin/python docs/workflows/smoke.py`，自动创建并保留一条验收工作流，验证 HTTP 保存、加载、校验和成功运行；这不证明 Provider 实际使用了哪家模型，须核对 Runtime 配置。

22 日中午前须人工完成：

- [ ] 集成人员应用 migration，记录分支和提交。
- [ ] 王一恒提供公开模型调用函数，适配器真实接入，记录依赖提交。
- [ ] 在编辑器创建、保存、刷新恢复节点/坐标/连线。
- [ ] 制造非法引用，验证节点/表单定位，然后修复保存。
- [ ] 运行真实 DeepSeek：query → text → result，核对 usage 和三个节点状态。
- [ ] 查询数据库确认 Definition 快照和成功运行记录；服务重启后仍可加载草稿。
- [ ] 模拟模型失败、Python 不可达，核对 HTTP 语义、节点状态和失败记录。
- [ ] 前端、Runtime、工作流共同记录验收环境、提交、实际输出、未解决问题。

## 建议集中发出的对齐信息（尚未发送）

博美佳：采用附件新版 version/userPromptTemplate/valueFrom、PUT /draft、大写状态；请先保存再运行。文档与样例在本目录，开发固定 workspaceId 如上。预约 22 日上午完成保存加载、校验定位和真实运行验收。

王一恒：请确认上面的非流式异步签名和 usage/异常语义，争取 21 日中午前提供公开入口，21 日下午一起完成真实 DeepSeek 调用。没有 Runtime 实现时，真实验收明确处于阻塞状态。

组长：请安排集成分支 migration 执行人，确认内部 token 的统一方案；本轮鉴权暂缓，工作流接口只在显式打开开发开关时提供服务。请审核公共异常过滤器保留 details 的小改动。

周五 23:59 前的协作定稿应包含参与人、最终接口、三方代码提交、真实联调结果和 Week3 遗留项。当前文件为实现交付说明，不能作为已完成三方联调的证明。
