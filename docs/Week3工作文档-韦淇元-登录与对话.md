# Week 3 工作文档 — 韦淇元（MiniCoze ｜ 登录与对话）

> **周期**：2026-10-27 ~ 2026-10-31（Week 3） ｜ **数据截止**：2026-10-29 23:40
> **个人分支**：`feature/weiqiyuan/login-backend` ｜ **集成分支**：`integration/week2-rag-auth-agent`
> **分工范围**：认证与用户（A）/ 会话与历史（B）/ 流式对话（C）/ ~~发布与公开 API（D，组内核准已砍）~~ / 契约对齐（E）
> **本周一句话**：把「会话与消息 + 流式对话」整条链路从 0 做到**跑真模型**——B1~B4 全通、C1~C7 全部落地并端到端实测，与王一恒的 Runtime 完成真实联调（真 DeepSeek 模型，非 Mock）。
> **范围变更**：D 模块（API Key / 公开流式接口 / SDK）经组内核准**砍掉**；本人剩余唯一未完成功能 = **A7 Google OAuth**。

---

## 一、本周目标与完成情况

| # | 本周目标 | 状态 | 说明 |
|---|---|---|---|
| 1 | B 模块收尾验收（会话表 / 会话接口 / 消息接口 / 聊天页） | ✅ 完成 | B1~B4 全部实测通过 |
| 2 | C 模块流式对话链路全量落地（C1~C7） | ✅ 完成 | 含并发控制、取消、断流、心跳 |
| 3 | 与王一恒 Agent Runtime 真实联调 | ✅ 完成 | 3000 → 8001 → DeepSeek，输出真流 |
| 4 | 与陈弘毅 Agent 模块预留接缝（Agent 配置来源） | ✅ 完成 | `resolveAgentConfig()` 已就位，集成线由对方改成 `getAgentConfig()` |
| 5 | e2e 测试全绿 | ✅ 完成 | 2 suites / 8 tests 通过，耗时 8.3s → 2.6s |
| 6 | 同步集成分支 + 提交个人分支 | ✅ 完成 | 主提交 `c9e3f0a`（26 文件，+2221/-41） |
| 7 | 浏览器端「取消 / 断流 / 失败」三场景验收 | ⏳ 未完成 | 代码已齐，缺实测（下周首要） |
| 8 | D 模块（API Key / 公开流式接口） | ⏹ 已砍 | 组内核准，本周期不再做，从分工范围移除 |
| 9 | A7 Google OAuth | ⏸ 未开始 | 当前唯一剩余缺口（原砍需求第 1 顺位，现保留待做） |

### 模块进度总表（本周结束状态）

| 模块 | 内容 | 状态 |
|---|---|---|
| A1~A6 | 注册 / 登录 / bcrypt / JWT / HttpOnly Cookie / 退出 / `/auth/me` | ✅ 全部完成（Week 2 交付，本周沿用无回归） |
| A7 | Google OAuth | ⏸ 未开始（当前唯一剩余缺口） |
| B1 | Conversation / Message 表 + 迁移 | ✅ |
| B2 | 会话接口（`POST/GET/DELETE /api/conversations`） | ✅ |
| B3 | 消息接口（`GET/POST /api/conversations/:id/messages`） | ✅ |
| B4 | 网页聊天页（流式渲染） | ✅ 流式部分完成；左侧会话列表 / 新建·删除 / 高亮为刻意留口子 |
| C1 | RuntimeClientService（SSE 解析） | ✅ |
| C2 | ChatService（编排 + 落库 + 持久化铁律） | ✅ |
| C3 | 网页流式接口 `POST /:id/messages/stream` | ✅ |
| C4 | 取消 / 断流（abort → cancelled 落库） | ✅ 代码完成，待实测 |
| C5 | 并发控制（同会话 409 `CONVERSATION_BUSY`） | ✅ |
| C6 | 前端 SSE 消费（打字机 + 停止按钮） | ✅ |
| C7 | 本地 Mock Runtime | ✅（已完成历史使命，真链路稳定后可退役） |
| D1~D6 | API 渠道 / API Key / 公开流式接口 / SDK | ⏹ **组内核准砍掉**，不再排期 |
| E1~E5 | 契约与联调文档 | ✅ 持续维护 |

---

## 二、本周完成内容

### 1. B 模块：会话与消息（收尾 + 验收，10-27）

- **数据表**：`Conversation`（userId / agentId? / title 默认「新对话」/ `@@index([userId,updatedAt])`）、`Message`（role / status 用 String、seq、`@@index([conversationId,seq])`），迁移 `20261023161823_add_conversation_and_message` 已应用。
- **接口全部落地**（均挂 `AuthGuard('jwt')` + `@CurrentUser()`）：
  - `POST /api/conversations`、`GET /api/conversations`、`DELETE /api/conversations/:id`
  - `GET /api/conversations/:id/messages`（按 `seq asc`）、`POST /api/conversations/:id/messages`（非流式，保留备用）
- **实现要点**：
  - 所有查询带 `userId`，`assertOwned` 查不到统一 404（防会话探测）。
  - 发消息用 `$transaction` 同写 user + assistant 两条，`seq = last+1 / last+2`。
  - 首条消息自动把会话标题改为用户第一句话前 20 字。
- **验收**：注册 → 建会话 → 发消息 → 拉历史 → 标题自动更新，中文入库正常。

### 2. C 模块：流式对话链路（10-27 集中落地，10-28 联调验证）

按 **C7 → C1 → C2 → C3 → C6 → C5 → C4** 顺序推进，七个模块全部落盘：

| 子模块 | 文件 | 关键实现 |
|---|---|---|
| C7 Mock Runtime | `apps/backend/scripts/mock-runtime.mjs`（155 行） | 零依赖纯 JS；内嵌王一恒 `schemas.py` 同款校验（history 偶数 / 严格交替 / id 唯一 / 不含本轮）；`MOCK_BYTE_SPLIT=1` 按字节切帧复现**汉字切半**；`MOCK_HEARTBEAT=1` 插心跳；消息含「失败」走 `run.failed` |
| C1 RuntimeClient | `src/chat/runtime-client.service.ts`（212 行） | `TextDecoder` 带 `stream:true` 增量解码；buffer 定义在 while 外；`line.startsWith(':')` 同时吃掉 `ping` 与 `heartbeat`；错误码取响应头 `X-Runtime-Error-Code` |
| C2 ChatService | `src/chat/chat.service.ts`（293 行） | assertOwned → `$transaction` 落 user(completed)+assistant(pending) → buildHistory → 组请求 → 消费流 → **持久化成功才转发 `run.completed`**；`buildHistory` 只收完整 user→assistant 对，切片 -20；`resolveAgentConfig()` = 陈弘毅接缝 |
| C3 流式接口 | `src/chat/chat.controller.ts`（115 行） | `@Res()` 手写 SSE；`assertOwned` 排在 `writeHead` 之前；`INTERNAL_TO_OUTBOUND` 脱敏层把内部错误统一成对外 `MODEL_ERROR` |
| C4 取消/断流 | controller + service | `res.on('close') → AbortController.abort()`；service 判 `isAbort` → 落 `cancelled`；`buildHistory` 只收 `completed`，中断内容不进历史 |
| C5 并发控制 | error-codes / chat.service / chat.controller | 新增 `CONVERSATION_BUSY`；进程内 `busy = new Set()` + `acquire/release`；**在 `writeHead` 之前取锁**（generator 内部抛异常出不去 409）；多实例时换 Redis SETNX（已注释留口） |
| C6 前端消费 | `features/agent-chat/api/chat-api.ts`（175 行） | fetch + ReadableStream + `TextDecoder(stream:true)`；按 `\n\n` 切帧、跳过 `:` 注释行；乐观插 user+assistant → `onDelta` 增量拼 → `onCompleted` 全量覆盖；停止按钮 + `AbortController` |
| 前端页面 | `AgentChatPage.tsx`（188 行）+ css（258 行） | 打字机渲染、等待态跳动圆点、`streamingId !== null` 时禁用输入 |

### 3. 与王一恒 Runtime 的真实联调（10-28，本周最大成果）

- **环境准备**：用 `git worktree` 起独立目录 `D:\Desktop\mz-integration` 跑集成分支，避免在自己有未提交改动的工作区切分支；agent 侧用 Python **3.13.12**（系统 3.14 太新，无 wheel）建 venv，只装 `fastapi / uvicorn / pydantic-settings / httpx` 四件套（**禁止 `pip install -r requirements.txt`**，会拖 2GB 的 torch）。
- **端口**：Agent 8001（8000 被杀不掉的残留进程占着，临时绕开）、Backend 3000、Web 5173、Postgres 宿主 5433。
- **模型**：切到 SiliconFlow 的 `deepseek-ai/DeepSeek-V3.2`（组内暂用，DeepSeek 官方 key 未配置）。
- **全链路实测结果**：

  | 环节 | 结果 |
  |---|---|
  | 直连 Runtime（8001） | 200，`run.started` → 48 个 `message.delta` → `run.completed` |
  | 经 Backend（3000 → 8001） | 200，**50 个 delta / 7104 字节 / usage prompt 19 + completion 25**，中文完整，无 `run.failed` |
  | 经 Web（5173 → /api → 3000） | AI 正常出字，打字机效果正常 |

- **判别真假的判据（写进验收口径）**：usage token 数是真实统计（Mock 是编死的 16+17）、内容不含「【Mock Runtime】」、delta 粒度细（Mock 是每块 6 字）。

### 4. 工程质量

- **e2e 全绿**：修掉 `test/health.e2e-spec.ts` 里硬编码 `DATABASE_URL=...5432...`（本机真库在 5433 的 docker 容器），改为交给 `AppModule` 读根 `.env`。`Test Suites: 2 passed / Tests: 8 passed`，耗时 8.3s → 2.6s。
- **连接失败的显式化**：`runtime-client.service.ts` 给 `fetch` 包 try/catch，ECONNREFUSED / DNS / 超时时显式抛 `RuntimeCallError('RUNTIME_UNAVAILABLE')` 并 `logger.warn` 打印目标 URL 与原因；`AbortError` 原样 rethrow（保住 C4 的 cancelled 判定）。改之前这类故障会落到兜底分支，日志零线索。
- **Mock 默认端口对齐**：`mock-runtime.mjs` 默认 9999 → 8001，并加 `pnpm mock:runtime` 脚本。

### 5. 团队协作

- 主提交 `c9e3f0a`（2026-10-27）已推个人分支：B 模块全部 + C1~C7 + 前端聊天页 + shared 契约 + 两份个人文档，共 **26 文件 / +2221 / -41**。
- 集成分支 `integration/week2-rag-auth-agent` 已 fetch + pull 到 `c96866a`，带回陈弘毅 agents、朱曾亨 plugins、管逸恬 knowledge 等全组合入成果。
- **集成线对我方代码的改造**（下周合并时要注意）：`chat.service.ts` 的 `resolveAgentConfig()` 被换成 `agents.getAgentConfig(conversation.agentId, userId)`；`CreateConversationDto.agentId` 变必填；因此我本地两处未提交改动（`chat.service.ts` 的 `AGENT_MODEL` + `env.validation.ts`）在集成线零引用，**应丢弃**。
- 遵守团队规则：只 add 自己的源码路径（不 `git add -A`）；真实密钥只留在 `.env`（已被 `.gitignore` 忽略），`.env.example` 仅占位。

---

## 三、关键问题与解决（本周踩坑清单）

| # | 现象 | 根因 | 解决 |
|---|---|---|---|
| 1 | 页面上 AI 一直回「【Mock Runtime】…」 | **旧会话历史污染**：开发期入库的 mock 消息被当作上下文喂给模型，模型在模仿 | 删掉污染会话、新建会话验证；判据是查本轮 `history` 里有没有 mock 消息，而不是先怀疑有 mock 服务在跑 |
| 2 | 一度以为「两套后端抢 3000」 | 同端口确实有两个 node 实例、各自持一份 `process.env` | 杀掉多余实例只留一套；但最终证明不是根因（见 #1），排查时端口与历史都要验 |
| 3 | `pnpm test` 报 `Authentication failed against database server` | e2e 里硬编码 `DATABASE_URL` 指向 5432（本机原生 PostgreSQL），真库在 5433 docker | 删掉硬编码，交给 `.env`；**e2e 里一律不要手改 `process.env.DATABASE_URL`** |
| 4 | 聊天必失败，`run.failed` + `MODEL_ERROR` | `.env` 指向 8001，而 8001 上没服务 → fetch ECONNREFUSED 落到兜底分支 | 起 Runtime；并给 fetch 加显式错误分类 + 日志 |
| 5 | 起了 mock 却没生效 | mock 默认端口 9999，与 `.env` 的 8001 对不上 | 默认端口改 8001（可用 `MOCK_RUNTIME_PORT` 覆盖） |
| 6 | 判断 Runtime 在不在，看端口能连上不够 | 只有 `/health` 的旧桩也能连上 | 用 `GET /openapi.json` 看 `paths` 里有没有 `/internal/runtime/stream` |
| 7 | 模型报 `MODEL_AUTH_FAILED` | 手里的 key 是 **SiliconFlow** 的（51 位），不是 DeepSeek 官方（35 位） | 改 `DEEPSEEK_BASE_URL=https://api.siliconflow.cn/v1` + 对应 model id |
| 8 | 联调被 400 拦住 | 我方送 `model: 'deepseek-chat'`，该 id 在 SiliconFlow 不存在（集成线已由陈弘毅统一提供 model，此改动作废） | 集成分支改用 `getAgentConfig()` 拿 model |
| 9 | git：worktree 建成 detached HEAD | `git worktree add <path> origin/xxx` 收到带 remote 前缀的全名时不会自动建跟踪分支 | 一律写 `git worktree add -b <branch> <path> origin/<branch>`；已用 `git switch -c ... --track` 修复 |
| 10 | 想直接切到集成分支看代码，被拒 | 同一分支不能同时在两个工作树检出 | 用已有 worktree `fetch` + `pull --ff-only` 拉到最新 |

---

## 四、未完成事项与风险

| 事项 | 优先级 | 说明 |
|---|---|---|
| 浏览器端「取消 / 断流 / 失败」三场景实测 | **高** | 代码已齐（C4），但集成方明确没做过验收；下周必须补 |
| `buildHistory` 过滤历史 Mock 文案 | 中 | 已知产品级隐患：旧 mock 消息入库后会持续污染同会话上下文；mock 停用后暂不产生新污染，未动代码 |
| **A7 Google OAuth** | **高** | **当前唯一剩余功能缺口**。需要 Google Cloud 建 OAuth 应用拿 Client ID/Secret；国内网络访问需代理；回调后要按 `googleId` 或 email 与本地账号绑定，绑定/冲突规则需组内核准 |
| D 模块（API Key + 公开流式接口） | — | **已砍，不再排期**。原验收条「网页与公开 API 共用同一条 Runtime」的后半句随之取消，链路设计仍保留共用 `ChatService` 的结构（不额外返工） |
| 与陈弘毅的 `agentId` 契约 | 中 | 集成线已把 `agentId` 改为必填，我这边合入时要同步前端建会话逻辑 |
| 工作区临时文件 | 高 | `chat-cookies.txt`（含登录态 cookie）、`mock-fix-*.txt`、`start-out.txt` 未清理，提交前必须删除，**绝不 `git add -A`** |

---

## 五、下周计划（Week 4，11-03 ~ 11-07）

> D 模块已砍，工作量释放到 A7 与联调收尾上。

1. **A7 Google OAuth（最高优先级，唯一剩余功能缺口）**：
   - Google Cloud 建 OAuth 应用 → 拿 Client ID / Secret，只进 `.env`（`.env.example` 留占位）。
   - 后端：`GET /api/auth/google` 跳转授权 → `GET /api/auth/google/callback` 用 code 换 token → 按 `googleId` 优先、email 兜底查/建用户 → **签发自家同一套 JWT + 下发同一个 HttpOnly Cookie**（登录态与密码登录完全统一）。
   - 前端：登录页加「使用 Google 登录」按钮，回调页处理成功/失败跳转。
   - 风险：国内网络需代理；邮箱冲突（已有密码账号）的绑定规则需组内核准；卡壳则保留密码登录独立可用，不影响其他模块。
2. **补齐 C4 三场景验收**：浏览器实测 停止生成（cancelled）/ 关页面断流（cancelled）/ 模型报错（failed），并核对库中 `Message.status`。
3. **合入集成分支**：丢弃本地作废改动 → push 个人分支 → 开 PR 指向 `integration/week2-rag-auth-agent`；合入后跑 migrations（集成线含 pgvector 迁移）。
4. **B4 前端补口子**：左侧会话列表、新建 / 删除会话、当前会话高亮。
5. **安全加固**：`buildHistory` 过滤 Mock 文案；`env.validation.ts` 补齐 `JWT_SECRET` / `JWT_EXPIRES_IN` / OAuth 相关变量。
6. **文档**：本周工作文档 + 联调验收记录（含实测数据），发群。

---

## 六、验收证据（可复现命令）

```powershell
# 1) 起服务：Backend 3000 / Web 5173 / Agent Runtime 8001
cd apps\backend; pnpm start:dev
cd D:\Desktop\mz-integration\apps\agent; .venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001

# 2) 确认 Runtime 是真的（看 openapi 里有没有 stream 路由）
Invoke-WebRequest http://127.0.0.1:8001/openapi.json

# 3) 端到端：注册 → 建会话 → 流式发消息（期望 .stream-open → run.started → N*message.delta → run.completed）
#    POST /api/conversations               → 201
#    POST /api/conversations/:id/messages/stream → 200，逐帧 SSE

# 4) 数据库核对（容器名 mini-coze-group-1-postgres-1，宿主 5433，账号 minicoze 不是 postgres）
docker exec mini-coze-group-1-postgres-1 psql -U minicoze -d minicoze -f /tmp/q.sql

# 5) 测试
pnpm --filter @minicoze/backend test
```

**已记录的实测数据**（可写入验收表）：

| 指标 | 值 |
|---|---|
| 全链路响应体 | 7104 字节 |
| `message.delta` 帧数 | 50 |
| usage | prompt 19 / completion 25（真模型统计） |
| e2e | 2 suites / 8 tests passed，2.6s |
| C5 并发 | 同会话第二次请求 → 409 `CONVERSATION_BUSY` |

---

## 七、本周产出清单

**代码**（已在 `c9e3f0a`）

- 后端：`src/chat/{chat.controller,chat.service,chat.module,runtime-client.service}.ts`、`src/modules/conversations/**`、`scripts/mock-runtime.mjs`、`prisma/schema.prisma` + 迁移 `20261023161823`
- 前端：`src/features/agent-chat/**`（页面 / api / 两个组件 / css / manifest）、`src/shared/api/http.ts`
- 契约：`packages/shared/src/index.ts`（ConversationSummary / MessageRole / MessageStatus / ChatMessage / SendMessageResult）

**文档**

- `docs/接口契约-韦淇元-会话与消息.md`
- `docs/个人工作文档-韦淇元-登录用户对话与发布.md`（Week 2 延续）
- `docs/Week3工作文档-韦淇元-登录与对话.md`（本文）
- 沿用：`docs/联调契约-NestJS调用Runtime-请求示例与规则确认.md`（v1.1.1）、`docs/联调方案-韦淇元与王一恒-聊天流式链路.md`、`docs/模块清单-韦淇元-总览对照表.md`

**端口与环境变量口径**

| 项 | 值 |
|---|---|
| Web | 5173 |
| Backend | 3000 |
| Agent Runtime | 8000（标准）/ 8001（本机临时，绕开残留进程） |
| Postgres | 5433（docker override，宿主） |
| 关键变量 | `DATABASE_URL` / `JWT_SECRET` / `JWT_EXPIRES_IN` / `AGENT_SERVICE_URL` / `INTERNAL_SERVICE_TOKEN` / `WEB_ORIGIN` |
