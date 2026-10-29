# 用户身份契约：CurrentUser / AuthResponse

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0（草案，待确认） |
| 负责人 | 韦淇元（登录 / 用户 / 对话 / 发布模块） |
| 创建日期 | 2026-10-19 |
| 状态 | 🟡 **公开征求意见中**，确认后冻结，冻结后改动需在群内提 PR 式说明 |
| 落地位置 | `packages/shared/src/index.ts`（唯一权威来源） |
| 关联文档 | `docs/联调契约-NestJS调用Runtime-请求示例与规则确认.md`（错误格式、SSE 另行维护） |

---

## 1. 这份契约解决什么问题

MiniCoze 目前的四个业务方向都要"知道当前是谁"：

- **A 认证与用户**（韦淇元）：登录后要返回用户信息
- **Agent 管理**（陈弘毅）：要判断"这个 Agent 属于谁"
- **Agent Runtime**（王一恒）：收到的 `actor.id` 必须能反查到真实用户
- **知识库/插件/工作流**：都要按用户做数据隔离

如果每个模块各自定义一份"用户长什么样"，必然出现：一边叫 `name` 一边叫 `displayName`、一边用自增数字 id 一边用 uuid、甚至有人不小心把密码哈希返回出去。**这份契约的目的就是：一次定义，全组共用，机器强制检查。**

---

## 2. 类型定义（权威版）

```typescript
/** 登录后返回给前端的"用户身份"，全组所有模块统一用它。
 *  契约要点：id 就是用户表主键（uuid），Runtime 的 actor.id、Agent 归属校验都用它。 */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

/** 注册/登录接口的响应体：令牌 + 用户信息一起返回。 */
export interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}
```

> ⚠️ **修改此处必须重新构建**：改完 `packages/shared/src/index.ts` 后需执行
> `pnpm --filter @minicoze/shared build`。
> 因为 backend 引用的是 shared 编译后的 `dist` 产物，不 build 的话改动不可见。

---

## 3. 字段规范

### CurrentUser

| 字段 | 类型 | 必填 | 来源（数据库列） | 说明 |
|---|---|---|---|---|
| `id` | `string` | ✅ | `User.id` | 用户表**主键**，uuid v4。**跨系统的用户唯一标识**：Runtime 的 `actor.id`、Agent 归属校验、会话归属校验一律使用本字段，**不允许传自增序号或 Key ID** |
| `email` | `string` | ✅ | `User.email` | 登录账号，数据库层有唯一约束 |
| `displayName` | `string` | ✅ | `User.displayName` | 界面展示用昵称（右上角头像旁） |
| `avatarUrl` | `string` | ❌ 可选 | `User.avatarUrl` | 头像地址。**用户未设置时该字段直接不存在**，前端请用可选链 `user.avatarUrl ?? ''` 处理，不要假设它是空字符串 |

### AuthResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `accessToken` | `string` | JWT，有效期 7 天。前端存 localStorage，请求时放请求头 `Authorization: Bearer <token>` |
| `user` | `CurrentUser` | 同一份用户信息，避免前端登录后还要再请求一次 `/api/auth/me` |

---

## 4. 它会出现在这些地方

| # | 场景 | HTTP | 响应体 |
|---|---|---|---|
| 1 | `POST /api/auth/register` 注册成功 | 201 | `AuthResponse` |
| 2 | `POST /api/auth/login` 登录成功 | 200 | `AuthResponse` |
| 3 | `GET /api/auth/me` 获取当前用户（需携带 token） | 200 | **`CurrentUser` 本体**（不套一层包装） |

**示例 JSON**（接口 2 成功时）：

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "9b1e5c3a-7f42-4c1e-8d0f-2a6b1c4e9f00",
    "email": "weiqy@minicoze.dev",
    "displayName": "韦淇元"
  }
}
```

注意：上面这个例子里 `avatarUrl` 没出现，因为该用户没设头像。这就是"可选字段不输出"的实际样子。

---

## 5. 强制规则（全组必须遵守）

| 编号 | 规则 | 为什么 |
|---|---|---|
| **R1** | `passwordHash` **永远不得**出现在任何对外响应中 | 最高安全红线。所有返回用户对象的地方必须走 `UsersService.toCurrentUser()` 脱敏 |
| **R2** | 所有业务模块的"用户标识"字段统一用 `CurrentUser.id`，**不得**使用邮箱、昵称或自增数字做身份标识 | 保证跨模块 join、归属校验不会错配 |
| **R3** | Runtime 收到的 `actor.id` **必须等于** `CurrentUser.id`；公开 API 入口需先由 API Key **反查出 owner 的 userId** 再传，禁止把 Key ID 当用户 id | 已在《NestJS 调用 Runtime》v1.1.1 契约中确认 |
| **R4** | 前端不得自行猜测或本地构造用户对象，一律以服务端返回的 `CurrentUser` 为准 | 防止伪造身份绕过权限 |
| **R5** | 新增字段必须先改 shared 类型 → 通知全组 → 再实现，**禁止只在某一端偷偷加字段** | 契约的意义在于同步变更 |
| **R6** | `avatarUrl` 缺失时省略该字段，不返回 `null` 或空串 | 前后端处理逻辑统一，避免 `null` / `undefined` / `''` 三种状态混战 |

---

## 6. 各模块如何对接（一句话版）

| 负责人 / 模块 | 你需要知道的事 |
|---|---|
| **陈弘毅**（Agent 管理与能力绑定） | Agent 表的 `ownerId` 存的就是 `CurrentUser.id`（uuid）。做归属校验时用 `@CurrentUser() user` 取到的 `user.id` 去比对即可，不用再查邮箱 |
| **王一恒**（Agent Runtime） | `actor.id` 恒为用户主键 = `CurrentUser.id`，`actor.type` 只取 `user` / `api_key` 用于追踪。公开 API 入口的 `actor.id` 由 NestJS 侧反查后传入 |
| **管逸恬**（知识库与 RAG） | 知识库归属、检索结果引用中的用户维度，统一用 `CurrentUser.id` |
| **朱曾亨**（插件市场） | 插件调用鉴权上下文取 `@CurrentUser() user`，`user.id` 作为执行者标识 |
| **博美佳 / 康雨萱**（工作流） | 工作流归属与执行记录中的用户标识同上 |
| **前端（韦淇元）** | 登录后把 `accessToken` 存 localStorage，用 Axios 拦截器统一注入 `Authorization` 头；当前用户信息存前端状态，`GET /api/auth/me` 用于刷新 |

---

## 7. 代码示例

**后端（NestJS）：在 Controller 里拿到当前用户**

```typescript
import { CurrentUser as CurrentUserType } from '@minicoze/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Get('me')
@UseGuards(JwtAuthGuard)
async me(@CurrentUser() user: CurrentUserType) {
  return user; // 已经是脱敏后的 CurrentUser
}
```

`@CurrentUser()` 装饰器由认证模块提供，**全组引入路径固定为** `src/common/decorators/current-user.decorator`。

**前端（React）：请求头注入**

```typescript
// 登录成功后
localStorage.setItem('accessToken', res.accessToken);

// axios 拦截器
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

---

## 8. 待确认事项（请相关同学回复）

| # | 议题 | 对象 | 期望 |
|---|---|---|---|
| 1 | `CurrentUser` 是否需要增加 `createdAt`？目前倾向**不加**（首屏用不到，且会暴露内部信息） | 全组 | 无异议默认不新增 |
| 2 | `avatarUrl` 未来若改为走文件服务，是否需要同时给出 `avatarUrl` 与 `avatarKey`？ | 韦淇元 / 陈弘毅 | 后续迭代再定 |
| 3 | 是否需要 `role` / `plan` 等权限字段？本期 MVP **不做** RBAC | 全组 | 如需请在 v1.1 前提 |

---

## 9. 变更流程（冻结后生效）

1. 提出方在群里说明改动理由 + 影响面；
2. 相关模块负责人回复确认；
3. 修改 `packages/shared/src/index.ts` → `pnpm --filter @minicoze/shared build`；
4. **同步更新本文件的版本号与变更记录**，再通知全组。

---

## 变更记录

| 版本 | 日期 | 变更内容 | 修改人 |
|---|---|---|---|
| v1.0 | 2026-10-19 | 初稿：定义 CurrentUser 与 AuthResponse，明确 id 语义与 R1~R6 规则 | 韦淇元 |
