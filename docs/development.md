# 开发指南

## 模块放置

- 前端业务放在 `apps/web/src/features/<领域>`；可按需要创建 `pages`、`components`、`api`、`hooks` 和 `types.ts`。
- 已拆分的界面放在 `packages/ui/src/modules/<领域>`，仍由对应模块负责人维护。公共组件位于 `packages/ui/src/components`，纯交互 Hook 位于 `hooks`，主题位于 `theme`。
- NestJS 业务放在 `apps/backend/src/modules/<领域>`；DTO、错误、Repository 和测试跟随该领域。
- FastAPI 能力分别放入 `runtime`、`knowledge`、`workflow`，HTTP 路由只负责输入输出转换。
- 通用目录不能作为暂时无法分类代码的收容区。尚未出现两个真实调用方时，代码留在原模块。

NestJS 模块增长后使用以下结构：

```text
modules/agents/
├─ agents.module.ts
├─ agents.controller.ts
├─ agents.service.ts
├─ agents.repository.ts
├─ dto/
├─ errors/
└─ agents.service.spec.ts
```

不要为了目录完整而创建空文件夹。

## UI 拆分样板

API 管理模块的页面装配位于 `apps/web/src/features/publish-sdk/api-management/pages/ApiKeyManagementPage.tsx`，创建和行操作控制器位于同模块的 `components`；这些控制器保留请求、校验、通知和一次性密钥生命周期。对应视图位于 `packages/ui/src/modules/publish-sdk/api-management`，只接收状态和事件回调。

认证模块由 `apps/web/src/features/auth/LoginPage.tsx` 和 `RegisterPage.tsx` 保留表单状态、校验、认证请求、OAuth 错误读取和跳转。登录、注册、字段及品牌布局位于 `packages/ui/src/modules/auth`，链接由应用注入。

智能体模块由 `apps/web/src/features/agent-builder/AgentBuilderPage.tsx` 装配，`AgentListController` 维护查询、分页和删除，`CreateAgentController` 维护创建校验，`AgentDetailController` 维护草稿、版本请求和绑定规则。视图、绑定选择器和 CSS 位于 `packages/ui/src/modules/agent-builder`。模型选项由应用传入，选择器只上报 ID；启用状态、知识库配置保留、防重提交和旧版本请求隔离均由控制器处理。

插件模块的目录请求、分类映射和搜索筛选保留在 `apps/web/src/features/plugins/PluginsPage.tsx`；目录页、卡片和图标位于 `packages/ui/src/modules/plugins`。已有 `ToolTestModal` 保留参数转换和执行请求，展示交给 `ToolTestView`；插件卡片仍只展示工具信息，不提供直接测试入口。

知识库由 `apps/web/src/features/knowledge/KnowledgePage.tsx` 保留工作区身份、请求、文档处理轮询、上传清理、删除确认和检索请求隔离。`packages/ui/src/modules/knowledge/KnowledgeView.tsx` 按目录、文档、切片和检索四组状态接收数据及回调。文档操作只上报 ID，应用查找对应业务记录；文件输入 ref 用于成功上传后的清理，确认弹窗由应用通过插槽传入。


智能体聊天的消息、会话和 SSE 请求由 `apps/web/src/features/agent-chat/AgentChatPage.tsx` 管理，`AbortController`、增量内容追加、最终消息替换和旧请求隔离继续留在应用。`packages/ui/src/modules/agent-chat` 维护聊天视图、输入框、智能体切换器及滚动/抽屉交互；路由链接和确认弹窗由应用注入。

工作流由 `apps/web/src/features/workflow-editor/components` 下的 `WorkflowListController`、`WorkflowEditorController`、`RunDialogController` 和 `LoopBodyController` 管理业务状态、序列化、连线约束、保存、校验及执行。`packages/ui/src/modules/workflow-editor` 维护列表、画布、节点/配置面板、变量选项展示、运行与校验结果以及 CSS。运行弹窗和循环体控制器通过插槽装配，UI 不调用 API；UI 展示契约与应用 DTO 分开维护。React Flow 继续使用现有版本，UI 包声明直接依赖，应用保留画布状态 hooks。

工作流的 `PropertyPanelController` 与 `ConditionPanelController` 负责上游字段解析、循环体候选、按类型筛选输出、条件运算符和数量限制；图遍历与变量语义位于 web 的 `utils/upstream.ts`，运算符规则位于 `utils/condition-rules.ts`。UI 只接收字段选项、条件行展示状态和操作回调；属性面板以插槽接入主画布和循环体。节点输出展示字段只附加到渲染数据，不写入草稿。

- UI 的 props 类型由所属 UI 模块定义；API 响应类型留在应用 API 层，不通过反向导入共享类型。
- 表格通过 `renderActions` 接收应用控制器，页面通过 `children` 接收创建流程；UI 不导入这些控制器。
- 公共布局通过 props 接收用户、导航和操作；认证请求、退出登录和跳转留在 web 适配层。
- 迁移时保留 DOM、类名、CSS、交互和错误处理。当前入口使用的模块界面已迁入 UI 包，web 保留控制器、路由装配和 `AppLink` 链接适配。
- UI 包直接导出源码，由当前 Vite 应用编译；React/React DOM 声明为 peer dependencies。该包不单独发布或生成 dist。

相关验证：

```powershell
pnpm --filter @minicoze/ui typecheck
pnpm --filter @minicoze/ui test
pnpm --filter @minicoze/web typecheck
pnpm --filter @minicoze/web test
pnpm --filter @minicoze/web build
```

UI 包的边界测试检查生产源码的导入方向和网络调用；新增允许依赖时需确认其仅承担界面职责。UI 视图测试不依赖后端和路由。浏览器回归需要覆盖密钥创建、一次性展示、复制失败、重命名、删除、404、列表刷新失败，以及桌面和窄屏布局。

认证模块还需覆盖表单校验、邮箱规范化、服务端与网络错误、提交状态、Google 整页跳转入口和一次性 OAuth 错误。智能体模块需覆盖搜索筛选分页、创建保存、发布撤回与删除确认、绑定失败重试和配置保留、版本详情关闭后的旧请求隔离，以及窄屏预览抽屉。

插件需覆盖目录加载、工具信息展开、分类与搜索组合、清空筛选、空目录、异常响应及重试。知识库需覆盖文档轮询与重试、切片分页、文本和文件录入及失败后保留输入、成功后清空文件、检索结果与错误、切换资料库或删除文档后的旧检索隔离、停用启用、创建删除确认和窄屏布局。

聊天回归需覆盖分段 SSE、最终消息替换、检索引用、失败提示、停止后的传输取消和部分内容保留、旧会话请求隔离、滚动跟随及移动端抽屉。工作流回归需覆盖草稿保存后校验再运行、保存或校验失败阻断执行、输入类型转换、执行失败/结果复看、连线端口与导出、循环体完成/取消、未保存离开确认、列表增删改查及窄屏画布。

工作台由 `apps/web/src/features/workspace/WorkspacePage.tsx` 保留资源请求、最近更新排序/截取、失败重试和卸载后的请求隔离；`packages/ui/src/modules/workspace` 接收展示条目及生成好的链接。首页由 `apps/web/src/features/landing/LandingPage.tsx` 将功能注册表映射为展示数据，`packages/ui/src/modules/landing` 维护页面和样式。

SDK 文档由 `apps/web/src/features/publish-sdk/sdk-docs/pages/SdkDocsPage.tsx` 注入应用链接组件与 API 管理路由。静态文档、示例、代码高亮、复制反馈、目录滚动交互和原有测试位于 `packages/ui/src/modules/publish-sdk/sdk-docs`；这些示例只展示，不发起 Run/Stream 请求。

工作台回归需覆盖时间排序、最多五条、资源 ID 编码、快捷创建/编辑/对话链接、加载/空/错误/重试和卸载。首页需覆盖模块顺序、入口链接、认证跳转和未知路径回落。SDK 文档需覆盖示例切换、复制文本与计时器、剪贴板拒绝或不可用、目录锚点和 API 管理跳转。三个模块均比较桌面与窄屏布局。

### UI 边界审计（2026-11-11）

从 `main.tsx` 经 `App.tsx`、功能注册表及其导入链核对，当前启用的 `features` 中没有残留原生页面 JSX 或 CSS；`shared/routing/AppLink.tsx` 的原生链接用于路由适配，保留在应用。UI 包的边界测试继续检查反向导入与业务网络调用。

已删除当前入口未引用的旧 `pages` 页面、`components/layout` 布局、菜单配置及相关 CSS。当前页面由 `features` 控制器与 `packages/ui` 视图组成；旧个人工作记录中的原型路径仅用于历史追溯。

SDK 文档目录高亮监听文档最近的纵向滚动容器，无容器时使用窗口；章节位置和底部判断采用同一容器的坐标。回归需覆盖滚动、目录点击、返回顶部、窗口缩放与锚点历史导航。

## Prisma 协作

- datasource 和 generator 只在 `prisma/schema.prisma` 维护。
- 业务字段确认后，负责人再创建并维护 `prisma/schema/<领域>.prisma`；地基不预置业务模型。
- 领域分支不提交并行生成的 migration；Schema 合入集成分支后统一运行 `pnpm --filter @minicoze/backend prisma:migrate`。
- Migration 必须使用可读名称并由组长或指定集成人员审核。
- Embedding 模型和维度确认后再定义 pgvector 字段；向量索引和相关 SQL 通过受控 migration 管理。

## 公共契约

- DTO、事件、错误码和领域类型默认留在所属模块。
- 只有参与方已确认、并且至少被两个 TypeScript 应用实际消费的稳定类型才进入 `packages/shared`。
- 个人工作文档或协作草案不能直接作为冻结契约写入地基。
- 契约尚未统一时，不创建占位类型，也不提前兼容多套方案。

## 常用命令

```powershell
pnpm --filter @minicoze/backend prisma:validate
pnpm --filter @minicoze/backend prisma:generate
pnpm typecheck
pnpm build
pnpm test
docker compose config --quiet
```

运行根目录 Python 命令前应已创建 `.venv`。根脚本固定调用 `.venv\Scripts\python.exe`，避免误用未安装依赖的系统 Python。

## 提交前检查

1. 只修改自己负责的领域和已对齐的公共契约。
2. 不提交 `.env`、API Key、密码、Token、数据库数据或缓存。
3. 运行与改动相关的最小测试，再运行根 typecheck。
4. 检查 `git status` 与 `git diff`，移除无关格式化和临时文件。
