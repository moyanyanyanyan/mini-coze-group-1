# MiniCoze

MiniCoze MVP 的多人协作 Monorepo。当前包含应用骨架、领域目录、健康检查、数据库工具链与 Week 2 Agent Runtime；登录、配置管理、真实 RAG/插件和工作流执行仍需对应模块接入。

## 目录

- `apps/web`：React + Vite 前端。
- `apps/backend`：NestJS 业务 API，也是数据库的唯一访问入口。
- `apps/agent`：FastAPI Agent 服务，后续承载模型、检索和工作流执行。
- `packages/shared`：前端与 NestJS 已经实际共用的稳定 TypeScript 类型；当前仅包含健康检查响应。
- `docs`：架构边界和协作约定。

## 环境要求

- Node.js 22.12+
- pnpm 12+
- Python 3.11+
- Docker Desktop（用于 PostgreSQL/pgvector）

## 首次安装（Windows PowerShell）

```powershell
Copy-Item .env.example .env
pnpm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r apps/agent/requirements.txt
pnpm --filter @minicoze/backend prisma:generate
```

## 本地启动

必须先激活 Python 虚拟环境，再在一个终端同时启动三个应用：

```powershell
docker compose up -d
pnpm dev
```

也可以分别执行 `pnpm dev:web`、`pnpm dev:backend` 和 `pnpm dev:agent`。默认地址：

- Web：http://localhost:5173
- Backend 健康检查：http://localhost:3000/api/health
- Agent 健康检查：http://localhost:8000/health
- PostgreSQL：localhost:5432

## 环境变量

- Web：`VITE_API_BASE_URL`
- Backend：`PORT`、`WEB_ORIGIN`、`AGENT_SERVICE_URL`、`DATABASE_URL`
- Agent：`AGENT_PORT`、`BACKEND_ORIGIN`、`INTERNAL_SERVICE_TOKEN`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`；完整配置见 `.env.example`。

Backend 与 Agent 共用根目录 `.env`，因此分别使用 `PORT` 和 `AGENT_PORT`，避免端口配置互相覆盖。

停止数据库但保留数据：`docker compose down`。只有明确需要清空本地数据库时才执行 `docker compose down -v`。

## 验证

```powershell
pnpm typecheck
pnpm build
pnpm test
docker compose config --quiet
```

开发前请阅读 [架构与协作约定](docs/architecture.md)和[开发指南](docs/development.md)。真实密钥和本地 `.env` 不得提交到仓库。

## Agent Runtime（Week 2）

`POST /internal/runtime/run` 和 `POST /internal/runtime/stream` 供 NestJS 调用，均要求 `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>`；浏览器和公开 API 不直接调用 FastAPI。工作流可通过 `from app.runtime import call_model, ModelError` 复用单次模型能力。

启动前配置本地 `.env` 的模型凭据与内部凭证。执行 `python -m pytest apps/agent/tests -q` 可离线自测；显式执行 `python apps/agent/scripts/smoke_runtime.py --live` 会产生最多三次真实模型调用，启动临时本机服务并在结束后清理。该脚本会生成仅本次验收使用的内部凭证，不修改 `.env`。

接口样例、依赖桩边界及实际验收记录见 [第二周 Runtime 工作文档](docs/week2-agent-runtime-wang-yiheng.md)。
