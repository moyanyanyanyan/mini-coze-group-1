# Agent 聊天 × 知识库 RAG 本地联调（2026-10-28）

## 环境与范围

- 集成分支代码起点：`2b585bf`；使用独立本地数据库 `minicoze_rag_integration`，PostgreSQL 映射端口 5433。
- 本机 NestJS `http://localhost:3000`、Runtime `http://localhost:8000`、Vite `http://localhost:5173` 健康检查或 HTTP 请求成功。
- 模型：`deepseek-ai/DeepSeek-V4.1-Flash`，本次调用走本机 `.env` 中的硅基流动配置；不记录个人 API Key。
- 合成资料由 `seed-rag-integration.ts` 通过真实 Auth、Agent、Knowledge 接口创建并索引。测试账号为 `rag-chat-integration-20261028@example.test`，密码只在本地执行环境中提供，不写入仓库。

## 本次实际资源

| 项目 | ID |
| --- | --- |
| actorId / workspaceId | `1a79fec0-bde2-45df-bc08-f290012c9238` |
| 餐费、住宿、空知识库 | `8b844089-7764-46ec-b2a7-38b13c612e3b`、`c9717eb6-3a33-4e01-a90d-6070a5ea2f90`、`1ad7ca4d-8b55-4445-a82a-6685e49e43e4` |
| 单库、双库、空库 Agent | `cmvrdw99q00008o5khtusvmi9`、`cmvrdw9de00048o5kmlun39ml`、`cmvrdw9bo00028o5kwzf2e8zj` |

这些 ID 仅对本机这套测试数据库有效。换库后重新运行数据准备脚本。

## 验收结果

用 `apps/backend/scripts/verify-chat-integration.mjs` 登录测试用户，经公开 NestJS `POST /api/conversations/:id/messages/stream` 发消息。脚本检查 SSE 事件序号连续、唯一终态、`knowledge.result` 只包含 `status/citations`、文本增量拼接等于终态正文，并经消息读取接口核对回复已保存。

| 场景 | runId | 结果 |
| --- | --- | --- |
| 单库餐费 | `3c65fee5-4ce9-4ac8-9fb4-c7b35acec5b6` | `matched`，餐费来源 1 条；回答工作日午餐每天 40 元；24 个 SSE 事件 |
| 双库餐费＋住宿 | `c1a262bd-d810-478a-9094-77981aeb6660` | `matched`，住宿、餐费来源各 1 条；回答住宿每晚 300 元、午餐每天 40 元；37 个事件 |
| 空库 | `11b0b591-9647-4f71-b47d-abb99a701774` | `no_match`，来源 0 条；正常完成并保存；12 个事件 |

三条均使用真实本地 NestJS、数据库、Runtime、Embedding 和模型网关。2026-10-28 用户又在浏览器手动操作单库、多库、空库三个场景，反馈均正常；此项为用户目视验收，未另存浏览器 Network 原始报文或截图。模型回答只证明本次样本，不保证任意问法或网关长期稳定。

本次可认定聊天入口到 RAG 的上述三种场景已联调通过。未在这条浏览器链路重测未绑定 403、停用/解绑、依赖失败和取消/断流；这些场景的既有模块或 Runtime 验收仍按各自记录，不扩大为本次浏览器验收结论。

## 复跑方式

启动本地 PostgreSQL、NestJS、Runtime 和前端，确保后端连接独立测试库；先运行 `docs/rag-integration-fixture.md` 中的数据准备脚本，取得本机真实 Agent ID。设置 `RAG_TEST_EMAIL`、`RAG_TEST_PASSWORD`，再执行：

```powershell
node apps/backend/scripts/verify-chat-integration.mjs <agentId> '工作日午餐报销上限是多少？' matched 1
```

手动页面入口：`/workspace/agents/create` 可查看或修改 Agent 模型及知识库绑定；`/workspace/chat` 可选择 Agent 发消息。旧 Agent 的 `model` 是已保存值，修改默认模型不会自动改写它。
