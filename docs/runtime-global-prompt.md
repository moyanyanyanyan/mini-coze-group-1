# 全局 Prompt Runtime 联调

基线：`origin/main@b3ab613`；开发分支：`codex/runtime-global-prompt`。

## 请求契约

- 聊天：`POST /internal/runtime/run`、`POST /internal/runtime/stream` 在现有请求顶层增加 `globalPrompt`。现有 `actor: {id: userId}` 不变，内部 Bearer 认证不变。
- 工作流：`POST /internal/workflow/run` 接收 `{definition, input, actor: {id: userId}, globalPrompt}`。为兼容现有调用，`actor` 可省略；传入时按 Actor 类型校验。它不构成认证凭证，也不会触发用户配置反查，归属校验仍由 NestJS 负责。
- `globalPrompt` 可省略，默认 `""`；仅接受字符串，最多 4000 个 Unicode 字符。`null`、非字符串和超长文本返回现有 `400 INVALID_REQUEST`。NestJS 应将未设置/清空规范化为 `""`，不要发 `null`。
- 空字符串和纯空白不注入。非空文本按原样放入独立 `user` 消息，不做工作流模板展开。原 system 内容保留，附加固定的优先级说明。提示词不能代替权限控制。
- NestJS 每轮按已认证运行身份读取一次设置；同一工作流各节点及循环复用这个快照。Python 不缓存跨请求状态，不修改 Agent、工作流定义或历史消息，不回显偏好字段。
- 合并后的消息继续接受模型上下文预算校验，工具循环每轮保留一份偏好。工作流使用现有节点错误映射处理预算超限。
- 首期仅对 Web 登录用户生效。公开 API Key 链路不得由 NestJS 自动传入此字段；Python 内部接口不能区分 Web 与 API Key 来源。

## 联调步骤

1. 将此分支与李想的 NestJS 全局 Prompt 分支合入联调分支；不要重复在 NestJS 拼接模型 messages。
2. 按项目现有方式启动服务。个人中心设置“每次回答以 GLOBAL_PROMPT_OK 开头”，从网页普通聊天、流式聊天和工作流分别发送简短问题。
3. 确认 NestJS 发往 Python 的顶层 `globalPrompt` 是本轮快照。工作流还需发送真实 `actor.id`，不是 Start 节点 input 字段。
4. 验证清空后恢复原行为、两用户隔离、循环节点一致、包含 `{{...}}` 的偏好保持字面文本、工具多轮不重复注入，以及 4001 字符拒绝。
5. 检查公开 API 请求未继承用户设置，Agent 发布配置、Workflow Definition 和聊天历史未被写入偏好。

## 验证与边界

运行 `PYTHONPATH=apps/agent .venv/bin/python -m pytest apps/agent/tests -q`。
新增测试覆盖两种聊天 HTTP 入口、字段边界、空值兼容、工具循环、上下文预算、工作流 HTTP 注入、并发循环快照隔离及模板不展开；保留旧分支的 3 项知识库/内部错误 HTTP 与 SSE 回归，以及对应 INTERNAL_ERROR 的 HTTP 500 修复。

2026-11-23：全量 Python 测试 172 项通过（新增全局 Prompt 19 项，保留旧分支回归 3 项）。通过 FastAPI TestClient 调用真实路由和本机配置的真实模型，聊天 JSON、聊天 SSE、工作流均成功完成且观察到 `GLOBAL_PROMPT_OK` 前缀；这是进程内 HTTP 路由与真实上游的验证，不是浏览器或 NestJS 端到端验证。现有 Starlette/AnyIO 弃用警告不影响结果。

截至本次核对，最新 main 和已获取的远程分支尚未包含李想所述 NestJS 全局 Prompt 改动，已通过飞书索取分支/提交。因此本分支不宣称完整 Web 设置到模型的端到端联调通过，也没有代写用户设置或公开 API 逻辑。

## 2026-11-25 双方联调

在 `codex/integration/global-prompt` 合并 Runtime `9f17fd8` 和李想 NestJS `b943c29`。后者基于较旧主线；合并保留真实 JWT/用户归属、历史截断回归、工作流长超时和抽取后的 UI 组件，补入个人中心状态与图标。没有恢复开发用户身份或 JWT guard 替身。

发现并修复公开 API 流式隔离遗漏：原来仅 `PublicApiService.run` 传 `useGlobalPrompt: false`，`stream` 和 `ChatService.run` 没有对应传递，会读取用户设置。现在两条公开链路都显式关闭，新增服务调用和“不读取设置”的断言。

验证结果：

- Python 全量 172 项通过；后端 Chat、PublicApi、Workflow HTTP 共 7 suites / 87 项通过；个人中心 API 封装、用户状态和模块注册前端 3 files / 15 项通过。前后端 TypeScript 检查通过。
- 使用真实 NestJS ChatService/WorkflowsService/PublicApiService → Python HTTP（独立端口 18000）→ 本机真实模型，存储层显式使用内存替身。聊天 JSON、SSE、工作流分别在有偏好和空白偏好时通过（6 项）；公开 API JSON/SSE 在存在偏好时不查询设置、不传 globalPrompt，正常返回（2 项）。
- 省略字段与 Runtime 默认空字符串契约一致。第一组英文标记测试未通过精确输出断言（一次工作流未命中、一次 SSE 回答将 `GP_ACCEPT_OK` 拆行）；保留这个模型遵循稳定性限制。改用中文“全局偏好生效”的固定样例后上述 8 项通过，不据此承诺任意 Prompt 都会被模型严格遵守。
- `test/users.e2e-spec.ts` 15 项因本机 `127.0.0.1:5433` 数据库不可达而未通过；当前未发现可用 Docker/PostgreSQL 程序。没有连接其他业务数据库，没有用替身冒充落库验收。完整网页设置保存、刷新及数据库持久化仍需在可用数据库环境补验。
- 本次未进行部署或合并 main；本分支作为双方集成候选，不能宣称完整端到端验收完成。
