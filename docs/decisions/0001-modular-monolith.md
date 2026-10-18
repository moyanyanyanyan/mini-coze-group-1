# 0001：模块化单体与三层服务边界

状态：已采用

## 决策

- 保持 React、NestJS、FastAPI 三层结构，不拆分更多微服务。
- NestJS 使用按业务领域纵向拆分的模块化单体。
- PostgreSQL 和 pgvector 只由 NestJS 通过 Prisma 或受控 SQL 访问。
- FastAPI 通过明确的内部接口获取 Agent 配置、知识上下文和工具结果。
- 前端和 NestJS 共享的冻结契约放在 `packages/shared`，运行时实现保持独立。

## 原因

该结构让七名模块负责人拥有相对独立的修改区域，同时保留单仓库联调和统一部署的简单性。它也避免 Python 与 TypeScript 同时写数据库造成的数据规则分叉。

## 约束

- 模块之间不得导入内部 Repository 或 DTO。
- 公共契约变更必须同步修改生产者、消费者、测试和文档。
- 只有出现实际部署或伸缩需求后，才重新评估微服务拆分。
