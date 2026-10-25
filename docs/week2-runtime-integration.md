# MiniCoze Week 2｜Runtime 联调记录

## 联调范围

王一恒负责 Runtime，陈弘毅负责 Agent 配置，韦淇元负责聊天/公开 API，康雨萱负责工作流，管逸恬负责检索，朱晋亨负责插件。目标链路是配置快照 → Runtime → DeepSeek → 统一事件 → NestJS 持久化；工作流复用单次函数。

## 使用的代码

个人分支：`codex/feature/wangyiheng/agent-runtime`，初次实现65f0428已推送。2026-10-23接入main的a665b2a（模块化地基）：README保留双方内容，Runtime HTTP层迁至app/api/runtime.py，经统一api_router注册；根目录.env加载、日志和新的Node/Prisma工具链沿用主分支。未创建多人integration分支，也未合入其他业务分支，不能当成团队业务联调已完成。

## 最终公共契约

Runtime 本地实现采用 POST /internal/runtime/run 和 /internal/runtime/stream，服务凭证鉴权。输入 RuntimeRequest、9字段 AgentConfig、成对 history；输出 RuntimeResult 或 AgentStreamEvent。具体请求/返回和错误示例见个人第二周文档“对外接口”。TypeScript 公共包本次未改动，跨模块采用前先由调用方确认差异。

工作流统一入口 `from app.runtime import call_model, ModelError`；成功是 ModelResult，不是 failed 状态对象；预期模型错误抛 ModelError，取消继续传播。字段 max_tokens（函数）/maxTokens（HTTP）有意区分。

必要更新：revision 接受0草稿；默认模型由旧示例改为当前官方/账号可发现的 deepseek-flash（调用方需同步确认，不隐式替换）；项目 max_tokens 限1～8192；新增明确余额错误 MODEL_QUOTA_EXCEEDED。短期历史沿用既有协议，长期记忆不进入本期。

## 联调结果

本地25项测试通过，模型和知识库替身均为显式测试注入；HTTP鉴权、run/stream形状、上下文、超时和断开释放已验证。知识库与插件生产桩不会返回伪造业务成功。

2026-10-23主分支合并后复验：Prisma客户端生成、根pnpm typecheck、pnpm test（前端3项、后端1项、Python25项）、pnpm build全部通过；使用已安装Node22.19.0，未修改依赖声明或锁文件，未执行数据库迁移。该结果验证地基兼容性，不能替代真实模型或跨成员业务验收。

真实DeepSeek：模型列表和余额接口可达，但生成HTTP402、is_available=false；因此真实流式硬目标尚未验收。网页/公开API、真实RAG、工作流执行器和插件服务均未做跨成员真实联调。

## 遗留问题

余额阻塞真实模型验收；本地INTERNAL_SERVICE_TOKEN尚需部署者配置。个人分支已发布；团队integration分支与其他业务代码尚未接入。模型命名和错误码需调用方确认。这些问题阻塞“团队链路已通过”的结论，不阻塞成员依据明确函数/DTO先完成适配和Mock测试。


## 2026-10-24 更新

Runtime分支补充HttpKnowledgeProvider和HttpPluginProvider：按当前NestJS外壳转换、服务身份头和明确失败语义接入应用；仍不启用自动Tool Call。已对照42c6a1e复用每库5条、最多50条候选、来源去重排序和完整片段预算规则。管逸恬集成环境的真实单库run验收不代表本分支已完成多库、stream或浏览器联调。

新增硅基流动模型参数与SSE统计帧兼容，保留工作流调用签名。当前本机GET /models成功，生成返回HTTP402/code30001余额不足，因此本次仍未通过真实生成验收。实际密钥未改动，非敏感地址/模型与代理设置已修正；凭据未进入提交。

本轮验证：根typecheck/test通过，前端3项、后端1项、Python45项。Provider覆盖HIT/NO_HIT、401/403、故障/超时、50条候选、去重和预算、重复插件查询参数与失败结果；均为明确注入HTTP替身，未冒充真实NestJS联调。


## 2026-10-25 最新联调结论

依据管逸恬最新回复，聊天侧按 `{status,citations}` 接收 knowledge.result；本分支已同步这一事件格式。Provider仍在内部返回chunks用于模型参考，上下文预算校验通过后才发送来源事件；预算失败不提前公告未使用的来源。matched返回实际纳入参考上下文的来源，no_match返回citations=[]，不传chunks、片段正文或score。真实NestJS SSE转发尚待联调，不能将本地事件测试算成页面已接通。

复用集成分支9224624的通用OpenAI兼容网关适配与两项Mock回归：新增MODEL_PROVIDER=openai_compatible，通用模式不发送thinking/enable_thinking或供应商专有stream_options。显式供应商配置优先，未显式指定时按官方域名识别DeepSeek/硅基流动，其余地址按通用协议处理。未更改本地.env、密钥、网关或模型选择，不自动重试；同事使用个人网关的成功/超时记录不作为本机验证结果。

本轮49项Python测试通过；新增验证引用事件不含正文、正文仍进入模型上下文、no_match空来源、预算拒绝不公告来源，以及通用网关run/stream参数。插件仍沿用服务凭证调用，未提前实现自动Tool Call或替代插件模块的组合Guard。
