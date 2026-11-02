# Week2 公开聊天异常联调本机验收记录

日期：2026-11-02（北京时间）

## 基线与范围

- 实际检出：`integration/week2-rag-auth-agent@056462a6ead6f2c59851374ce76749bdb1f73330`；测试前以 `git diff --quiet df80ac9 HEAD` 确认文件内容与指定 `main@df80ac9` 一致。
- 环境：本机隔离数据库 `minicoze_rag_integration`，合成餐费资料、READY 文档、单库 Agent；测试服务端口 NestJS 3012、Runtime 8012，代理端口 3122、8122、9122。
- 入口：登录后的真实 `POST /api/conversations/:id/messages/stream`；随后通过真实 `GET /api/conversations/:id/messages` 核对落库。
- 仅运行 E03 Embedding 503 与 E02 运行中移除绑定。未运行 Week3、浏览器手动操作、取消或其他异常场景。
- 业务代码未改；验收执行时，代理与脚本仅在本地工作区运行。记录不含密码、Cookie、服务凭证或知识正文。

## E03：Embedding 服务返回 503 — 通过

- 首次尝试停在故障注入前的资料预检超时；当时代理统计为 Embedding 拦截 0 次、检索 0 次，未计为验收。延长预检等待并增加阶段提示后重试。
- 会话 ID：`8176eb81-5d3f-42af-9a56-6a0cd55be84f`；Run ID：`9a498a47-0c07-4b51-a164-5e5e96165275`。
- 代理只对 1 次 `POST /internal/knowledge/embeddings` 返回 503。NestJS 检索返回 503；后端日志为 `Embedding 服务不可用`。
- Runtime 事件：`run.started → run.failed(KNOWLEDGE_UNAVAILABLE)`。
- 公开 SSE：`run.started → run.failed(MODEL_ERROR)`；无 `knowledge.result`、`run.completed`。
- 助手消息状态 `failed`、正文为空。脚本返回 `PASS`，并确认代理恢复透传。

## E02：运行中移除 Agent 知识库绑定 — 通过

- 会话 ID：`9c366883-9105-4be5-b293-489c4ea98834`；Run ID：`1746fbb5-0788-4085-866b-6c7c3d24f11d`。
- 单库 Agent ID：`cmvysrvp900008osc6p52yp90`；餐费知识库 ID：`698a2784-eacc-452b-8d15-274781dff472`。
- 资料预检真实检索 `HIT`。代理暂停本轮 `POST /internal/knowledge/retrieval` 时已观察到 `run.started`；脚本通过管理 API 清空绑定并读取确认后释放原检索请求。
- NestJS 检索返回 403；Embedding 故障注入次数 0。
- Runtime 事件：`run.started → run.failed(KNOWLEDGE_FORBIDDEN)`。
- 公开 SSE：`run.started → run.failed(MODEL_ERROR)`；无 `knowledge.result`、`run.completed`。
- 助手消息状态 `failed`、正文为空。脚本在 `finally` 中恢复原绑定并读取确认；独立查询代理状态为默认透传、无挂起请求、检索次数 1、最终检索状态 403。

## 判定与交接

以上是本机隔离环境的真实公开聊天 API 验收，不推断其他成员环境或浏览器入口已通过。Runtime 负责人需确认内部 `KNOWLEDGE_UNAVAILABLE` / `KNOWLEDGE_FORBIDDEN` 及事件顺序；Chat 负责人需确认两种内部失败对外投影为 `MODEL_ERROR`、助手消息保存为 `failed` 的口径。知识库侧确认两种检索 HTTP 状态分别为 503 / 403。

测试产生的失败会话保留在隔离数据库作为证据。未触发付费模型调用：两条路径均在模型调用前以 `run.failed` 结束。
