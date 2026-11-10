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

- UI 的 props 类型由所属 UI 模块定义；API 响应类型留在应用 API 层，不通过反向导入共享类型。
- 表格通过 `renderActions` 接收应用控制器，页面通过 `children` 接收创建流程；UI 不导入这些控制器。
- 公共布局通过 props 接收用户、导航和操作；认证请求、退出登录和跳转留在 web 适配层。
- 迁移时保留 DOM、类名、CSS、交互和错误处理。其他模块目前只替换公共组件引用，不代表其业务与 UI 已完成分离。
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
