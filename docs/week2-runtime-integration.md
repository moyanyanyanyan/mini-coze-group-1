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
