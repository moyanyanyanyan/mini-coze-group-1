# A7 Google 登录 — 分支树（代码分支 + 知识分支）

> 这份不是新方案，是把 `A7-Google登录-方案与计划-韦淇元.md` 里第 1~8 块**按"分支"重排**，让你看清"一共要动几处、谁依赖谁、每处背后要懂什么"。
> 代码分支树的叶子 = 一次能写完的最小单元（对应教学上的"一块"）。

---

## 一、代码分支树（写什么）

```
A7 Google 登录
│
├─① 数据层
│   ├─ 1.1  schema.prisma：User 加 googleId String? @unique
│   │                      passwordHash 改 String?
│   ├─ 1.2  migration（生成 + 应用）
│   └─ 1.3  users.service：新增 createOAuthUser()、login 侧判空 passwordHash
│
├─② 配置层
│   ├─ 2.1  .env / .env.example：GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL / AUTH_GOOGLE_MOCK
│   └─ 2.2  env.validation.ts：四项全部 @IsOptional()（不能必填）
│
├─③ Provider 层（OAuth 协议本身）
│   ├─ 3.1  OAuthProvider 接口（我们自己的契约，就三个方法）
│   │        buildAuthorizeUrl(state) / exchangeCode(code) / fetchProfile(accessToken)
│   ├─ 3.2  MockOAuthProvider ← 先做这个，能跑通全链路
│   └─ 3.3  GoogleOAuthProvider ← 后做，改环境变量即可替换
│            ├─ 3.3.1 buildAuthorizeUrl  拼 accounts.google.com/o/oauth2/v2/auth
│            ├─ 3.3.2 exchangeCode       POST oauth2.googleapis.com/token
│            └─ 3.3.3 fetchProfile       GET  www.googleapis.com/oauth2/v3/userinfo
│
├─④ 业务层（认人规则）
│   └─ 4.1  AuthService.loginWithGoogle()
│            ├─ 4.1a 按 googleId 命中      → 直接登录（老用户复访）
│            ├─ 4.1b 按 email 命中         → 补写 googleId → 登录（首次绑定）
│            └─ 4.1c 都没命中              → 新建 User（passwordHash = null）
│   └─ 4.2  email_verified 校验 + 新增三个错误码
│
├─⑤ 接入层（HTTP 边界）
│   ├─ 5.1  GET /api/auth/google           生成 state → 写短效 Cookie → 302 去 Google
│   └─ 5.2  GET /api/auth/google/callback  比对 state → 换 token → 取资料 → 登录 → 302 回前端
│
└─⑥ 前端层
    ├─ 6.1  GoogleButton（整页跳转，不是 fetch）
    ├─ 6.2  登录页挂上按钮 + 接住 ?error= 提示
    └─ 6.3  登录成功落点复用现有 /workspace，不新建页面
```

---

## 二、知识分支树（懂什么）

```
A7 需要的前置知识
│
├─协议层（OAuth 2.0）
│   ├─ 四个角色：用户 / 我们的应用 / Google 授权服务器 / Google 资源服务器
│   ├─ 授权码流程四步（跳出去 → 同意 → 带 code 回来 → 换 token）
│   ├─ 为什么要有 code 这层中间商（token 走 URL 会泄露）
│   ├─ scope = openid email profile（只拿邮箱和头像昵称）
│   ├─ state：防登录劫持，随机 + 存本地 + 回调比对  ★ 必懂
│   └─ PKCE（了解即可，机密客户端非强制）
│
├─平台层（Google 侧）
│   ├─ Cloud Console 三件套：项目 / OAuth 同意屏幕 / 凭据
│   ├─ redirect URI 必须白名单且**一字不差**
│   ├─ 未发布应用只有 Test users 能登录  ★ 最容易漏
│   ├─ 四个字段：sub / email / email_verified / picture
│   └─ 两个端点：token 交换、userinfo
│
├─我们自己的栈（已有基础，只需串起来）
│   ├─ JWT 签发（buildAuthResponse 直接复用）
│   ├─ HttpOnly Cookie 下发（setAuthCookie 直接复用）★ 不用改
│   ├─ 同站 vs 跨域：3000↔5173 跨域但同站，端口不参与 SameSite 判定
│   └─ NestJS 里怎么 302：@Res() 手动 res.redirect()，别 return 对象
│
└─数据层
    ├─ Prisma 字段可空（String?）与唯一约束（@unique）
    ├─ migration 实际做了什么：DROP NOT NULL / ADD COLUMN / CREATE UNIQUE INDEX
    └─ 唯一冲突 P2002：并发首次登录要兜住（try/catch 后重查一次）
```

---

## 三、依赖与实施顺序（拓扑序）

```
① 数据层 ──→ ② 配置层 ──→ ③.1 接口 ──→ ③.2 Mock ──→ ④ 业务 ──→ ⑤ 接入 ──→ ⑥ 前端
                                                                              │
                                                   ③.3 真 Google ←── 最后替换 │
                                                                              ↓
                                                                        端到端实测
```

| 顺序 | 分支 | 能不能独立验证 | 验证方式 |
|---|---|---|---|
| 1 | ① 数据层 | ✅ | `prisma migrate status` + 表里能看到 `googleId` |
| 2 | ② 配置层 | ✅ | 后端能启动（没凭据也不崩） |
| 3 | ③.1 + ③.2 | ✅ | 单元里调 Mock，返回固定假用户 |
| 4 | ④ 业务层 | ✅ | 三种分支各造一次数据，看是否按 4.1a/b/c 走 |
| 5 | ⑤ 接入层 | ✅ | 浏览器点头后能 302 回 `/workspace`（Mock 模式） |
| 6 | ⑥ 前端层 | ✅ | 页面上点按钮能登录 |
| 7 | ③.3 真 Google | ✅ | 改 `.env` 一行，不碰代码，重跑第 5、6 步 |

**关键：③.3 放最后，且必须做到"只改环境变量就能切"。** 如果换真 Google 需要改代码，说明 ③.1 的接口没抽象对，回去改接口。

---

## 四、和上次 8 块计划的映射

| 上次的块 | 这里的分支 |
|---|---|
| 第 1 块 | ① |
| 第 2 块 | ② |
| 第 3 块 | ③.1 + ③.2 |
| 第 4 块 | ③.3 |
| 第 5 块 | ④ |
| 第 6 块 | ⑤ |
| 第 7 块 | ⑥ |
| 第 8 块 | 第三节的"端到端实测" |

---

## 五、一共动几个文件（心里有个数）

| 类型 | 文件 | 数量 |
|---|---|---|
| 改 | `prisma/schema.prisma` + 新 migration | 2 |
| 改 | `src/config/env.validation.ts` | 1 |
| 改 | `src/modules/users/users.service.ts` | 1 |
| 改 | `src/modules/auth/auth.service.ts`、`auth.controller.ts`、`auth.module.ts` | 3 |
| 改 | `src/common/errors/error-codes.ts` | 1 |
| 改 | `apps/web/src/features/auth/`（LoginPage + css + index.ts 导出） | 3 |
| 新 | `apps/backend/src/modules/auth/oauth/`（接口 + Mock + Google） | 3 |
| 新 | `apps/web/src/features/auth/components/GoogleButton.tsx` | 1 |
| 新 | Prisma migration 目录（`migrate dev` 自动生成，不用手写） | 1 |
| 合计 | | **16 个文件，其中 4 个手写新建 + 1 个自动生成** |

### 新建文件明细

| # | 路径 | 内容 |
|---|---|---|
| 1 | `apps/backend/src/modules/auth/oauth/oauth-provider.ts` | `OAuthProvider` 接口 + `OAuthProfile` 类型 + 注入令牌（DI 用的常量） |
| 2 | `apps/backend/src/modules/auth/oauth/mock-oauth.provider.ts` | 假实现：返回一份固定的假资料，不走网络 |
| 3 | `apps/backend/src/modules/auth/oauth/google-oauth.provider.ts` | 真实现：拼 authorize URL / 换 token / 取 userinfo |
| 4 | `apps/web/src/features/auth/components/GoogleButton.tsx` | 「使用 Google 继续」按钮，整页跳转（**不是 fetch**） |
| 5 | `apps/backend/prisma/migrations/<时间戳>_add_google_oauth/migration.sql` | 自动生成，别手改 |

---

## 六、关于 git 分支

现在你在 `feature/weiqiyuan/login-backend`，**A7 直接在这个分支上继续就行，不用另开**。理由：Google 登录和密码登录同属"认证"，共用 `AuthService`、共用 `JWT`、共用 Cookie，拆两个分支反而会让 `auth.service.ts` 两头打架。

真要开子分支的话，唯一值得开的是 **①数据层** 那一步单独一个分支（因为要改公共 `schema.prisma`，需要群里同步后再合入 main），可以叫 `feature/weiqiyuan/user-oauth-fields`。其余步骤都跟着主认证分支走。
