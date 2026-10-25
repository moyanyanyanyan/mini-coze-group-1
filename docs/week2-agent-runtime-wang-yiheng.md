# MiniCoze Week 2｜王一恒：Agent Runtime

记录日期：2026-10-22。依据项目实施方案 revision 1258 的 Week 2 分工及个人/联调文档模板。当前为本地代码交付及验证记录，不代表多人远程联调已通过。

2026-10-23 更新：初次实现已提交并推送（65f0428）；本次接入 main 的 a665b2a，合并 README 双方有效内容，保留新的根目录环境加载、日志及统一 API 入口，并将 Runtime HTTP 层迁至 app/api/runtime.py。接口路径和工作流公开函数不变。

合并后验证：使用已安装的 Node 22.19.0 与 pnpm 12.9.1，按现有锁文件安装依赖；Prisma 6.19.0 客户端生成、根 pnpm typecheck、pnpm test、pnpm build 均通过。测试合计前端3项、后端1项、Python25项。未执行数据库迁移，未新增或升级 Runtime 依赖，未修改系统默认 Node。

## 完成内容

已实现内部 HTTP run/stream、DeepSeek 非思考文本调用、SSE 增量解码、统一事件、历史校验及成对裁剪、模型与总运行超时、断开清理、服务间鉴权，以及工作流可直接调用的异步函数。run 聚合同一流式执行逻辑，不另造第二套聊天实现。

短期记忆消费 NestJS 提供的已完成历史；只接收 user/assistant 完整问答对，最多 20 条，排除本轮消息 ID。历史状态过滤、contextLimit 选择、数据库存储和会话权限属于聊天模块；Runtime 做最终上下文预算。预算以 UTF-8 字节数加协议余量作保守上界估算，不宣称精确 tokenizer 计数；先丢最旧整对，仍超预算则失败。

知识库和插件已提供可替换 Protocol 与 HTTP 适配，在 FastAPI 应用入口注册。知识库调 NestJS 内部检索并映射来源，插件支持工具列表及直接执行适配；缺凭证、依赖失败和非法响应明确失败。自动 Tool Call 尚未启用，真实 NestJS 联调与完整绑定体验仍待验证。长期记忆不进入本期 MVP。

## 代码说明

个人分支：`codex/feature/wangyiheng/agent-runtime`，已推送至 origin。团队分支样例使用 feature/姓名/内容，本机按 Codex 分支约定增加 codex/ 前缀。本次基于主分支 a665b2a 解决合并冲突；多人真实联调结果另行记录。

| 路径 | 职责 |
| --- | --- |
| apps/agent/app/runtime/schemas.py | 请求、结果、历史、知识库与插件契约 |
| apps/agent/app/runtime/deepseek.py | 单次调用与供应商事件流读取 |
| apps/agent/app/runtime/http_providers.py | NestJS 检索/插件 HTTP 适配、鉴权外壳与响应转换 |
| apps/agent/app/runtime/service.py | 上下文、Provider 注入与运行事件 |
| apps/agent/app/api/runtime.py | 内部鉴权、run/stream、心跳、取消及 HTTP 错误，经 api/router.py 统一注册 |
| apps/agent/tests/test_runtime.py | 离线契约、流式时序、异常与资源释放测试 |
| apps/agent/scripts/smoke_runtime.py | 显式 --live 的真实 HTTP/工作流验收 |

复用已有 httpx/FastAPI/Pydantic，未新增或升级项目依赖。安装使用现有 requirements.txt，在项目 .venv 中隔离，未修改 Conda base。未修改 NestJS、前端、数据库或公共 TypeScript 包；跨模块尚未消费的新类型保留在 Runtime 内部。

## 对外接口

### 内部 HTTP

`POST /internal/runtime/run` 返回 RuntimeResult JSON；`POST /internal/runtime/stream` 返回 text/event-stream。两者均要求 `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>`，缺少服务端配置返回 503，凭证错误返回 401。网页与公开 API 继续由 NestJS 代理，不用 DeepSeek Key 或业务用户 JWT 充当内部凭证。

请求示例（ID 为不透明字符串，revision=0 为草稿）：

```json
{
  "runId": "run_demo",
  "actor": {"id": "user_demo"},
  "conversationId": "conv_demo",
  "userMessageId": "msg_u_current",
  "assistantMessageId": "msg_a_current",
  "agentConfig": {
    "id": "agent_demo", "revision": 0, "name": "助手",
    "systemPrompt": "简洁回答", "model": "deepseek-ai/DeepSeek-V3.2",
    "temperature": 0.7, "maxTokens": 128,
    "knowledgeBaseIds": [], "pluginIds": []
  },
  "history": [],
  "message": "你好"
}
```

成功样例（结构说明，非真实付费调用结果）：

```json
{
  "runId": "run_demo", "conversationId": "conv_demo",
  "assistantMessageId": "msg_a_current", "status": "completed",
  "content": "你好", "finishReason": "stop", "usage": null,
  "citations": [], "toolResults": []
}
```

事件按 run.started → message.delta（多次）→ 唯一 run.completed/run.failed；有知识库 Provider 时可增加内部 knowledge.result。信封为 runId/conversationId/seq/timestamp/type/data，seq 从 1 递增，SSE id 为 runId:seq；最终 content 等于可见增量顺序拼接。心跳为每 15 秒注释，不计 seq。必须同时收到供应商 finish_reason 与 [DONE] 才视为完成；reasoning_content 不转发。length 表示截断，不能显示完整回答已生成。

建流前错误体保持 `{statusCode,message,path,timestamp}`，附 `X-Runtime-Error-Code` 响应头，不回显输入或供应商响应。建流后仍为 HTTP 200，通过 run.failed 的 `{code,message,retryable}` 表示失败，不再发送 completed。主要映射：400 INVALID_REQUEST；模型未配置/余额不足/限流为 503 MODEL_NOT_CONFIGURED/MODEL_QUOTA_EXCEEDED/MODEL_RATE_LIMITED；超时 504；供应商认证失败为内部依赖 502 MODEL_AUTH_FAILED，不能解释成终端用户登录失效。

NestJS 负责鉴权和持久化：将 actor.id 解析为登录用户/API Key 所有者，组装已授权 AgentConfig 与历史；Runtime 的 knowledge.result 已仅含 status/citations，正文与分数不进入事件；收到 run.completed 后先保存，再向客户端宣布完成。失败、取消、无终态断流均不能存成 completed。

### 工作流公共函数

在 FastAPI Python 环境中导入，不从 NestJS 直接导入 Python，也不通过聊天接口触发工作流持久化：

```python
from app.runtime import call_model, ModelError

try:
    result = await call_model(
        model="deepseek-ai/DeepSeek-V3.2",
        messages=[{"role": "user", "content": "介绍 MiniCoze"}],
        temperature=0.7,
        max_tokens=128,
    )
    output = result.model_dump()
except ModelError as error:
    node_failure = {"code": error.code, "message": error.message,
                    "retryable": error.retryable}
```

签名是 keyword-only；成功返回 ModelResult，`model_dump()` 得到 `{content,finishReason,usage}`。usage 存在时含 promptTokens/completionTokens/totalTokens，缺失为 null，不填假 0。预期供应商失败抛 ModelError（code/message/status/retryable），不返回 `{status:"failed"}`。非法输入抛 Pydantic ValidationError；取消传播 asyncio.CancelledError；程序缺陷不承诺转换为业务失败，由工作流入口统一兜底。

本服务参数范围：temperature 0～2、max_tokens 整数 1～8192；HTTP 字段叫 maxTokens，Python 函数字段叫 max_tokens。工作流 messages 为 system/user/assistant 字符串文本，1～100 条。官方 max_tokens 上限更大，8192 是本项目当前服务限制，不能当成供应商上限。固定为非思考模式：DeepSeek 官方使用 thinking.type=disabled，硅基流动使用 enable_thinking=false；暂不暴露思考模式参数。

默认模型为 DEEPSEEK_MODEL（硅基流动示例 deepseek-ai/DeepSeek-V3.2）；额外模型由 DEEPSEEK_ALLOWED_MODELS 逗号列表允许。不会自动把 AgentConfig.model 的旧名称重写为默认值。2026-10-22 当前账号 GET /models 实测可见 deepseek-flash、deepseek-v4-pro；只证明可发现，不证明生成成功。陈弘毅的 deepseek-chat 示例需一起校正。

### Provider 替换点

`RuntimeService(settings, knowledge=..., plugins=..., client=...)` 支持注入；FastAPI 可覆盖 get_runtime 依赖。KnowledgeContextProvider.get_context 接收 runId/actorId/agentId/knowledgeBaseIds/query/topK，返回 `{status,chunks:[{citation,content,score}]}`；citation 使用 knowledgeBaseId/documentId/chunkId/title/可选 position，拒绝未绑定知识库引用。禁止 Runtime 直接查询数据库。

PluginToolProvider 提供 list_tools(actorId,agentId,pluginIds) 和 execute(ToolRequest)，成功结果为 toolCallId/toolName/status=succeeded/output，失败为 status=failed/error。已提供 HttpPluginProvider 的列表与直接执行适配；Runtime 自动工具循环仍未启用，即使拉到真实插件列表也不会自动执行。

## 运行与验证

从根目录激活 `.venv/Scripts/Activate.ps1`，或直接使用 `.venv/Scripts/python.exe`。环境变量：DEEPSEEK_API_KEY、DEEPSEEK_BASE_URL、DEEPSEEK_MODEL、DEEPSEEK_ALLOWED_MODELS、INTERNAL_SERVICE_TOKEN、MODEL_TIMEOUT_SECONDS（默认60）、RUN_TIMEOUT_SECONDS（180）、CONTEXT_TOKEN_LIMIT（32768）。真实凭据只在本地 .env，不进入文档/消息/提交。

```powershell
$env:PYTHONPATH='apps/agent'
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
./.venv/Scripts/python.exe -m pytest apps/agent/tests -q
./.venv/Scripts/python.exe -m compileall -q apps/agent/app apps/agent/scripts
# 显式授权真实调用，最多三次；产生实际模型费用
./.venv/Scripts/python.exe apps/agent/scripts/smoke_runtime.py --live
```

已验证：25 项离线测试通过（含健康检查）；Python 编译和 git diff --check 通过。覆盖中文逐字节 SSE、同帧内容/结束原因/usage、最终文本一致、无终态/坏格式、401/402/429/500、工作流成功/失败、历史排除与成对裁剪、知识桩替换和越界引用、未配置 Provider、首段先于完成返回、模型/整轮超时、客户端断开上游关闭、HTTP 鉴权与校验。Starlette/AnyIO 存在一条弃用警告，不影响本次测试结果。

真实验收：临时本机 HTTP 服务已启动并调用真实 DeepSeek；第一次生成返回 HTTP 402。GET /models 成功；GET /user/balance 成功且 is_available=false。未取得真实 Token 增量，因此未声称真实 run/stream 或工作流模型成功，也未宣称网页/公开 API 联调通过。脚本失败后临时服务已清理，不自动反复消耗模型调用。

官方依据：[首次调用](https://api-docs.deepseek.com/zh-cn/)、[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)、[错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)。HTTP 402 官方定义为余额不足。

## 当前问题

真实模型硬目标受账号余额不可用阻塞；需用户/账号维护者补充余额或提供可用凭据，然后重跑显式 live 脚本。普通本地启动还需配置 INTERNAL_SERVICE_TOKEN（验收脚本使用临时随机值）；不将内部凭证写进联调消息。

主分支新地基已接入，个人分支已发布，可供其他成员拉取。真实知识库、插件、Agent 配置及聊天/公开 API 业务代码仍未集成到本次 Runtime 链路；团队 integration 分支未建立。不得把地基合并或本地测试记录写成团队业务联调成功。

## 需要联调成员

| 成员 | 联调部分与验收目标 |
| --- | --- |
| 陈弘毅 | 冻结9字段 AgentConfig，revision=0；模型名称与允许列表对齐；由 NestJS 聊天模块读取配置后传JSON到FastAPI，不让Python跨语言导入NestJS Service |
| 韦淇元 | 网页/公开API共用内部stream；可信用户与消息ID、历史、取消传播、保存后completed、引用投影与内部凭证 |
| 康雨萱 | app.runtime.call_model 的参数、ModelResult、ModelError/ValidationError/取消语义；由工作流映射节点状态 |
| 管逸恬 | 注入真实KnowledgeContextProvider，至少一次检索调用验证；固定来源ID与资源权限 |
| 朱晋亨 | Tool定义、结构化output/error能够被契约消费；本周不要求自动Tool Call |

本次交付不修改其他成员模块；联调待真实服务/代码与凭据齐备后记录结果。


## 2026-10-24 Provider 与硅基流动更新

已对照管逸恬集成分支 integration/week2-rag-auth-agent 的42c6a1e复用检索选择规则：topK固定5且是每库上限，最多10库/50条候选；按来源三元组去重保留最高分，按score和来源ID确定性排序，只取能放入12,000字符参考文本预算的完整片段。没有完整片段可放入时明确报告预算不足，不把HIT伪装为NO_HIT。KnowledgeResult.chunks上限改为50。

知识库HTTP请求为POST /internal/knowledge/retrieval（无/api前缀），使用INTERNAL_SERVICE_TOKEN；HIT/NO_HIT与hits映射matched/no_match及chunks，documentTitle映射citation.title，position可选。401/403保留鉴权/权限失败，其他HTTP/外壳/超时失败不变成no_match。应用通过BACKEND_SERVICE_URL定位NestJS；默认http://localhost:3000。

插件HTTP查询使用重复pluginIds参数，按{code,message,data}解包；execute保留结构化output或failed/error，不将HTTP200等同业务成功。PLUGINS_SERVICE_TOKEN通过x-plugin-service-token发送，缺失时拒绝调用，不沿用对方本地免凭证模式。PROVIDER_TIMEOUT_SECONDS默认15秒，并受整轮预算限制。JWT/服务鉴权、真实插件端到端和自动调用仍需联调。

模型供应商支持MODEL_PROVIDER=deepseek/siliconflow；硅基流动官方域名会自动识别，沿用现有DEEPSEEK_*配置字段与工作流函数。已将本地非敏感地址/模型修正为https://api.siliconflow.cn/v1、deepseek-ai/DeepSeek-V3.2；密钥未改动。MODEL_TRUST_ENV默认true，本机代理连接失败、直接HTTPS连接成功，因此本地设为false。

真实验证：硅基流动GET /models返回200，列表包含DeepSeek-V3.2；真实生成返回HTTP402、平台code=30001、明确余额不足。未取得真实增量，不宣称模型生成已通过。该结果与管逸恬在其独立集成环境已完成的单库检索与模型回答分开记录。没有复用她本地数据库的资源ID或Token。

官方依据：https://api-docs.siliconflow.cn/docs/userguide/introduction 与其Chat Completions接口文档。

最终离线验证：pnpm typecheck 与 pnpm test 通过，前端3项、后端1项、Python45项；Python侧保留已知Starlette/AnyIO弃用警告。未新增项目依赖，真实硅基流动生成未通过的原因如上。


## 2026-10-25 最新联调结论

依据管逸恬最新回复，聊天侧按 `{status,citations}` 接收 knowledge.result；本分支已同步这一事件格式。Provider仍在内部返回chunks用于模型参考，上下文预算校验通过后才发送来源事件；预算失败不提前公告未使用的来源。matched返回实际纳入参考上下文的来源，no_match返回citations=[]，不传chunks、片段正文或score。真实NestJS SSE转发尚待联调，不能将本地事件测试算成页面已接通。

复用集成分支9224624的通用OpenAI兼容网关适配与两项Mock回归：新增MODEL_PROVIDER=openai_compatible，通用模式不发送thinking/enable_thinking或供应商专有stream_options。显式供应商配置优先，未显式指定时按官方域名识别DeepSeek/硅基流动，其余地址按通用协议处理。未更改本地.env、密钥、网关或模型选择，不自动重试；同事使用个人网关的成功/超时记录不作为本机验证结果。

本轮49项Python测试通过；新增验证引用事件不含正文、正文仍进入模型上下文、no_match空来源、预算拒绝不公告来源，以及通用网关run/stream参数。插件仍沿用服务凭证调用，未提前实现自动Tool Call或替代插件模块的组合Guard。
