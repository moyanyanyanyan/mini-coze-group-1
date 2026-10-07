# MiniCoze

MiniCoze MVP 的最小可运行 Monorepo。当前只提供应用骨架、健康检查和本地基础设施，不包含登录、Agent、RAG、插件或工作流业务实现。

## 目录

- `apps/web`：React + Vite 前端。
- `apps/backend`：NestJS 业务 API，也是数据库的唯一访问入口。
- `apps/agent`：FastAPI Agent 服务，后续承载模型、检索和工作流执行。
- `packages/shared`：前端与 NestJS 共用的 TypeScript 契约。
- `docs`：架构边界和协作约定。

## 环境要求

- Node.js 22+
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
- Agent：`AGENT_PORT`、`BACKEND_ORIGIN`

Backend 与 Agent 共用根目录 `.env`，因此分别使用 `PORT` 和 `AGENT_PORT`，避免端口配置互相覆盖。

停止数据库但保留数据：`docker compose down`。只有明确需要清空本地数据库时才执行 `docker compose down -v`。

## 验证

```powershell
pnpm typecheck
pnpm build
pnpm test
docker compose config --quiet
```

开发前请先阅读 [架构与协作约定](docs/architecture.md)。真实密钥和本地 `.env` 不得提交到仓库。
