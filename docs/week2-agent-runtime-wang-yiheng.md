# MiniCoze Week 2｜王一恒：Agent Runtime

记录日期：2026-10-22。依据项目实施方案 revision 1258 的 Week 2 分工及个人/联调文档模板。当前为本地代码交付及验证记录，不代表多人远程联调已通过。

## 完成内容

已实现内部 HTTP run/stream、DeepSeek 非思考文本调用、SSE 增量解码、统一事件、历史校验及成对裁剪、模型与总运行超时、断开清理、服务间鉴权，以及工作流可直接调用的异步函数。run 聚合同一流式执行逻辑，不另造第二套聊天实现。

短期记忆消费 NestJS 提供的已完成历史；只接收 user/assistant 完整问答对，最多 20 条，排除本轮消息 ID。历史状态过滤、contextLimit 选择、数据库存储和会话权限属于聊天模块；Runtime 做最终上下文预算。预算以 UTF-8 字节数加协议余量作保守上界估算，不宣称精确 tokenizer 计数；先丢最旧整对，仍超预算则失败。

知识库和插件仅提供可替换 Protocol 与未配置桩。无绑定时可直接对话；有绑定而 Provider 未接入时明确失败，不伪造检索命中/未命中。知识库 Stub 注入与引用消费已离线验证；真实检索、自动 Tool Call 和完整绑定体验待后续联调。长期记忆不进入本期 MVP，不增加其字段、接口或 UI。

## 代码说明

个人分支：`codex/feature/wangyiheng/agent-runtime`。团队分支样例使用 feature/姓名/内容，本机按 Codex 分支约定增加 codex/ 前缀。分支仅在本地，尚未提交或推送。

| 路径 | 职责 |
| --- | --- |
| apps/agent/app/runtime/schemas.py | 请求、结果、历史、知识库与插件契约 |
| apps/agent/app/runtime/deepseek.py | 单次调用与供应商事件流读取 |
| apps/agent/app/runtime/service.py | 上下文、Provider 注入与运行事件 |
| apps/agent/app/runtime/routes.py | 内部鉴权、run/stream、心跳、取消及 HTTP 错误 |
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
    "systemPrompt": "简洁回答", "model": "deepseek-flash",
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

NestJS 负责鉴权和持久化：将 actor.id 解析为登录用户/API Key 所有者，组装已授权 AgentConfig 与历史；内部 knowledge.result 的正文/分数必须投影后才能发给外部；收到 run.completed 后先保存，再向客户端宣布完成。失败、取消、无终态断流均不能存成 completed。

### 工作流公共函数

在 FastAPI Python 环境中导入，不从 NestJS 直接导入 Python，也不通过聊天接口触发工作流持久化：

```python
from app.runtime import call_model, ModelError

try:
    result = await call_model(
        model="deepseek-flash",
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

本服务参数范围：temperature 0～2、max_tokens 整数 1～8192；HTTP 字段叫 maxTokens，Python 函数字段叫 max_tokens。工作流 messages 为 system/user/assistant 字符串文本，1～100 条。官方 max_tokens 上限更大，8192 是本项目当前服务限制，不能当成供应商上限。固定 thinking.type=disabled，暂不暴露思考模式参数。

默认模型为 DEEPSEEK_MODEL（示例 deepseek-flash）；额外模型由 DEEPSEEK_ALLOWED_MODELS 逗号列表允许。不会自动把 AgentConfig.model 的旧名称重写为默认值。2026-10-22 当前账号 GET /models 实测可见 deepseek-flash、deepseek-v4-pro；只证明可发现，不证明生成成功。陈弘毅的 deepseek-chat 示例需一起校正。

### Provider 替换点

`RuntimeService(settings, knowledge=..., plugins=..., client=...)` 支持注入；FastAPI 可覆盖 get_runtime 依赖。KnowledgeContextProvider.get_context 接收 runId/actorId/agentId/knowledgeBaseIds/query/topK，返回 `{status,chunks:[{citation,content,score}]}`；citation 使用 knowledgeBaseId/documentId/chunkId/title/可选 position，拒绝未绑定知识库引用。禁止 Runtime 直接查询数据库。

PluginToolProvider 提供 list_tools(actorId,agentId,pluginIds) 和 execute(ToolRequest)，成功结果为 toolCallId/toolName/status=succeeded/output，失败为 status=failed/error。此周只有契约和显式未接入桩；即使注入真实插件列表，也不会自动开始工具循环。

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

真实知识库、插件、Agent 配置及聊天/公开 API 代码尚未在本地分支集成。远程联调分支未建立，个人分支也未推送，因此其他成员尚不能从远程拉取本次实现。不得把本地测试记录写成团队联调成功。

## 需要联调成员

| 成员 | 联调部分与验收目标 |
| --- | --- |
| 陈弘毅 | 冻结9字段 AgentConfig，revision=0；模型名称与允许列表对齐；由 NestJS 聊天模块读取配置后传JSON到FastAPI，不让Python跨语言导入NestJS Service |
| 韦淇元 | 网页/公开API共用内部stream；可信用户与消息ID、历史、取消传播、保存后completed、引用投影与内部凭证 |
| 康雨萱 | app.runtime.call_model 的参数、ModelResult、ModelError/ValidationError/取消语义；由工作流映射节点状态 |
| 管逸恬 | 注入真实KnowledgeContextProvider，至少一次检索调用验证；固定来源ID与资源权限 |
| 朱晋亨 | Tool定义、结构化output/error能够被契约消费；本周不要求自动Tool Call |

本次交付不修改其他成员模块；联调待真实服务/代码与凭据齐备后记录结果。
