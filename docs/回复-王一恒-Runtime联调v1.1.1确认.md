# 回复｜给王一恒的 Runtime 联调确认（v1.1.1，2026-10-18 晚）

> 用法：把下面「正文」整段复制到飞书发给一恒，链接替换成文档实际地址即可。
> 定位：**短回复**，只讲采纳了什么 + 还剩什么，细节都在文档里，不重复贴。

---

## 正文（可直接复制）

@王一恒 第二条反馈收到，**7 条我全部采纳，没有异议**，契约已升到 **v1.1.1**：
[联调契约 v1.1.1｜NestJS 调 Runtime](./联调契约-NestJS调用Runtime-请求示例与规则确认.md)

### 一、你这 7 条我改完了

1. **ID 不截短** — 生产环境 `runId` / `userMessageId` / `assistantMessageId` / `conversationId` 全部用**完整 UUID**，示例的 `slice(0,8)` 已删。你侧也别截短，原样回填。
2. **`run.completed` 先保存再转发** — 我方拦截到 completed 后，先校验 `content == 全部 delta 拼接` 并落库，**保存成功才转发**给浏览器；保存失败发 `PERSISTENCE_FAILED`(500)，绝不会先发 completed 再补存。
3. **内部 chunk 字段** — 统一为 `{content, score, citation}`，`citation = {knowledgeBaseId, documentId, chunkId, title, position?}`。我按这套解析，对外版脱敏成 `{sourceId, title}` 再给前端。
4. **`tool.output` 结构化** — 不再是字符串，传对象（如 `{weather:'晴', temperature:'24℃', city:'杭州'}`）。
5. **`run.completed.data` 补全** — 现在是完整 `RuntimeResult`：`{runId, conversationId, assistantMessageId, status, content, citations, toolResults, finishReason, usage}`，你不用再猜我读了哪些字段。
6. **内部 401 不透传** — Runtime 内部凭证失败 / 5xx 一律映射为 `RUNTIME_UNAVAILABLE`(503)，**不会当成"用户登录失效"抛给前端**。这条我写进错误码表了。
7. **长期记忆不进 MVP** — 已跟组长确认，本期不做长期记忆存储/管理接口/授权快照表。短期记忆分工按你说的：你侧消费 `history` + 上下文组装 + token 预算；我方负责历史查询、归属校验、保存与消息状态；`contextLimit` 配置口径找 @陈弘毅。

另外顺手对齐了一个错字：错误码统一为 `TOOL_INVALID_ARGUMENTS`（之前写成 `TOOL_INVALID_ARGS`）。

### 二、还剩 4 项要你回一下（回序号就行）

1. **history 截断口径**：我方按「20 条 = 10 个完整对话对」∩ `contextLimit` 取交集截断后传你，你侧再做最终模型预算检查 —— 确认？
2. **模型允许列表**：暂定 `deepseek-chat`，不把模型别名当永久有效。最终允许列表谁维护、在哪登记？
3. **插件 `TIMEOUT`**：由你映射成流内 `TOOL_TIMEOUT` 回填模型、不终止本轮 —— 确认？
4. **错误码表**：契约第五节那张表，你核一下有没有漏的 code。

### 三、我这边进度

后端 chat 模块还没动工（登录/会话在上游，得先落地才能接线），所以现在是**契约先行**。你那边可以先按 v1.1.1 的 `RuntimeRequest` 和事件格式做，mock 一份 NestJS 请求就能自测；等我登录和会话落地，直接照这份契约对接，不再改字段。

---

## 附：本次修订对应的文档

| 文件 | 变更 |
|---|---|
| `docs/联调契约-NestJS调用Runtime-请求示例与规则确认.md` | v1.1 → **v1.1.1**：完整 UUID、保存时序、chunk `content`、`tool.output` 结构化、`run.completed` 全字段、`TOOL_INVALID_ARGUMENTS`、新增 `RUNTIME_UNAVAILABLE`（7 条变更记录见「六之一」） |
| `docs/联调方案-韦淇元与王一恒-聊天流式链路.md` | 头部版本标注 v1.1.1；3.1 请求体、3.3 事件表、3.4 错误码表同步 v1.1.1 |
| 本文件 | 新建，v1.1.1 飞书回复卡 |
