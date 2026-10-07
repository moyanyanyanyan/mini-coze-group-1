# 架构与协作约定

## 调用边界

```text
Browser (React)
       |
       v
Backend (NestJS) ----> PostgreSQL / pgvector
       |
       v
Agent Service (FastAPI) ----> DeepSeek / Embedding（后续接入）
```

- 浏览器只调用 NestJS，不直接调用 FastAPI 或数据库。
- NestJS 负责鉴权、业务 API、数据持久化以及对外公开 API。
- FastAPI 负责 Agent Runtime、模型调用、Embedding 和工作流执行，不直接访问 PostgreSQL。
- 跨模块协作只能依赖已冻结的 API、Service、SDK 或 Schema，不直接导入其他模块内部实现。

## 目录职责

- `apps/web`：页面、路由、浏览器状态和 API 调用。
- `apps/backend`：业务模块、数据库访问、鉴权和 FastAPI 调用适配。
- `apps/agent/app/runtime`：Agent 运行时与模型调用。
- `apps/agent/app/knowledge`：切片、Embedding 和检索逻辑。
- `apps/agent/app/workflow`：工作流校验与执行器。
- `packages/shared`：已经冻结且确实被多个 TypeScript 应用消费的公共契约。

## 本地服务配置

- Web 使用 `VITE_API_BASE_URL` 定位 NestJS API。
- Backend 使用 `PORT`、`WEB_ORIGIN`、`AGENT_SERVICE_URL` 和 `DATABASE_URL`。
- Agent 使用 `AGENT_PORT` 和 `BACKEND_ORIGIN`；`AGENT_PORT` 与 Backend 的 `PORT` 分开，避免共用根 `.env` 时发生覆盖。

## 开发约定

1. 每位成员在自己的分支开发，不直接向公共分支提交。
2. 业务代码放入所属模块，不在根目录创建临时业务实现。
3. 公共契约变更需要先与调用方对齐；未冻结的类型留在模块内部。
4. 依赖模块未完成时使用模块内 Mock 或 Stub，禁止把临时代码放进公共契约。
5. PostgreSQL 只由 NestJS 访问；FastAPI 所需业务数据通过明确的服务接口获取。
6. 环境变量只提交到 `.env.example`，禁止提交真实 API Key、密码或 OAuth 凭据。
