# 联调契约 v1.1.1｜NestJS 调 Runtime：请求示例与规则确认

> 版本：**v1.1.1**（2026-10-18 韦淇元修订，已吸收王一恒 10.18 两轮反馈；相对 v1.0 的变更见第六节，相对 v1.1 的补充见「六之一」）
> 上游文档：《联调方案-韦淇元与王一恒-聊天流式链路.md》第三节（字段定义以那份为准，本文给示例和细则）
> 状态：v1.1 的 6 处修改 + v1.1.1 的 7 条补充均已落地；仍有 4 项待双方/组长拍板（见第七节）

---

## 一、NestJS → FastAPI 请求示例

### 1.1 端点与请求头

```
POST http://{AGENT_SERVICE_URL}/internal/runtime/stream     （SSE 流式，联调主路径）
POST http://{AGENT_SERVICE_URL}/internal/runtime/run        （聚合，一次返回；优先级后置）

Content-Type: application/json
Accept: text/event-stream        （stream 端点必带；run 端点用 application/json）
Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
```

- `AGENT_SERVICE_URL`：我方 `.env` 提供，本地联调 `http://localhost:8000`
- `INTERNAL_SERVICE_TOKEN`：静态 token 起步（待决策项 D2 / 组长拍板），两人 `.env` 同值；你侧校验失败返回 401，我方按「Runtime 不可用」处理

### 1.2 RuntimeRequest 完整示例（v1.1）

> v1.1.1：示例中的 ID 仅提升可读性，生产环境使用**完整 UUID**（见 2.2 代码），不要截短。

```json
{
  "runId": "run_550e8400-e29b-41d4-a716-446655440000",
  "actor": {
    "id": "usr_550e8400-e29b-41d4-a716-446655440000",
    "type": "user"
  },
  "conversationId": "conv_550e8400-e29b-41d4-a716-446655440000",
  "userMessageId": "msg_in_550e8400-e29b-41d4-a716-446655440000",
  "assistantMessageId": "msg_out_550e8400-e29b-41d4-a716-446655440000",
  "agentConfig": {
    "id": "agt_550e8400-e29b-41d4-a716-446655440000",
    "revision": 3,
    "name": "客服小助手",
    "systemPrompt": "你是XX产品的客服助手，回答基于知识库，语气友好。",
    "model": "deepseek-chat",
    "temperature": 0.7,
    "maxTokens": 2048,
    "knowledgeBaseIds": ["kb_01", "kb_02"],
    "pluginIds": ["plg_weather"]
  },
  "history": [
    { "role": "user",      "id": "msg_in_6ba7b810-9dad-11d1-80b4-00c04fd430c8",  "content": "退货流程是什么？" },
    { "role": "assistant", "id": "msg_out_6ba7b810-9dad-11d1-80b4-00c04fd430c8", "content": "请在收货后7天内……" }
  ],
  "message": "那运费谁承担？"
}
```

curl 自测（你侧 mock 我方时直接用）：

```bash
curl -N -X POST http://localhost:8000/internal/runtime/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
  -d @runtime-request-sample.json
```

### 1.3 四类字段怎么传入（v1.1 修正说明）

| 字段 | 谁生成/读取 | 传入规则 |
|---|---|---|
| **可信用户身份** `actor` | NestJS 校验 JWT（网页）或 API Key（公开 API）后解析 | `actor.id` **始终是我方用户表主键**：网页入口=登录用户 ID；公开 API 入口=**先由 API Key 反查出资源所有者用户 ID** 再传，**绝不传 Key ID 本身**（v1.1 修正）。`actor.type` 取 `user` / `api_key`，仅用于追踪，Runtime 不据此做权限判断 |
| **配置** `agentConfig` | NestJS 从数据库读 Agent 配置**快照**（含 revision） | 一次性传全，**你侧不回查任何数据库**（FastAPI 不连 Postgres 是全组架构约定）。`knowledgeBaseIds` / `pluginIds` 为空数组 = 不启用，走纯生成路径，不出空工具卡 |
| **历史** `history` | NestJS 查 Message 表 | 字段名统一为 **`{role, id, content}`**（v1.1 修正，v1.0 的 `messageId` 作废）。规则：① 最多 **20 条消息 = 10 个完整 user/assistant 对话对**；② 时间正序；③ **不含当前消息**（当前消息单独放 `message`）；④ 只保留**完整对话对**，孤立的 user 不入；⑤ **cancelled（已停止）与 failed 轮次一律不进下一轮 history**；⑥ 我方按 `contextLimit` 轮数先截断，你侧仍做最终模型上下文预算检查（不依赖条数/字符数） |
| **消息 ID** `runId` / `userMessageId` / `assistantMessageId` | NestJS 生成（UUID 前缀区分） | 三个 ID 建流前确定，你在**每个 SSE 事件信封里原样回填** `runId`（`userMessageId` 无需每条重复，仅 `run.started.data` 带 `assistantMessageId`）。你侧不生成任何 ID |

> **history 截断的显式保证**（对应你提的实现问题 ①）：我方在 `saveUserMessage` 之后再查历史时，会**显式排除本轮 `userMessageId` / `assistantMessageId`**，并只用 `status = completed` 的轮次，不靠 `findLast20Completed` 这个方法名做隐式保证。

---

## 二、NestJS 侧调用代码示例（v1.1.1）

### 2.1 RuntimeClientService（SSE 解析增强版）

v1.1 针对你提的实现问题 ③ 做了 4 处加固（v1.1.1 沿用）：**CRLF 兼容**、**多行 `data:` 拼接**、**注释心跳过滤**、**finally 释放 reader**。

```ts
// apps/backend/src/chat/runtime-client.service.ts
import { Injectable, Logger } from '@nestjs/common';

export interface RuntimeRequest {
  runId: string;
  actor: { id: string; type: 'user' | 'api_key' };
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  agentConfig: {
    id: string;
    revision: number;
    name: string;
    systemPrompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
    knowledgeBaseIds: string[];
    pluginIds: string[];
  };
  history: { role: 'user' | 'assistant'; id: string; content: string }[];
  message: string;
}

/** v1.1：信封为扁平字段 + 嵌套 data */
export interface ParsedSseEvent {
  runId: string;
  conversationId: string;
  seq: number;
  timestamp: string;
  type: string;                 // 与 SSE 的 event: 行一致
  data: Record<string, any>;    // 各事件的业务载荷
}

@Injectable()
export class RuntimeClientService {
  private readonly logger = new Logger(RuntimeClientService.name);
  private readonly baseUrl =
    process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000';
  private readonly internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? '';

  /**
   * 调用 /internal/runtime/stream，逐个 yield 解析后的 SSE 事件。
   * 调用方（ChatService）通过 AbortSignal 实现"停止生成"。
   */
  async *streamRun(
    req: RuntimeRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ParsedSseEvent> {
    const res = await fetch(`${this.baseUrl}/internal/runtime/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${this.internalToken}`,
      },
      body: JSON.stringify(req),
      signal, // 用户点"停止"时 abort，fetch 立即断连
    });

    if (!res.ok) {
      throw new Error(`runtime_stream_failed_${res.status}`);
    }
    if (!res.body) {
      throw new Error('runtime_stream_empty_body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 加固 1：同时支持 LF 与 CRLF 分块边界
        let idx: number;
        while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2));
          const parsed = this.parseBlock(block);
          if (parsed) yield parsed;
        }
      }
    } finally {
      // 加固 2：无论正常结束 / 异常 / 被 abort，都释放上游资源
      reader.cancel().catch(() => void 0);
      reader.releaseLock?.();
    }
  }

  /**
   * 解析单个 SSE 块。
   * 加固 3：忽略 : 开头的注释行（心跳），不占 seq
   * 加固 4：多行 data: 用 \n 拼接（不是覆盖）
   */
  private parseBlock(block: string): ParsedSseEvent | null {
    let event = 'message';
    const dataLines: string[] = [];
    let isComment = false;

    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith(':')) { isComment = true; continue; } // 心跳
      if (rawLine.startsWith('event:')) { event = rawLine.slice(6).trim(); continue; }
      if (rawLine.startsWith('data:')) { dataLines.push(rawLine.slice(5).trim()); continue; }
      // id: / retry: 等字段当前忽略
    }
    if (isComment || dataLines.length === 0) return null;

    const payload = JSON.parse(dataLines.join('\n'));
    return {
      runId: payload.runId,
      conversationId: payload.conversationId,
      seq: payload.seq,
      timestamp: payload.timestamp,
      type: payload.type ?? event,
      data: payload.data ?? {},
    };
  }
}
```

### 2.2 ChatService 装配段（v1.1.1）

```ts
// apps/backend/src/chat/chat.service.ts（关键片段）
import { randomUUID } from 'node:crypto';

async startStream(agentId: string, conversationId: string, message: string, actor: CurrentUser) {
  // 1. 生成三个 ID（建流前确定，传给 Runtime，要求原样回填；生产环境使用完整 UUID，不截短）
  const runId = `run_${randomUUID()}`;
  const userMessageId = `msg_in_${randomUUID()}`;
  const assistantMessageId = `msg_out_${randomUUID()}`;

  // 2. 用户消息先落库（先存后调，防止 Runtime 挂了丢消息）
  await this.messageRepo.saveUserMessage(conversationId, userMessageId, message);

  // 3. 读配置快照 + 历史
  //    v1.1：显式排除本轮两个 messageId，只取 completed 轮次，
  //    再按 contextLimit 轮数截断，最后受 20 条 / 10 对话对交集约束
  const agentConfig = await this.agentConfigRepo.getSnapshot(agentId);
  const history = await this.messageRepo.buildHistory(conversationId, {
    excludeMessageIds: [userMessageId, assistantMessageId],
    onlyStatus: 'completed',        // cancelled / failed 轮次不进 history
    maxMessages: 20,                 // 10 个完整对话对
    maxTurns: agentConfig.contextLimit ?? 10,
  });

  // 4. 组装 RuntimeRequest
  const req: RuntimeRequest = {
    runId,
    actor: { id: actor.userId, type: actor.type }, // v1.1：userId 而非 keyId
    conversationId,
    userMessageId,
    assistantMessageId,
    agentConfig,
    history,
    message,
  };

  // 5. 助手消息占位为 running，然后开始消费 SSE
  await this.messageRepo.markRunning(assistantMessageId);
  const controller = new AbortController(); // 绑定到"停止"按钮

  try {
    for await (const evt of this.runtimeClient.streamRun(req, controller.signal)) {
      // v1.1.1 关键修正：run.completed 必须先保存成功再转发，其他事件随到随转
      if (evt.type === 'run.completed') {
        const result = evt.data;
        // 校验：content 必须等于全部 delta 拼接（可选但强烈建议）
        await this.messageRepo.saveAssistantMessage(assistantMessageId, {
          status: 'completed',
          content: result.content,
          citations: result.citations,
          toolResults: result.toolResults,
          finishReason: result.finishReason,
          usage: result.usage,
        });
        this.forwardToClient(conversationId, evt);
      } else if (evt.type === 'run.failed') {
        // 失败也落库，保留 partial 并记录失败原因
        await this.messageRepo.saveAssistantMessage(assistantMessageId, {
          status: 'failed',
          content: this.accumulatedDelta, // 已产出的增量
          errorCode: evt.data.code,
          errorMessage: evt.data.message,
        });
        this.forwardToClient(conversationId, evt);
      } else {
        // message.delta / knowledge.result / tool.* 等：随到随转发
        if (evt.type === 'message.delta') {
          this.accumulatedDelta += evt.data.content ?? '';
        }
        this.forwardToClient(conversationId, evt);
      }
    }
  } catch (err) {
    // 连接异常 / 主动 abort：标 cancelled，保留 partial
    const status = controller.signal.aborted ? 'cancelled' : 'failed';
    await this.messageRepo.saveAssistantMessage(assistantMessageId, {
      status,
      content: this.accumulatedDelta,
    });
    // 向浏览器补发 run.failed 或中断事件，由上层决定
    throw err;
  }
}
```

> 公开 API 入口：`actor.userId` 由 **API Key → 资源所有者用户 ID** 反查得到，`actor.type = 'api_key'`。两条入口共用这段装配逻辑（验收标准第 3 条：同一条 ChatService 路径）。

---

## 三、SSE 事件流（v1.1.1：嵌套 data）

### 3.1 信封结构

每个事件统一为**扁平信封 + 嵌套 data**，`event:` 行与 `type` 一致：

```json
{
  "runId": "run_550e8400-e29b-41d4-a716-446655440000",
  "conversationId": "conv_550e8400-e29b-41d4-a716-446655440000",
  "seq": 3,
  "timestamp": "2026-10-22T12:00:00.500Z",
  "type": "message.delta",
  "data": { "content": "您好，" }
}
```

### 3.2 完整原始样例（我方期望收到的字节）

```
: ping

event: run.started
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":1,"timestamp":"2026-10-22T12:00:00.100Z","type":"run.started","data":{"assistantMessageId":"msg_out_550e8400-e29b-41d4-a716-446655440000"}}

event: knowledge.result
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":2,"timestamp":"2026-10-22T12:00:00.350Z","type":"knowledge.result","data":{"status":"matched","chunks":[{"content":"退货需在收货后7天内……","score":0.87,"citation":{"knowledgeBaseId":"kb_01","documentId":"doc_01","chunkId":"chk_01","title":"产品手册","position":{"page":12}}}]}}

event: message.delta
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":3,"timestamp":"2026-10-22T12:00:00.500Z","type":"message.delta","data":{"content":"您好，"}}

event: message.delta
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":4,"timestamp":"2026-10-22T12:00:00.620Z","type":"message.delta","data":{"content":"运费由我们承担。"}}

event: tool.started
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":5,"timestamp":"2026-10-22T12:00:01.000Z","type":"tool.started","data":{"toolCallId":"tc_01","toolName":"weather_query","arguments":{"city":"杭州"}}}

event: tool.completed
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":6,"timestamp":"2026-10-22T12:00:02.300Z","type":"tool.completed","data":{"toolCallId":"tc_01","toolName":"weather_query","status":"succeeded","output":{"weather":"晴","temperature":"24℃","city":"杭州"}}}

event: run.completed
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":7,"timestamp":"2026-10-22T12:00:03.000Z","type":"run.completed","data":{"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","assistantMessageId":"msg_out_550e8400-e29b-41d4-a716-446655440000","status":"completed","content":"您好，运费由我们承担。杭州今天晴 24℃……","citations":[{"knowledgeBaseId":"kb_01","documentId":"doc_01","chunkId":"chk_01","title":"产品手册"}],"toolResults":[{"toolCallId":"tc_01","toolName":"weather_query","status":"succeeded","output":{"weather":"晴","temperature":"24℃","city":"杭州"}}],"finishReason":"stop","usage":{"promptTokens":120,"completionTokens":48}}}
```

失败终止事件：

```
event: run.failed
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":7,"timestamp":"2026-10-22T12:00:03.000Z","type":"run.failed","data":{"code":"MODEL_TIMEOUT","message":"模型响应超时","retryable":true}}
```

工具执行失败（不终止本轮，回填模型）：

```
event: tool.completed
data: {"runId":"run_550e8400-e29b-41d4-a716-446655440000","conversationId":"conv_550e8400-e29b-41d4-a716-446655440000","seq":6,"timestamp":"2026-10-22T12:00:02.300Z","type":"tool.completed","data":{"toolCallId":"tc_01","toolName":"weather_query","status":"failed","error":{"code":"TOOL_EXEC_ERROR","message":"上游天气服务 500"}}}
```

### 3.3 内部版 → 对外版（脱敏由 NestJS 负责）

| 事件 | 内部版 data | 转发浏览器前转换 |
|---|---|---|
| `knowledge.result` | `status` + `chunks[]`（含 `content` / `score` / `citation`） | → `status` + `citations[]`（`sourceId` / `title`），**去掉 `content` / `score` / `position` / `snippet`** |
| `tool.started` | `arguments` 原始入参 | → 脱敏后的 `arguments`（去敏感值） |
| 其余事件 | 原样透传 | — |

> 内部 citation 结构：`{knowledgeBaseId, documentId, chunkId, title, position?}`；对外版 citation 结构：`{sourceId, title}`（`sourceId` 取 `documentId`）。
> 内部 chunk 结构：`{content, score, citation}`。

> 你按内部版发即可，脱敏是我方职责，你不用维护两套。

---

## 四、五条规则（v1.1 定稿，v1.1.1 无变更）

### R-SSE｜SSE 事件格式

1. 行格式 `event: <名>\ndata: <JSON>\n\n`；信封四件套 `runId, conversationId, seq, timestamp` 每个事件都带，`type` 与 `event` 行一致，业务载荷放嵌套 `data`
2. `seq` 从 1 开始严格递增，**心跳注释行（`: ping`）不占 seq**
3. `run.completed` / `run.failed` 是唯一终止事件，互斥且最多出现一次；**连接断开且无终止事件 = 我方按"中断"处理**
4. `run.failed.data` 必须带 `code, message, retryable` 三个字段
5. 心跳：**首帧后每 15s 一次 `: ping`**（你已同意），防代理断连
6. 最终 `run.completed.data.content` **必须等于全部 `message.delta` 拼接**（场景 A2 校验点）

### R-TOOL｜工具事件

1. `tool.started` ↔ `tool.completed` 用 `toolCallId` 一一配对，同一 toolCallId 不得复用
2. **v1.1 修正**：`tool.completed.data` 直接携带插件侧 `PluginToolResult`：`{toolCallId, toolName, status: 'succeeded'|'failed', output?, error?}` —— **不再引入 `ok` / `result` 字段**
3. 错误码分工：
   - `TOOL_EXEC_ERROR` / `TOOL_TIMEOUT` 等业务失败 → **回填模型继续生成**，不终止本轮
   - `TOOL_NOT_FOUND` / `INVALID_ARGUMENTS` → **Runtime 映射为 `TOOL_NOT_ALLOWED` / `TOOL_INVALID_ARGUMENTS`**，`run.failed` 终止本轮
4. 无绑定插件 = `pluginIds: []`，直接生成，**不发任何工具事件**

### R-STOP｜停止生成

1. 我方点停止 = **直接 abort 对你的 HTTP 请求**（fetch AbortController，TCP 断连）
2. 你侧检测到连接断开后：停止上游 DeepSeek 调用、释放资源，**不需要发任何终止事件**（连接已断）
3. **区分两类终止**：主动停止 = 我方标记 `cancelled`；异常终止 = 我方按 `run.failed` / 中断处理。已产出的 delta 两种情况下都保留并落库
4. `cancelled` 轮次不进下一轮 history（场景 C4）；停止后立刻重发 = 我方新建 runId 重新建流，与你侧无需会话级状态

### R-CONC｜并发

1. **同会话并发控制完全在我方**：运行中重复提交 → 409 `CONVERSATION_BUSY`，**不会把并发请求发给你**
2. 你侧可假设：同一 `conversationId` 的流同时最多 1 条；不同会话之间互不影响
3. 你侧无需实现并发队列/锁

### R-SAVE｜结果保存

1. **你侧不写任何数据库**，结果只通过 SSE / run 返回值交给我方
2. 我方校验 `run.completed.data.content == 全部 message.delta 拼接`，再一次性落库
3. **保存成功才把 run.completed 转发给浏览器**；保存失败发 `run.failed(PERSISTENCE_FAILED)`，绝不发 completed（R6）
4. `finishReason: length`（截断）的回答照常落库进历史（待决策项 D4，我方拍板）

---

## 五、错误码表（供 Runtime 侧核对映射）

| 我方错误码 | HTTP 状态 | 触发方 | Runtime 侧来源 |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | NestJS | — （建流前校验失败，不调 Runtime） |
| `UNAUTHORIZED` | 401 | NestJS | — |
| `FORBIDDEN` | 403 | NestJS | — |
| `NOT_FOUND` | 404 | NestJS | — |
| `CONVERSATION_BUSY` | 409 | NestJS | — |
| `MODEL_NOT_CONFIGURED` | 503 | NestJS / Runtime | Key 未配置 |
| `MODEL_TIMEOUT` | 504 | Runtime | 模型超时 |
| `MODEL_RATE_LIMITED` | 503 | Runtime | 限流 |
| `MODEL_UNAVAILABLE` | 502 | Runtime | 模型不可用 |
| `KNOWLEDGE_UNAVAILABLE` | 502 | Runtime | 检索失败/超时（**不得伪装成 no_match**） |
| `TOOL_NOT_ALLOWED` | 400 | Runtime | 由 `TOOL_NOT_FOUND` 映射 |
| `TOOL_INVALID_ARGUMENTS` | 400 | Runtime | 由 `INVALID_ARGUMENTS` 映射 |
| `TOOL_EXEC_ERROR` | — | Runtime | 业务失败，**回填模型** |
| `TOOL_TIMEOUT` | — | Runtime | 业务失败，**回填模型** |
| `RUN_TIMEOUT` | 504 | Runtime | 整轮超时 |
| `RUNTIME_UNAVAILABLE` | 503 | NestJS | Runtime 返回 401/5xx 等内部服务失败；**不得透传 401 给用户当登录失效** |
| `PERSISTENCE_FAILED` | 500 | NestJS | — |

HTTP 错误体沿用 `{ statusCode, message, path, timestamp }`；是否增补 `code` 字段 = 待决策项 D3（组长 + 我方拍板）。

---

## 六、v1.1 变更记录（相对 v1.0，均为采纳王一恒 10.18 反馈）

| # | 变更点 | v1.0 | v1.1 |
|---|---|---|---|
| 1 | `actor.id` 语义 | 未区分 Key ID / 用户 ID | 明确**必须是用户表主键**，公开 API 入口先由 Key 反查 owner |
| 2 | `history` 字段名 | `{role, messageId, content}` | **`{role, id, content}`** |
| 3 | history 上限口径 | 仅"20 条" | **20 条 = 10 个完整对话对**，并叠加 `contextLimit` 轮数；Runtime 仍做最终预算检查 |
| 4 | SSE 载荷结构 | 扁平字段 | **扁平信封 + 嵌套 `data`**，`type` 与 `event` 一致 |
| 5 | `tool.completed` 结构 | `{toolCallId, ok, result}` | **`{toolCallId, toolName, status, output?, error?}`**（对齐 PluginToolResult） |
| 6 | 工具错误分工 | 未区分 | 业务失败回填模型；`NOT_FOUND`/`INVALID_ARGUMENTS` → `TOOL_NOT_ALLOWED`/`TOOL_INVALID_ARGS` 终止 |
| 7 | SSE 解析实现 | 只处理 LF、单行 data、无 finally | **CRLF 兼容 + 多行 data 拼接 + 注释过滤 + finally 释放 reader** |
| 8 | history 构建 | 依赖 `findLast20Completed` 方法名 | **显式排除本轮 messageId + 只取 completed**（buildHistory 参数化） |
| 9 | 心跳 | 建议 15s | 双方确认 15s，不占 seq |

---

## 六之一、v1.1.1 补充记录（相对 v1.1，吸收王一恒 10.18 晚间反馈）

| # | 变更点 | v1.1 | v1.1.1 |
|---|---|---|---|
| 10 | ID 截短 | 示例与代码用 `slice(0,8)` 截短 UUID | 生产环境使用**完整 UUID**，示例同步更新；Runtime 侧也不要截短 |
| 11 | `run.completed` 保存时序 | 示例里所有事件都 `forwardToClient` 后再保存 | **先保存成功再转发 `run.completed`**；失败发 `PERSISTENCE_FAILED` |
| 12 | 内部 chunk 字段 | 用 `text` | 改为 `content`；`citation` 结构明确为 `{knowledgeBaseId,documentId,chunkId,title,position?}` |
| 13 | `tool.completed.output` | 示例用字符串 `"晴 24℃"` | 改为**结构化对象**（如 `{weather,temperature,city}`） |
| 14 | `run.completed.data` 完整字段 | 只列 `content/citations/toolResults/finishReason/usage` | 补全为 `{runId,conversationId,assistantMessageId,status,content,citations,toolResults,finishReason,usage}` |
| 15 | 错误码对齐 | `TOOL_INVALID_ARGS` | 统一为 `TOOL_INVALID_ARGUMENTS` |
| 16 | 内部凭证 401 | 未提及 | Runtime 内部凭证失败返回的 401 **不得透传为"用户登录失效"**，NestJS 映射为 `RUNTIME_UNAVAILABLE`(503) |

---

## 七、仍待拍板（回复序号即可）

1. **`history` 截断口径**：我方按「20 条 / 10 对话对」与 `contextLimit` 取交集截断后传你，你侧再做模型预算检查 —— 确认？
2. **模型允许列表**：暂定 `deepseek-chat`，**不把模型别名当永久有效**；最终列表谁维护？
3. **插件 TIMEOUT 映射**：插件 `TIMEOUT` 由 Runtime 映射为流内 `TOOL_TIMEOUT`（回填模型，不终止本轮）—— 确认？
4. **错误码表**：上表映射是否齐全？你侧还有哪些未覆盖的 code
