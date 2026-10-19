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
- 知识库的文本规范化和固定切片由 NestJS 负责，FastAPI 只提供 Embedding 能力。
- 跨模块协作只能依赖参与方已经确认的 API、Service、SDK 或 Schema，不直接导入其他模块内部实现。

## 目录职责

- `apps/web`：页面、浏览器状态和 API 调用；业务代码按 `features/<领域>` 组织。
- `apps/backend/src/modules`：NestJS 业务领域模块，模块内部拥有自己的 Controller、Service、Repository、DTO 和错误。
- `apps/backend/src/integrations`：FastAPI 等外部服务适配，不承载业务规则。
- `apps/backend/src/database`：Prisma 生命周期和数据库基础设施。
- `apps/backend/prisma`：Prisma 配置；主 datasource 与 generator 位于 `prisma/schema.prisma`，领域模型由负责人开发时按领域增加。
- `apps/agent/app/runtime`：Agent 运行时与模型调用。
- `apps/agent/app/knowledge`：Embedding 能力，不负责切片或数据库访问。
- `apps/agent/app/workflow`：工作流校验与执行器。
- `apps/agent/app/api`：HTTP 路由和传输层转换。
- `packages/shared`：已经确认且被多个 TypeScript 应用实际消费的稳定类型；未确认的业务类型留在所属模块。

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
7. 后端模块只能调用其他模块导出的 Service 或公开接口，禁止导入其他模块的 Repository、内部 DTO 或 Prisma 查询。
8. `common` 只接收至少两个领域已经复用的技术能力，业务逻辑和临时 Mock 留在所属模块。
9. Prisma 模型由领域负责人维护，migration 只在集成分支统一生成和审核。
10. 前端顶级页面只在 `app/feature-registry.tsx` 注册一次，路由、侧栏和首页入口由 registry 派生。

具体 API 路径、请求响应、事件和错误格式由相关负责人共同确认后再写入公共文档和共享类型。
