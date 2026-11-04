# Week3 Agent Runtime：受控工具循环与实际联调

首次记录：2026-11-01；更新：2026-11-02。负责人：王一恒。

## 分支与范围

联调分支为 `codex/integration/week3-runtime-tools`，从 `integration/week3-rag-auth-plugin-agent@c96866a` 建立，包含 Agent、聊天、RAG 和插件代码。另行带入引用事件修复 `056462a`（本分支对应提交 `ce63c3b`）。11月1日没有直接合并main的插件撤销提交；11月2日核对main@5d0dae9已包含工具循环、与本分支仅差一处前端类型修复后，正常合并该主分支。没有改写原有Week2/Week3分支。

Week2 聊天异常验收仍按 `main@df80ac9` 单独进行。新分支用于工具循环联调，不代表聊天、数据库和工作流全部场景已验收。

## 已实现

Runtime 保持现有 run/stream 请求结构及九字段 AgentConfig。没有插件绑定时继续使用原文本流逻辑。有绑定时，经 `HttpPluginProvider` 获取本轮允许工具，转换为模型的 function tools；模型发起调用后，执行工具、按原 tool_call_id 回填结构化结果，再请求模型继续生成。

工具来自 AgentConfig.pluginIds 的本轮绑定快照。模型不能指定任意插件、URL或凭证。调用定义不属于绑定、工具名重复或为空、未知工具、非法 JSON 参数、重复调用 ID 均明确失败；整批调用先校验再执行，避免前面工具执行后才发现后面工具越权。

流式模型的工具参数按 index 拼接，等待完整结束标记后才执行，不把未完成的参数片段送给插件。不接受模型流截断后继续执行工具。

| 限制 | 当前值 |
| --- | --- |
| 一批工具调用 | 最多8项 |
| 工具执行轮数 | 最多4轮，之后仍可有最终文本回复回合 |
| 整轮工具执行次数 | 最多16次 |
| 单次参数 | 最多16000字符，必须是合法JSON对象，不接受NaN/Infinity |
| 单次结果 | 序列化后最多16000 UTF-8字节 |
| 上下文 | 提示词、工具定义、参数与结果都计入保守字节预算，不截断协议消息 |
| 超时 | 保留模型超时、Provider超时和整轮超时；取消向正在等待的模型/工具请求传播 |

没有自动重试。取消只能停止本地等待和关闭请求，不保证外部工具已经发生的副作用回滚；具有副作用的工具仍需执行方明确幂等与取消语义。

工具返回 `failed/INVALID_ARGUMENTS` 或 `failed/TOOL_NOT_FOUND` 时，发送工具终态后结束本轮为失败。结构化 `failed/TIMEOUT`、`failed/TOOL_EXEC_ERROR` 作为失败结果回填模型，由模型解释或继续；网络、鉴权、协议错误直接失败，不伪装成成功结果。

## 事件与返回

沿用 `{runId,conversationId,seq,timestamp,type,data}` 信封，seq连续递增。新增实际产出：

```json
{"type":"tool.started","data":{"toolCallId":"call_id","toolName":"echo_text"}}
```

`tool.completed.data` 为完整 PluginToolResult：`{toolCallId,toolName,status,output}` 或 `{toolCallId,toolName,status,error}`。工具失败也有 completed 事件，不能将 completed 等同业务 succeeded。输入参数不放入 started 事件。

成功顺序为 `run.started → 可选knowledge.result → message.delta/tool.started/tool.completed → run.completed`；失败走唯一 `run.failed`。模型在工具回合输出的文字同样作为文本增量，最终 content 等于所有文本增量拼接；最终 toolResults 汇总实际工具结果，usage按模型各回合累加；缺失统计时不伪造用量。

上下文及工具定义预算校验通过后才发送 knowledge.result；该事件仍仅含 status/citations，不包含正文、chunks或score。当前允许工具按本轮快照固定，运行途中权限变更的实时失效策略仍待模块负责人确认。

## 验证结果

完整 Python 测试74项通过，其中新增20项工具循环测试，覆盖成功回填、多个调用关联、累计usage、HTTP run所用聚合路径、未绑定工具、非法参数、重复ID、截断、业务失败策略、4轮/16次限制、超大结果、预算和执行中取消。既有引用事件顺序、空引用和上下文投影测试保留。语法编译和 `git diff --check` 通过。

真实硅基流动 `deepseek-ai/DeepSeek-V4.1-Flash` 与真实 NestJS 插件接口验收：

1. 模型实际调用 echo_text 和 current_time，插件真实执行后回填，模型继续回答；服务层验证通过，129个事件，累计1280 tokens。
2. 通过真实 FastAPI 应用的 run 和 stream 路由再次调用（TestClient ASGI传输），均通过。流式117个事件，工具结果均为 succeeded，seq连续、增量拼接等于终态正文；该次 stream 累计1858 tokens。
3. 上述输入使用显式合成 RuntimeRequest/AgentConfig，不是从数据库读取的 Agent；不代表 Agent绑定、JWT、NestJS聊天转发或浏览器端工具展示已验收。

本机 Docker 启动进入错误状态，且当前进程无权启动后台服务；本次插件服务使用现有 PluginRegistry 的内存降级目录、真实 Controller/Service/Executor。没有使用模型或执行器替身，但**没有完成本次 PostgreSQL 验收**。没有接触原业务数据库，凭证仅在临时进程环境传入，临时插件服务已停止。本机代理环境曾导致 localhost 访问失败，测试进程显式设置 NO_PROXY=127.0.0.1,localhost 后通过。

## 复跑

先按项目说明启动插件后端，完成数据库迁移并确认日志没有发生目录降级。两端安全配置同一个 PLUGINS_SERVICE_TOKEN；BACKEND_SERVICE_URL 为 NestJS 根地址，不带 /api。设置可用模型及密钥，HTTP模式另需 INTERNAL_SERVICE_TOKEN。不要把实际凭证写入仓库或聊天。

```powershell
.venv/Scripts/python.exe -m pytest apps/agent/tests -q
.venv/Scripts/python.exe apps/agent/scripts/smoke_tools.py --live
.venv/Scripts/python.exe apps/agent/scripts/smoke_tools.py --live --http
```

真实验收会调用模型和两个内置工具，仅在专用测试环境显式执行。HTTP模式使用真实 FastAPI 应用路由与 ASGI传输，不代表反向代理/TCP连接和浏览器端到端通过。

## 待协作与未验收

### 11月2日回复确认与本地回归

管逸恬提交 `integration/week2-rag-auth-agent@d76051c` 的隔离环境验收记录：`tools/week2-exception/acceptance-2026-11-02.md`。Embedding故障注入导致检索503，Runtime产生KNOWLEDGE_UNAVAILABLE；运行中移除绑定后检索403，Runtime产生KNOWLEDGE_FORBIDDEN。两种路径均为run.started→run.failed，没有knowledge.result、run.completed或模型调用；公开聊天对外将内部代码映射为MODEL_ERROR，助手消息保存failed。内部代码及顺序符合Runtime契约；公开错误码投影由聊天模块确认。此处引用她的本机验收，未声称我方重跑真实数据库或浏览器。

新增本地HTTP/SSE回归 `test_knowledge_runtime_http.py`：用HTTP检索替身分别返回503和403，验证真实FastAPI应用run的状态码及X-Runtime-Error-Code、stream的事件顺序和seq，并断言没有模型请求。完整Python测试现为76项通过。这两项是本机自动回归，不代替上面的真实服务验收。

陈弘毅确认buildAgentConfig仅投影enabled=true的绑定；草稿revision=0。已核对现有代码：getAgentConfig默认revision=0，发布快照通过buildAgentConfig(detail,nextVersion)生成版本。Runtime把revision视为请求快照元数据，不自行改写，也不能把草稿revision=0解读成实时权限凭据。取消/断流、停用后的浏览器链路和运行中插件实时失效仍待各模块联合验收。

- 陈弘毅：AgentConfig revision快照、绑定禁用/停用及真实测试Agent；已通过飞书询问，按实际回复冻结最终契约。
- 朱晋亨：工具错误码、超时/取消/副作用约定、正式migration、部署时数据库降级策略；外部会话CLI此前发送受限，不能声称已收到对方确认。
- 韦淇元：tool.started/tool.completed在聊天端的展示、保存及断连传播；main上的聊天异常补测独立进行。
- 管逸恬：后续合入统一基线，保留引用事件顺序修复，避免将main的插件撤销历史误当作新集成已完成。
- 康雨萱、傅美佳：工作流既有成功闭环，以及新增节点冻结后的接口。本次没有自行定义未知节点接口。
- Docker恢复后补真实PostgreSQL目录、Agent绑定、聊天/浏览器工具链路验收，并更新本记录；不能将本次内存目录结果升级为数据库通过。


## 2026-11-04 macOS 真实浏览器验收

在 `codex/integration/week3-runtime-tools@119a7f6` 合并 `main@2691e26`，保留知识库 503/403 的 HTTP/SSE 回归。新增 INTERNAL_ERROR 回归先复现 `/run` 错返 502，修复共享 run() 状态映射为 500；SSE 仍是 HTTP 200 + run.failed，retryable=false，且不暴露原始异常。

### 环境和自动检查

- Node 24.21.0、pnpm 12.9.1、项目 `.venv` Python 3.12.14；按锁文件及 requirements 安装。企业 npm 镜像连接异常后改用命令级官方源，未切换包管理器或重写锁文件。
- 新建仅绑定 127.0.0.1:5433 的 pgvector PostgreSQL 17 隔离容器及 `minicoze_acceptance` 数据库。现有迁移仅覆盖 User/Conversation/Message，因此在全新库执行 schema db push；不代表正式迁移已交付。
- `.env` 仅本地更新数据库地址、内部插件凭证、开发 JWT 和工作流开发开关；凭证不入库。
- Python：合并后 101 项通过；新增错误码回归修复后 102 项通过。类型检查及完整构建通过。
- Backend：显式传入根 `.env` 且允许本机监听后，13 套 / 43 项通过。此前沙箱监听失败，以及未显式传环境时两个数据库测试失败，均为测试环境问题；未跳过测试或降低断言。

### 浏览器实际结果

使用合成验收账号，真实 NestJS、Runtime、Embedding、模型网关和 PostgreSQL：

1. 页面创建 Agent、绑定文本回显和当前时间插件、保存；模型实际执行两个工具并继续回答。后端日志确认工具 HTTP 成功、插件目录从数据库加载，未触发内存降级。刷新后最终回答仍在。
2. 单库返回餐费每天40元并展示来源；多库返回餐费40元/住宿300元并展示两条来源；空库继续正常回答。资料均为脚本生成的合成内容。
3. 页面长文本生成过程中点击停止；数据库助手消息为 cancelled。随后同会话再次发送成功，证明本次取消后的会话锁释放。未覆盖工具执行中取消及外部副作用回滚。
4. 页面创建工作流，通过 API 导入仓库 Start→LLM→End 示例并将模型设为当前配置，再从页面保存、校验、运行。真实模型调用成功，三个节点 SUCCEEDED，输出“工作流真实模型验收通过。”。运行历史 API 确认落库及 usage：promptTokens=19、completionTokens=7、totalTokens=26。
5. 工作流刷新后节点、连线、模型配置恢复；运行结果按钮和节点运行状态没有恢复，已有 runs API 仍可读成功历史。

### 已确认的跨模块缺口

- 聊天前端显式忽略 tool.*，没有工具状态展示。Message schema 未持久化引用/工具结果；本次实际刷新单库对话后来源区域消失，但正文保留。已联系韦淇元确认展示与持久化范围，不把正文保存当作工具/引用恢复通过。
- 工作流运行历史页面恢复、正式鉴权及新增节点范围由康雨萱/傅美佳配合；已同步真实成功记录和剩余事项。WORKFLOW_DEV_MODE 只用于隔离开发验收。
- 完整数据库迁移缺失已通知组长协调。
- 此轮未重跑公开聊天 Embedding 503、运行中解绑/停用以及发布 API Key 路径；保留既有故障回归，不能据此声称所有发布场景通过。
