# Runtime 图片 v0.2 联调实现

分支 `codex/runtime-chat-images`，基于 `codex/integration/global-prompt@1e48a1d`，保留全局 Prompt 和已有回归。本文不表示 NestJS 上传/存储或网页端到端已实现。

## 请求与时序

`POST /internal/runtime/preflight` 沿用内部 Bearer，body 为 `{agentConfig, images:[{id,mimeType,width,height,byteSize}]}`；`agentConfig` 为完整现有配置。无图片也可校验模型配置。成功 `204` 无 body；失败沿用 `{statusCode,message,path,timestamp}` 和 `X-Runtime-Error-Code`。只验证准确模型连接和图片元数据，不调用供应商或取图、不校验图片归属、不占用图片。

`POST /internal/runtime/stream` 保留现有字段，新增顶层 `images` 及 `history[].images`，默认空数组。引用严格为 `{id,mimeType}`，ID 仅字母、数字、下划线和短横线；MIME 为 PNG/JPEG/WEBP 对应标准 MIME。重复图片 ID 拒绝；历史助手不能带图。文字为空只在该用户消息带图时允许，历史完整问答对、最多 20 条及 ID 约束不变。`agentConfig.systemPrompt` 不改名，已独立实现的 `globalPrompt` 继续可选，不因图片功能删除。

NestJS 开流前检查暂存图片与会话归属、存储可读性，选定一次完整历史，向 preflight 提供同一批图片元数据。通过后事务绑定并创建消息，再开 SSE。Runtime 开流后取已绑定图片；失败以 `run.failed` 终止，不丢图继续，不返回 `run.completed`。所有现有 SSE 事件与信封保持不变，不带图片字节/base64。非流式 `/internal/runtime/run` 带本轮或历史图片返回 `422 IMAGE_STREAM_ONLY`。

## 读取与模型

Runtime 使用固定 `BACKEND_SERVICE_URL`（否则 `BACKEND_ORIGIN`）追加 `/internal/chat/images/:id`；请求头包含内部 Bearer、`X-Actor-Id`、`X-Conversation-Id`、`X-Request-Id`。不跟随重定向。NestJS 必须校验已绑定消息所属会话及所有者，越权统一 404。内部令牌绝不用于供应商请求。

默认整张下载超时 10 秒，可用 `IMAGE_FETCH_TIMEOUT_SECONDS` 配置。校验 Content-Length 与实际累计字节、Content-Type、真实格式、完整解码和像素；首期拒绝动画、不转码 WEBP。采用已安装 Pillow 并显式声明直接依赖 `Pillow==13.0.0`，没有升级运行环境依赖。

目前只放行准确连接 `https://api.siliconflow.cn/v1` + `deepseek-ai/DeepSeek-V4.1-Flash`，包括该地址的模型管理 `openai_compatible` 连接；未知地址或模型、V3.2 均保守拒绝。不能仅凭 supportsVision 或协议类型放行。图片和文字按原顺序进入 user content parts，纯文字及 system 仍是字符串，仅图片省略空 text part。仅图片不调用空查询的知识库检索。

## 资源与错误

每轮当前+历史最多 6 张、每张最多 5 MiB、2000 万像素是产品保护阈值，不是供应商已验证的容量保证。视觉 token/最坏费用未定；文本预算与图片资源检查分开，不用 base64 长度冒充视觉 token。供应商仍可能拒绝其上下文预算。带图请求及工具往返超出本地文本预算返回 `IMAGE_CONTEXT_LIMIT`，不二次裁剪 NestJS 选定的历史。不可据本实现开放未经验证的大图范围。

- schema、重复 ID：400 `INVALID_REQUEST`。
- 不支持的模型连接：422 `MODEL_VISION_UNSUPPORTED`。
- 图片张数/本地上下文预算：422 `IMAGE_CONTEXT_LIMIT`。
- 字节上限：413 `IMAGE_TOO_LARGE`；像素上限：422 `IMAGE_PIXEL_LIMIT`。
- 格式/MIME/动画：415 `IMAGE_UNSUPPORTED`；损坏：415 `IMAGE_DECODE_FAILED`。
- 取图失败：`IMAGE_FETCH_FAILED`；网络超时/5xx 可重试，404/403/重定向/无效长度不可自动重试。已开流时 HTTP 为 200，只通过终态传错误；不回滚已绑定消息。
- 非流式图片：422 `IMAGE_STREAM_ONLY`。

NestJS 仍需补 ErrorCode 白名单及 projectPublicEvent 映射，不能将这些码都归为 MODEL_ERROR。

## 2026-11-26 验证

- `PYTHONPATH=apps/agent .venv/bin/python -m pytest apps/agent/tests -q`：196 项通过，含 24 项新图片用例和全部既有 172 项。覆盖元数据预检、不支持模型、无图空消息、重复/越权形态、下载403/404/302/500、超时、声明/实际字节限制、损坏/MIME/像素、取消、工具往返、历史顺序、不静默裁剪、仅图片跳过空知识库查询及无 base64 SSE 泄漏。
- `PYTHONPATH=apps/agent .venv/bin/python apps/agent/scripts/smoke_images.py`：真实 Runtime SSE 路由与真实 SiliconFlow 模型，7 项（单 PNG、按序两图、仅图片、WEBP、JPEG、历史图片追问、图片+工具往返）全部通过。取图用 MockTransport、工具为无副作用本地 report，明确不是 NestJS 或网页端到端验收。
- 同期集成分支相关后端 5 suites / 72 项、前端 10 files / 34 项通过。最初 HTTP 测试因沙箱禁止监听失败，允许本机监听后通过。未重跑真实数据库迁移；迁移成功和公开 API 真实验收另有李想反馈，不混作本轮证据。

NestJS 尚未交付附件实现；当前分支不解除前端附图发送禁用，不创建/合并 PR，不修改 main。
