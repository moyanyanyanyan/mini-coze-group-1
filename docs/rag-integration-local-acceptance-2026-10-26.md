# RAG 本地验收记录：真实接口与 HTTP 替身（2026-10-26）

## 环境与范围

- 分支：`integration/week2-rag-auth-agent`；首次运行前 HEAD 为 `b1a1bfb`。首次验收时数据准备脚本与本文档尚未提交，后续与本记录一并整理入库。
- 服务：本机 Docker PostgreSQL、NestJS `localhost:3000`、Python Embedding `localhost:8000`，后两者健康接口均返回 HTTP 200；前端 Vite 已启动于 `localhost:5173`。
- 数据库：独立的 `minicoze_rag_integration`，没有修改原 `minicoze` 库。脚本使用真实 Auth、Agent、Knowledge HTTP 接口；内部检索检查使用配置在本机的服务凭证，凭证值不在本文档记录。
- 测试用户：`rag-integration@example.test`；`actorId = workspaceId = 19bd4fe3-92d3-4290-8e13-8608a3339aff`。密码和 JWT 不记录。

| 资源 | 实际 ID | 状态或用途 |
| --- | --- | --- |
| 餐费知识库 | `ce7e929c-d6b9-4fb9-b885-6721822a27b9` | ACTIVE，文本录入 |
| 住宿知识库 | `c07ca89f-33ee-4cb1-aaed-cbadf9539fb2` | ACTIVE，TXT 上传 |
| 空知识库 | `5484a305-4d1c-409b-bfd3-e55ee0ae3968` | ACTIVE，无文档 |
| 餐费文档 | `0acdf063-4313-4b5f-b08e-7c7de8c53bff` | READY，切片含“每人每天 40 元” |
| 住宿文档 | `2f216947-a5d8-472b-9b16-3906cc8821bc` | READY，切片含“每间每晚 300 元” |
| 单库 Agent | `cmvoo4fb300008oogh9nu0cig` | 仅绑定餐费库 |
| 空库 Agent | `cmvoo4fdu00028oogg8shscmi` | 仅绑定空库 |
| 多库 Agent | `cmvoo4ffy00048oog9rji8fw4` | 绑定餐费库和住宿库 |

这些 ID 只属于上述本地数据库；其他成员运行 [准备脚本](rag-integration-fixture.md) 后应使用自己的实际输出。

## 已验证

1. 数据准备脚本首次运行成功：注册测试用户、创建三个知识库和 Agent 绑定，两份资料异步处理到 `READY`，切片包含预期内容；检索预览分别为餐费 `HIT`、住宿 `HIT`、空库 `NO_HIT`。
2. 原样重复运行脚本，所有资源 ID 保持一致，没有生成重复文档或覆盖不同绑定。
3. 对 `POST /internal/knowledge/retrieval` 发起真实 HTTP 请求，均携带 `runId`、上述真实 `actorId`/`agentId`、`knowledgeBaseIds`、`query`、`topK:5` 和本地内部服务凭证：

| 场景 | 结果 |
| --- | --- |
| 单库 Agent 查餐费 | HTTP 200，`HIT`，1 条，来源“合成餐费报销规则” |
| 多库 Agent 查餐费和住宿 | HTTP 200，`HIT`，2 条，两个来源各 1 条 |
| 空库 Agent 查餐费 | HTTP 200，`NO_HIT`，`hits=[]` |
| 单库 Agent 越权查未绑定的住宿库 | HTTP 403 |

4. 使用上述多库 Agent 的已保存模型与绑定配置，直接调用 `POST /internal/runtime/run` 做一次真实模型验收。模型为 `deepseek-ai/DeepSeek-V3.2`；本次请求单独将输出上限设为 512，其余知识库范围从 Agent 读取。返回 `status=completed`，回答同时给出“住宿每间每晚 300 元”和“工作日午餐每人每天 40 元”，`citations` 包含“合成住宿报销规则”“合成餐费报销规则”两个来源。模型回报用量为 prompt 203、completion 116、total 319 tokens。这是一次成功样本，不代表长期稳定性或其他问法均正确。
5. 直接调用 `POST /internal/runtime/stream` 验证真实 SSE，`runId=run-sse-dd542cd4-4875-4bc6-af2a-e48fa4d38691`。HTTP 200，`Content-Type: text/event-stream`；依次收到 `run.started`、`knowledge.result`、106 个 `message.delta`、唯一 `run.completed`，没有 `run.failed`。所有事件 `seq` 从 1 连续递增，`runId`/`conversationId`/时间戳齐全；增量文本拼接与最终 `content` 完全相等。`knowledge.result.data` 只含 `status=matched` 和两个 `citations`，没有 `chunks`、正文或 `score`；最终回答包含 40 和 300，最终引用数为 2。首个文本增量约 0.86 秒到达，整次约 5.42 秒。这是 Runtime 直接输出的 SSE，未经过 NestJS 聊天转发。
6. 为排除 PowerShell 对中文终端输出的乱码影响，再以英文问法运行一次 SSE，`runId=run-sse-ascii-13baadbb-209c-49b2-8a02-b6c7bad200dd`，只以 ASCII 转义格式检查原始 Unicode。HTTP 200 且 `run.completed`；正文是可正确解码的中文，分别包含午餐每天 40 元和住宿每晚 300 元及对应片段 ID，没有 Unicode 替代字符；来源标题为“合成餐费报销规则”和“合成住宿报销规则”。

## 权限、解绑与停用（R4）

使用上述真实测试用户、Agent 和知识库 ID，通过受保护的内部检索接口逐项测试。绑定和知识库状态只在测试期间临时改动，结束后均已恢复。

| 场景 | 实际结果 |
| --- | --- |
| 有效用户、单库 Agent 请求未绑定的住宿库 | NestJS HTTP 403，`data=null`；Runtime HTTP 403，`X-Runtime-Error-Code: KNOWLEDGE_FORBIDDEN` |
| 格式正确但不存在的用户 UUID | NestJS HTTP 401，`data=null` |
| 餐费绑定设为 `enabled=false` 后仍请求餐费库 | HTTP 200，`NO_HIT`，0 条；绑定记录仍存在 |
| 全量替换解绑餐费库后，旧请求仍携带餐费库 ID | HTTP 403，`data=null`；绑定列表为空 |
| 多库 Agent 的住宿库停用，单独请求住宿库 | HTTP 200，`NO_HIT`，0 条 |
| 住宿库停用时同时请求餐费与住宿 | HTTP 200，`HIT`，只返回餐费库 1 条 |
| 停用期间尝试新增住宿库绑定 | Agent 绑定接口 HTTP 400，原有绑定未被覆盖 |
| 恢复绑定和知识库 `ACTIVE` 后 | 单库 `HIT` 1 条，多库 `HIT` 2 条；状态与测试前一致 |

当前实现将已绑定但禁用、或知识库已停用的资源跳过；未绑定资源则返回 403。额外发现：非 UUID 格式的 `actorId` 会让 Prisma 报错，接口返回 HTTP 500；格式正确但不存在的 UUID 返回预期的 401。此格式错误处理尚未修复，不影响上述有效用户场景。

**同日复跑：**原有 3000 端口已被其他进程占用，因此另在 3001 端口启动 NestJS，并明确连接独立数据库 `minicoze_rag_integration`；Embedding 服务在 8000 端口健康。数据准备脚本再次成功，所有资源 ID 未变，餐费和住宿预览均为 `HIT`、空库为 `NO_HIT`。随后在 3001 端口重跑上述 R4 场景，结果一致：未绑定 403、不存在的有效 UUID 401、非 UUID 字符串 500、禁用绑定或停用库后的跳过行为，以及恢复后的单库 1 条与多库 2 条命中均复现。最后再次核对单库绑定 `enabled=true`、住宿库 `ACTIVE`。本次复跑针对 NestJS 检索接口；Runtime 的 403 透传结果沿用此前测试，未在 3001 环境重测。

## R5、R4、R3 追加本地验收

本次使用同一独立数据库 `minicoze_rag_integration` 和上表的真实资源 ID。正常链路另起 NestJS `3011`、Embedding `8010`、Runtime `8011`；Runtime 的 `BACKEND_SERVICE_URL` 指向 `3011`。故障链路另起 NestJS `3012` 和 Runtime `8012`，其后端 Embedding 地址指向本机未监听端口；没有关闭正常服务或改动已有文档、向量。请求使用本机内部服务凭证，本文不记录凭证。

| 场景 | 实际结果 |
| --- | --- |
| R5：错误的内部服务凭证 | NestJS 检索 HTTP 401，`data=null` |
| R5：有 READY 片段时 Embedding 连接失败 | NestJS 检索 HTTP 503，`code=503`、`data=null`；没有返回 `NO_HIT` |
| R5：同一故障经 Runtime 普通入口 | HTTP 503，`X-Runtime-Error-Code: KNOWLEDGE_UNAVAILABLE` |
| R5：同一故障经 Runtime 流式入口 | 仅 `run.started → run.failed`，终态代码 `KNOWLEDGE_UNAVAILABLE`；没有 `knowledge.result`、文本增量或 `run.completed` |
| R5 对照：真正的空知识库 | 即使故障实例无法连接 Embedding，检索仍正常返回 HTTP 200、`NO_HIT`、`hits=[]`，因为没有候选片段时无需生成问题向量 |
| R4：请求未绑定库 | NestJS HTTP 403；Runtime 普通入口 HTTP 403、`KNOWLEDGE_FORBIDDEN` |
| R4：临时禁用单库 Agent 的餐费绑定 | Runtime 流式 `knowledge.result` 为 `no_match`、`citations=[]`，随后 `run.completed` 且最终引用为空 |
| R4：临时停用多库 Agent 的住宿库 | Runtime 流式 `knowledge.result` 为 `matched`，只含餐费库 1 条来源，最终 `run.completed` 也只有这 1 条来源 |
| R3：空库 Agent 真实流式运行 | NestJS HTTP 200、`NO_HIT`、`hits=[]`；Runtime 依次发 `run.started → knowledge.result(no_match, citations=[]) → … → run.completed`，最终 `citations=[]` |

R4 两项状态变动由测试脚本直接更新独立数据库，专门验证 Runtime 消费检索结果的行为；这一步没有重测公开停用/绑定接口。测试程序用 `finally` 恢复状态，事后再次真实检索，多库返回 `HIT`、两个库各 1 条。上述 R3/R4 流式运行调用了本地配置的真实模型；R5 在检索阶段失败，未调用模型。首次正常检索遇到 Embedding 模型冷启动，客户端 30 秒等待超时；模型加载完成后重试，真实单库检索返回 HTTP 200、`HIT`、1 条。这个冷启动现象尚不足以判定日常请求稳定性，正式超时策略仍需结合部署环境复测。

## 追加：删除、超时与异常响应

**真实服务与独立数据库：**临时启动 NestJS `3011`、Embedding `8010`，仅在 `minicoze_rag_integration` 中注册一次性用户和创建两套一次性资料；测试结束删除资料、知识库和该用户，停止临时服务，未动原有样例。两套资料均经过异步处理达到 `READY`，各有 1 个片段，检索预览先返回 `HIT`。

| 操作 | 实际结果 |
| --- | --- |
| 删除第一套资料的文档 | `DELETE /api/documents/:id` HTTP 200；再读取文档为 404，原知识库检索变为 `NO_HIT`、`hits=[]` |
| 直接删除第二套含 READY 文档的知识库 | `DELETE /api/knowledge-bases/:id` HTTP 200；目录中不再出现该库，原文档读取为 404 |
| 数据清理核对 | 两套资料对应的文档、切片记录计数均为 0；全库向量表与切片表左连接后孤儿向量计数为 0；一次性测试用户亦已删除 |

**HTTP 替身与真实 Runtime：**现有 Provider 定向测试 6 项通过。另启动真实 Runtime HTTP/SSE 入口，让本地 HTTP 替身分别延迟响应、返回 `HIT` 却没有 `hits` 的矛盾报文；这两项没有调用真实 NestJS、数据库或模型。

| 模拟场景 | Runtime 普通入口 | Runtime 流式入口 |
| --- | --- | --- |
| 检索 HTTP 超时（测试实例将 Provider 超时设为 1 秒） | HTTP 504，`KNOWLEDGE_TIMEOUT` | 仅 `run.started → run.failed`，错误码 `KNOWLEDGE_TIMEOUT` |
| 检索报文状态与内容矛盾 | HTTP 502，`KNOWLEDGE_PROTOCOL_ERROR` | 仅 `run.started → run.failed`，错误码 `KNOWLEDGE_PROTOCOL_ERROR` |

测试替身证明了 Runtime 的错误处理，但不等于真实 NestJS 在负载下会超时或返回异常格式；生产环境的 10 秒检索超时和冷启动耗时仍需单独观测。

**补充真实模型问法（小样本）：**继续使用独立数据库中的餐费、住宿合成资料，经 NestJS 检索与 Runtime 普通入口调用本地已配置的模型。问“住宿花费 320 元、工作日午餐花费 50 元时，资料中分别规定的报销上限是多少？”时，本次回答包含住宿 300 元、工作日午餐 40 元，并返回两个资料来源。问“周末午餐每人每天的报销上限是多少？”时，本次回答指出资料只规定工作日午餐 40 元，“未对周末午餐报销上限作出规定”，返回餐费资料来源，没有将 40 元说成周末额度。后者又独立问了一次，结论一致。第二次的自动断言只接受“未规定”等固定短语而失败，实际回答用的是“未对……作出规定”；这是测试判词过窄，不是模型回答错误。以上只证明本次几次调用的行为，不代表所有改写问题都可靠。

## 尚未验证

- NestJS 聊天接口的会话/消息保存、向 Runtime 下发 AgentConfig，以及向浏览器转发 SSE；本文记录的模型调用均由本地测试请求直接发给 Runtime。
- 更多问法与模型网关稳定性仍需持续观察；本次只额外试了两类问法。真实环境中接近 10 秒检索限额时的耗时尚未验证。删除使用真实服务验收；超时和格式错误使用本地 HTTP 替身验收，不能写成真实后端曾产生这些故障。
- R3 已验证无命中时 Runtime 正常完成且不返回虚构来源；模型回答的措辞和事实质量仍需更多问法复测。R4 已验证停用时 Runtime 的状态和来源，不能推断模型在所有问法下都能正确解释停用原因。

后续联调时可用“餐费和住宿的报销上限分别是多少？”检查多库答案，并单独记录模型、SSE、错误处理的结果。若重建或更换数据库，必须重新运行脚本，不能复用本文档的 ID。
