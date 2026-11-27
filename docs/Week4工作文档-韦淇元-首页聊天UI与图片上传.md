# 首页、聊天 UI 与图片上传 · 韦淇元

| 项 | 内容 |
|---|---|
| 个人分支 | `feature/weiqiyuan/login-backend` |
| 本轮提交 | `64f5fcc` 聊天页改版 / `e552b02` 首页视觉与品牌 / `b17880a` 聊天交互 / `9e174e4` 已知 bug 修复 |
| 覆盖任务 | 任务 1–4 已完成，任务 5–6（图片上传与对接）未开始 |
| 验证环境 | Windows 11 + Chrome + NestJS(3000) + Agent(FastAPI, 8000) + Postgres/pgvector(5433) |

## 完成内容

这轮把首页和聊天页从「能跑通」推到「可交付」：首页统一了品牌与视觉、聊天页重构成「历史会话 + 会话区」双栏、模型输出改为 Markdown 渲染、流式过程中的排版 / 滚动 / 状态做了系统性修复。

### 一、首页布局与视觉（任务 1）

- **品牌统一为「织跃」**：新增 `shared/brand.ts`（名称、标语「把想法织成行动」）、`shared/ui/BrandMark.tsx`、`public/favicon.svg`，同步 `index.html`、README、侧栏、登录页、工作区页脚。
- **首屏重构**：`features/landing/LandingPage.tsx` + `landing.css`，从「模块罗列」改成「一句主张 + 主 CTA + 产品示意」：
  - 主标题「把你的想法，变成真正会做事的智能体。」
  - 两个主要入口：**进入工作台**（主）/ **体验智能对话**（次）
  - 右侧工作台示意：会话气泡、知识库已连接、工作流运行中三张浮层卡片
- **主要操作入口收敛**：顶部导航只留「能力 / 方法 / 开始」，右侧「登录」+「免费开始」，避免首屏出现第二个同样重量的按钮。
- **新增 `features/landing/LandingMotion.tsx`**：canvas 粒子 + 光标跟随 + `[data-reveal]` 进场，且做了两层降级——`prefers-reduced-motion` 直接跳过动画、粗指针设备（触屏）不跟随光标。

### 二、聊天页布局与交互（任务 2）

结构从「单栏居中」改成「左侧历史 + 右侧会话」：

```text
┌──────────┬────────────────────────────────┐
│ 历史对话  │ 会话标题 / 当前智能体 / 状态徽章 │
│ + 搜索    ├────────────────────────────────┤
│ 会话列表  │ 消息区（Markdown 渲染、自动跟随） │
│          ├────────────────────────────────┤
│          │ 输入区（自适应高度、停止生成）    │
└──────────┴────────────────────────────────┘
```

- **历史会话**（`components/ConversationList.tsx`）：切换 / 新建 / 删除、关键词搜索、显示所属智能体、今天显示时间、昨天显示「昨天」、更早显示月/日。
- **新建不立刻落库**：只把 `conversationId` 置空，等第一条消息发出时才调 `POST /api/conversations`，避免库里堆一串空的「新对话」。
- **深链**：支持 `/workspace/chat?conversation=<id>` 直接打开某个会话。
- **顶部状态**：会话标题（超长省略）、当前智能体、状态徽章「正在生成 / 准备就绪」。
- **输入区**（`components/MessageComposer.tsx`）：
  - textarea 随内容自适应高度（上限 132px，超出内部滚动）；
  - Enter 发送 / Shift+Enter 换行，且**判断 `isComposing`**——中文输入法选词按 Enter 不会误发；
  - 4000 字上限，超过 3200 字显示计数。
- **交互反馈**：生成中显示「停止生成」；失败提示放到输入框上方；助手消息完成后可「复制回答」；底部固定免责声明「AI 生成内容可能不准确，请核对重要信息」。

### 三、Markdown 解析（任务 3）

- 接入 `react-markdown` + `remark-gfm`，新增 `components/MarkdownMessage.tsx`。
- 覆盖：标题、有序/无序列表（含嵌套）、引用、行内代码、**代码块**（独立横向滚动，不撑破气泡）、**表格**、链接、分割线、图片、删除线。
- **安全约定**：
  1. 不加载 `rehype-raw`——模型输出里的 HTML 一律按纯文本处理，避免 XSS；
  2. 链接强制 `target="_blank" rel="noreferrer noopener"`。
- **与流式共存**：渲染器要能容忍「半截语法」（```` ``` ```` 未闭合、`**` 只来一半），所以上层做了 rAF 批量刷新，避免每个字符都全量重解析。

### 四、流式排版、滚动与生成状态（任务 4）

这是改动最集中的一块，原来有三个体验问题：

| 原问题 | 原因 | 现在的做法 |
|---|---|---|
| 打字卡顿 | 每个 delta（1–3 个字）一次 `setState` + 整个消息数组 `map` | 增量先进 `ref` 缓冲，`requestAnimationFrame` 每帧只刷一次 |
| 往上翻历史会被拽回底部 | 每次消息变化都无条件 `scrollIntoView` | 记录「是否贴底」（阈值 120px），只有贴底才自动跟随 |
| 停止/失败状态混乱 | 收尾统一按「有内容=完成」判断 | 状态机 `pending / running / completed / failed / cancelled`；主动停止 = `cancelled`，与后端一致 |

其他配套：

- **以服务端全量为准**：`run.completed` 带回完整 `content`，用它覆盖本地拼接结果，避免网络抖动丢 delta。
- **失败可见**：空内容且 `failed` 时显示「生成失败，可以重新发送」，不再永远转圈。
- **滚动条隐藏**：`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`，滚轮 / 触屏 / 键盘仍可滚动。
- **离开页面即中断**：组件卸载时 `AbortController.abort()`，后端会收到 `res.close` 并一路 abort 到 Runtime，不会挂到超时。

### 五、图片上传（任务 5–6，未开始）

计划和依赖已明确，但代码尚未落地：

- 前端：图片选择（`<input type="file" accept="image/*">` / 拖拽 / 粘贴）、缩略图预览、单张移除、上传中状态、失败重试、发送前校验（大小 / 类型 / 张数）。
- 契约：需要和王一恒确认「消息里图片怎么表达」——是 `content` 里放 Markdown 图片，还是 `messages` 增加多模态 `image_url` 段（见下文「对外接口 · 图片输入草案」）。
- 展示：连续对话与历史消息里图片的稳定展示（需要存储与鉴权，不能直接用本地 blob URL）。

## 代码说明

### 提交拆分

| 提交 | 内容 |
|---|---|
| `64f5fcc` | 聊天页改版：历史会话栏 + Markdown 渲染 + 流式体验修复 |
| `e552b02` | 首页视觉重构 + 品牌统一（织跃） |
| `b17880a` | 聊天交互细化：搜索、深链、状态徽章、复制回答、输入区自适应 |
| `9e174e4` | 已知 bug：模型调用强制 IPv4、路由精确匹配、Windows 下 fixture 编码、Vite 监听崩溃 |

### 主要改动位置

```text
apps/web/src
├─ app/types.ts                          # IconName 增加 plus / trash
├─ features/agent-chat/
│  ├─ AgentChatPage.tsx                  # 双栏布局、会话切换、流式状态、rAF 批处理
│  ├─ agent-chat.module.css              # 历史栏 / Markdown / 消息动作 / 输入区
│  ├─ components/ChatBubble.tsx          # 状态区分、Markdown 渲染、复制回答
│  ├─ components/ConversationList.tsx    # 历史会话（新增）
│  ├─ components/MarkdownMessage.tsx     # Markdown 渲染器（新增）
│  └─ components/MessageComposer.tsx     # 自适应高度、IME 保护、字数上限
├─ features/landing/
│  ├─ LandingPage.tsx / landing.css      # 首屏重构
│  └─ LandingMotion.tsx                  # 粒子 / 进场动画（新增）
├─ shared/brand.ts / shared/ui/BrandMark.tsx   # 品牌（新增）
└─ shared/ui/Icon.tsx                    # 新增 plus / trash 图标
```

### 三个关键设计

1. **历史会话不预建**：空会话只在发消息时创建，列表天然干净；标题由后端按首句前 20 字生成，首轮结束后刷新列表。
2. **渲染与状态解耦**：`status` 决定气泡形态（转圈 / 正文 / 失败 / 已停止），`content` 只决定内容，不再用「内容为空」推断是否在生成（这是原来失败气泡永远转圈的根因）。
3. **性能优先的流式**：delta 合并到帧级，Markdown 每帧最多重解析一次；最终仍以服务端全量为准。

## 对外接口

### 1. 流式事件（前端唯一入口）

`POST /api/conversations/:id/messages/stream`，`Content-Type: text/event-stream`，鉴权走 HttpOnly Cookie。

| 事件 | 时机 | data 关键字段 |
|---|---|---|
| `run.started` | 开轮 | `assistantMessageId` |
| `message.delta` | 增量 | `content` |
| `knowledge.result` | 检索完成 | `status`、`citations[]` |
| `run.completed` | 正常结束 | `content`（全量）、`finishReason`、`usage` |
| `run.failed` | 失败 | `code`、`message`、`retryable` |

一帧原始示例：

```text
id: 3
event: message.delta
data: {"runId":"cbde342a-...","conversationId":"1f915635-...","seq":3,"timestamp":"2026-11-15T08:46:26.926Z","type":"message.delta","data":{"content":"你"}}
```

### 2. 会话 REST

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/conversations` | 建会话，body `{ agentId }` |
| GET | `/api/conversations` | 我的会话，按 `updatedAt` 倒序 |
| DELETE | `/api/conversations/:id` | 删除，返回 204 |
| GET | `/api/conversations/:id/messages` | 历史消息 |
| POST | `/api/conversations/:id/messages` | 非流式兜底 |
| POST | `/api/conversations/:id/messages/stream` | 流式（页面默认走这条） |

### 3. Markdown 内容约定

- 助手消息的 `content` 是 **Markdown 源码**，不是 HTML；
- 前端渲染默认**不解析 HTML**，因此模型输出里的标签会原样显示（安全边界）；
- 流式过程中 `content` 可能是不完整语法，渲染器必须容忍。

### 4. 图片输入草案（待与王一恒确认）

> 前置结论：已实测当前模型 **`deepseek-ai/DeepSeek-V4.1-Flash` 支持 `image_url` 输入**（发一张 48×48 纯红 PNG，返回「红色」），因此不需要为此换模型；限制都在应用层契约。

```jsonc
// 方案 A（改动小，建议二期先用）
{ "content": "![图片](https://cdn.example.com/u1/a.png)", "attachments": [{ "type": "image", "url": "..." }] }

// 方案 B（多模态，需要 Runtime 与模型都支持）
{ "messages": [{ "role": "user", "content": [
  { "type": "text", "text": "这张图里是什么" },
  { "type": "image_url", "image_url": { "url": "..." } }
] }] }
```

## 验证

### 自动化

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `pnpm --filter @minicoze/web typecheck` | 通过 |
| 前端单测 | `pnpm --filter @minicoze/web test` | 3 passed（含路由精确匹配用例） |
| Agent 单测 | `pnpm test:agent` | 99 passed |
| 生产构建 | `pnpm --filter @minicoze/web build` | 通过（JS 730 KB / gzip 230 KB，CSS 104 KB） |

### 手工用例

| 场景 | 预期 | 结果 |
|---|---|---|
| 发送消息 | 气泡立即出现，逐字流出 | ✅ |
| Markdown | 标题/列表/代码块/表格正确渲染，无 `##`、`**` | ✅ |
| 超长回答 | 贴底时自动跟随，上翻后不被拽回 | ✅ |
| 停止生成 | 断开 SSE 后落库状态为 `cancelled`，保留已生成的部分内容 | ✅（实测：`status=cancelled`，内容 20 字） |
| 生成失败 | 显示失败提示，可重新发送 | ✅ |
| 新建会话 | 列表不出现空会话，首条消息后才出现 | ✅ |
| 切换会话 | 历史消息正确加载，标题同步 | ✅ |
| 搜索会话 | 关键词过滤，清空恢复 | ✅ |
| 深链 | `?conversation=<id>` 直达 | ✅ |
| 刷新页面 | 消息、会话、状态一致 | ✅ |

### 截图

首页和聊天页的截图未随本文档入库。

### 已知问题 / 后续

1. **代码块复制**：目前是「复制整条回答」，任务 3 要求的按代码块复制还没做（需要在 `MarkdownMessage` 里给 `pre` 包一层复制按钮）。
2. **包体**：当前 JS 730 KB（gzip 230 KB），Markdown 渲染依赖占了一部分；可把渲染器改成 `React.lazy` 按需加载，或做 `manualChunks` 拆包。
3. **流式稳定性**（后端侧欠账，不在本轮范围）：后端不向浏览器转发心跳、错误码被统一压成 `MODEL_ERROR`、SSE 断线不能续传。
4. **图片上传**：任务 5–6 未开始，先定契约再写前端，避免返工。
