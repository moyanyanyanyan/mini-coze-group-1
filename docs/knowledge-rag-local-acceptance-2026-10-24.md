# 知识库 RAG 本地验收记录（2026-10-24）

## 验证范围

在本机演示工作空间 `ws-local-demo` 验证合成文本录入、异步处理至 `READY`、切片、Embedding 与 pgvector 入库、命中检索及空库的确定性未命中。使用仓库内 `docs/fixtures/rag-reimbursement-sample.txt`，不涉及真实公司资料。

## 环境与运行命令

- PostgreSQL：Docker Compose 中的 `pgvector/pgvector:pg17`，本机端口 `5433`；检查时容器为 healthy。
- NestJS：在仓库根目录运行 `pnpm dev:backend`，本机端口 `3000`。
- Embedding：本机已缓存 `BAAI/bge-small-zh-v1.5` 的固定版本。普通启动首次因 Hugging Face HTTPS 证书校验失败，使接口返回 503；本次使用离线缓存模式启动，未修改仓库配置：

```powershell
Set-Location apps/agent
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
& '..\..\.venv\Scripts\python.exe' -m app.main
```

启动后，在仓库根目录运行：

```powershell
pnpm --filter @minicoze/backend exec ts-node scripts/seed-rag-demo.ts
pnpm --filter @minicoze/backend exec ts-node scripts/retrieval-smoke.ts eae7e5da-540b-4e7b-b775-228a3125c629 '工作日午餐报销上限是多少？' HIT
pnpm --filter @minicoze/backend exec ts-node scripts/retrieval-smoke.ts c6304f30-a75a-4d50-b0ca-29a73e648743 '工作日午餐报销上限是多少？' NO_HIT
```

## 实际结果

| 项目 | 本机结果 |
| --- | --- |
| Workspace ID | `ws-local-demo`（仅开发演示） |
| 命中库 ID | `eae7e5da-540b-4e7b-b775-228a3125c629` |
| 空库 ID | `c6304f30-a75a-4d50-b0ca-29a73e648743` |
| 文档 ID | `5070d9c9-16a4-4200-9e94-2a12ecdfa1d7` |
| 切片数 | 1；文档达到 `READY` |
| 切片 ID | `16ffa99a-2db5-43a7-bbdf-9ded80a946ad` |
| 命中查询 | “工作日午餐报销上限是多少？” → `HIT`，1 条 |
| 命中来源 | 《合成餐费报销规则》；内容包含“工作日午餐报销上限为每人每天 40 元” |
| 命中 score | `0.7262090174902657` |
| 空库查询 | 同一问题 → `NO_HIT`，`hits: []` |

样例脚本和两次检索脚本均以退出码 0 结束。上述 ID 由当前本机数据库生成，其他环境需重新运行种子脚本获取自己的 ID。

## 本次未覆盖

脚本直接使用本地预览接口或检索核心，**没有**验收 `POST /internal/knowledge/retrieval` 的服务凭证、Agent 绑定复核、用户 Workspace 权限或 Runtime Provider 转换。当前内部入口的授权仍默认拒绝；这部分要在 Agent/Auth/Workspace 契约接入后另做联调。空库 `NO_HIT` 是确定性用例；无分数阈值时，随意提问一个无关问题不保证 `NO_HIT`。
