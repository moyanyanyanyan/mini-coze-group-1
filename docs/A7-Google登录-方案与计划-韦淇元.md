# A7 — Google 第三方登录：方案选型与实施计划（韦淇元）

> 目标：让用户能用 Google 账号一键登录 MiniCoze，登录后拿到的**还是我们自己签的那枚 JWT**（同一个 `access_token` Cookie），因此不影响会话、消息、流式对话任何已有模块。

---

## 一、一句话结论

用 **OAuth 2.0 授权码流程（Authorization Code Flow）**，由**后端主导**：

- 前端只做一件事：把用户整页跳到 `GET /api/auth/google`
- 后端负责跳去 Google、拿一次性 `code`、用 `client_secret` 换令牌、取用户信息、发自家 JWT、种 HttpOnly Cookie
- 后端最后 302 回前端 `/workspace`

同时做一个**可插拔的 Mock Provider**：本地没有科学网络 / 还没申请到 Google 凭据时，走完全一样的链路，只是把 Google 换成"假 Google"，能演示能测试；网络通了改环境变量切真。

---

## 二、三个候选方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 后端重定向（授权码流）** | 后端拼 authorize URL → 用户同意 → 回调 `/callback` → 换 token | `client_secret` 留在后端，标准安全；登录态在自己的域下直接建立 | 需要后端多两个端点；依赖 Google 可达 | ✅ **选它** |
| B. 前端 Google Identity Services (GIS) | 前端加载 `accounts.google.com/gsi/client`，拿到 `credential`（ID Token）POST 给后端 | 体验好（One Tap、弹窗不跳页） | 前端要引第三方 JS、要校验 ID Token；多人协作时前端多了个外部依赖 | ❌ 备选 |
| C. 纯前端隐式流 | 前端直接拿 access_token | —— | 早已废弃，token 暴露在 URL，不安全 | ❌ 不考虑 |

**为什么不用 `passport-google-oauth20` 这个成熟包？**
它有魔法、black-box 较多，且 `@nestjs/passport@12` 是纯 ESM（我们已经在 jest 上踩过一次坑）。这次**手写 Provider 接口**：整个流程每一步都是你自己能 `console.log` 出来的代码，且 Mock 切换天然成立（同一接口两种实现）。以后想换成 passport 也随时能换，反过来不行。

---

## 三、链路时序（记牢这张图，代码就是照它写的）

```
[1] 浏览器 → GET http://localhost:3000/api/auth/google
      后端：生成随机 state，写进短效 Cookie
      后端：302 → https://accounts.google.com/o/oauth2/v2/auth
                ?client_id=xxx
                &redirect_uri=http://localhost:3000/api/auth/google/callback
                &response_type=code
                &scope=openid email profile
                &state=<随机串>

[2] 用户在 Google 页面登录 / 点同意（这一步不在我们的代码里）

[3] Google → 302 → http://localhost:3000/api/auth/google/callback?code=4/0Axxx&state=<随机串>

[4] 后端 callback：
      a. 校验 state（和 Cookie 里那个比对，不一致 = 拒绝）
      b. 用 code + client_id + client_secret  POST https://oauth2.googleapis.com/token  → 拿到 access_token
      c. 用 access_token  GET https://www.googleapis.com/oauth2/v3/userinfo  → 拿到 sub / email / email_verified / name / picture
      d. 用这些字段查/建本地 User（见第五节绑定策略）
      e. 签发自家 JWT，种 HttpOnly Cookie（复用现有 setAuthCookie）

[5] 后端 302 → http://localhost:5173/workspace   （成功）
     或 302 → http://localhost:5173/login?error=google_failed  （失败）
```

**两个关键点：**

1. **`code` 换 token 必须在后端做**，因为要用 `client_secret`。放前端等于把钥匙挂门口。
2. **回调结束后直接 302 回前端就够了**，不需要前端专门的 callback 页。因为 Cookie 挂在 `localhost` 这个域上（`localhost:3000` 和 `localhost:5173` 属于**同站**，端口不参与 SameSite 判定），我们现有的 `/api/auth/me` 已经是这么跑通的。

---

## 四、数据模型改动（⚠️ 公共文件，需先群同步）

`apps/backend/prisma/schema.prisma` 的 `User` 模型要动两处：

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String?                    // ← 改：OAuth 用户没有密码
  googleId     String?  @unique           // ← 新增：Google 的 sub，全站唯一
  displayName  String
  avatarUrl    String?
  ...
}
```

| 改动 | 为什么 | 影响面 |
|---|---|---|
| `passwordHash` → `String?` | Google 用户压根没有密码，不能瞎造一个 | 放宽约束，老数据不受影响。但 `login()` 里要先判空：`if (!user.passwordHash) throw INVALID_CREDENTIALS` |
| 新增 `googleId String? @unique` | 同一个人下次再用 Google 登录要靠它认出来，**不能只靠 email** | 纯新增 |

> **群同步要点（发群里）**：`schema.prisma` 是全组公共资产，本次只在 `User` 上放宽 `passwordHash` 并新增一个可选唯一字段，**不改任何既有字段类型、不删东西**，不影响 Agent / 会话 / 消息相关的所有模型。迁移命令会生成 `ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL` + `ADD COLUMN "googleId"` + 唯一索引。

**保守备选（如果群里不希望放开 nullable）**：OAuth 用户存一枚随机生成的 bcrypt 哈希当占位符，`passwordHash` 保持非空。缺点是无法区分"真密码"和"占位密码"，后续做邮箱验证改密码时容易出洞。**优先推 nullable。**

---

## 五、账号绑定策略（这一步最容易出错）

Google 回调拿到 `email_verified === true` 的邮箱后，按下面顺序走：

```
① 用 googleId 查 → 查到 → 直接登录（老用户复访，最快路径）
② 查不到 → 用 email 查：
      ②-a 查到某个本地账号 → 把 googleId 补写上去 → 登录（首次绑定）
      ②-b 没查到 → 新建 User：
            email       = Google 的 email
            displayName = Google 的 name（兜底用 email 的 @ 前缀）
            avatarUrl   = Google 的 picture
            googleId    = Google 的 sub
            passwordHash= null
       → 签发 JWT → 登录
```

**必须校验的东西（不做就是安全洞）：**

- **`email_verified` 必须为 `true`**，否则拒绝登录。这是信任 Google 邮箱的唯一依据。
- **`state` 必须比对**（防 CSRF / 登录劫持）。
- **失败了一定要 302 到登录页带 `?error=`**，不能让浏览器停在后端那个 JSON 上。

**已知风险（写进文档，MVP 接受）：**
我们现在的**邮箱密码注册没有邮件验证**。如果有人用"别人的邮箱"注册了一个密码账号，那个邮箱的主人用 Google 登录时会走到 ②-a，直接接管这个账号。

- 正规解法：注册后发验证邮件，未验证邮箱禁止被 Google 关联（要求先登密码再手动绑定）。
- MVP 取舍：**先看邮箱，自动关联**（用户体验优先，也是绝大多数产品的做法）。这条风险写在这里，答辩时能讲清楚就行。

---

## 六、环境与依赖

`.env.example` 新增：

```bash
# Google OAuth（留空则自动走 Mock Provider，本地无外网也能演示）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# true = 强制走 Mock（写测试 / 演示用）；不填 = 有凭据走真 Google，没凭据走 Mock
AUTH_GOOGLE_MOCK=
```

`env.validation.ts` 里注意：**这三项不能标必填**，否则没凭据的同学一启动就崩。全部 `@IsOptional()`，由 Provider 工厂决定走哪条路。

**新增依赖：零。** 全程用 Node 原生 `fetch`（Node 18+ 自带）+ 现有 bcryptjs / Prisma。不引 `passport-google-oauth20`、不引 `google-auth-library`。

---

## 七、接口设计（新增 2 个端点，都挂在 `/api/auth` 下）

| 方法 | 路径 | 说明 | 响应 |
|---|---|---|---|
| GET | `/api/auth/google` | 生成 state Cookie，302 到 Google（Mock 模式则 302 到本地假同意页/直接回调） | 302 |
| GET | `/api/auth/google/callback` | 校验 state → 换 token → 取资料 → 登录 → 302 回前端 `WEB_ORIGIN` 下的 `/workspace` 或 `/login?error=xxx` | 302 |

**不返回 JSON**，全靠重定向。这点跟现有 `AuthResponse` 契约不冲突（现有 register/login 保持不动），Google 这条链路压根不产出 `AuthResponse`。

错误码在 `error-codes.ts` 里新增：

| code | 场景 |
|---|---|
| `GOOGLE_STATE_MISMATCH` | state 对不上（CSRF），401 |
| `GOOGLE_TOKEN_EXCHANGE_FAILED` | code 换 token 失败（过期/被用过），401 |
| `GOOGLE_EMAIL_NOT_VERIFIED` | Google 邮箱未验证，403 |

---

## 八、实施计划（按你的节奏，一次一块）

> 规矩照旧：**一次只给一块 → 我贴全码 → 你粘贴跑 → 你回报 → 再下一块。** 不跳步。

| 块 | 内容 | 涉及文件 | 这块跑完能看到的验收 |
|---|---|---|---|
| **0** | 前置知识（下面第九节）+ 去 Google 控制台拿凭据 | 无代码 | `.env` 里有真 ID / Secret（拿不到也能继续做 Mock） |
| **1** | schema 改动 + 迁移（**先群里说一声**） | `schema.prisma` + migration | `User` 表有 `googleId` 列，`passwordHash` 已可空 |
| **2** | 环境变量 + 校验 + `login()` 判空 `passwordHash` | `env.validation.ts`、`users.service.ts` | 后端能正常启动；无凭据时不报错 |
| **3** | `OAuthProvider` 接口 + **Mock 实现** | 新目录 `modules/auth/oauth/` | 走 Mock 已经能把整个链路跑通（先有可视效果，符合前后端打通原则） |
| **4** | Google 真实 Provider（token 交换 + userinfo） | `oauth/google-oauth.provider.ts` | 有网有凭据时，换成真 Google 只改环境变量 |
| **5** | `AuthService.loginWithGoogle()` + 绑定逻辑（含 email_verified 校验） | `auth.service.ts` | 单元 usable；三种情况都能正确处理 |
| **6** | Controller 两个端点 + state Cookie + 302 | `auth.controller.ts`、`error-codes.ts` | 浏览器手动走一遍完整登录 |
| **7** | 前端：「使用 Google 继续」按钮 + 登录失败提示 | `features/auth/` | 页面上点一下能登录进 `/workspace` |
| **8** | 端到端实测 + 记录踩坑 | —— | Mock 与真实两条路都跑过一遍 |

**块 3 之后就有可见效果了**（Mock 能完整登录），这是刻意的——不让你闷头写完后端看不到东西。

---

## 九、前置知识清单

### 🔴 必须真懂（不懂的话代码看不懂）

1. **OAuth 2.0 授权码流程的四步是谁干什么**
   记住那根链条：`前端跳出去 → 用户在 Google 那边同意 → Google 带着 code 跳回我们的回调 → 我们的后端拿 code + secret 去换令牌`。
   重点是理解：**为什么中间要多一个 `code`，不能直接给 token？** 因为直接给 token 会走 URL，谁都能看；`code` 是一次性的、要配 `client_secret` 才有用。

2. **`client_secret` 为什么只能在后端**
   它就是"证明你是你"的钥匙。放前端 = 公开，任何人都能冒充你的应用去 Google 换令牌。

3. **`state` 是干什么的**
   随机字符串，跳去 Google 前先存本地，回调时比对。防的是"攻击者先把自己的 code 塞给你 → 你登录了攻击者的号"这种登录劫持。没有它，这个功能不能上线。

4. **我们已有的登录态是怎么工作的**
   你已经做过这遍了：登录后后端签发 JWT（`{ sub: userId, email }`），塞进 HttpOnly Cookie `access_token`，之后 `jwt.strategy.ts` 从 Cookie 里取出来验签、反查用户。
   **Google 登录的本质：只是拿到"这个人是谁"的另一种方式，之后要干的事完全一样 —— 还是签同一个 JWT、种同一个 Cookie。** 这一步想通了，整个 A7 就没有新魔法了。

5. **同站 vs 跨域**
   `localhost:3000` 和 `localhost:5173`：**跨域**（端口不同，需要 CORS `credentials: true`，你已经配了）但**同站**（SameSite 只看 scheme + 域名，不看端口），所以 `SameSite=Lax` 的 Cookie 照常能带上，也是为什么后端能直接 302 回前端且登录态还在。

### 🟡 会用就行

6. **Google Cloud Console 的三件套**：项目 → OAuth 同意屏幕（consent screen）→ 凭据（OAuth client ID）。
7. **`scope`**：我们要的是 `openid email profile` 三个，只拿邮箱和头像昵称，不多要。
8. **`sub` 是什么**：Google 那边用户的唯一 ID，长期稳定、不会因为用户改邮箱而变。**绑定账号必须用它，不能只用 email**，这是 Industry Standard。
9. **access_token vs ID Token**：这次我们用 `access_token` 去打 `userinfo` 端点拿资料（最直观、易调试）；另一个路线是直接解析返回的 JWT 格式的 `id_token`，少一次网络请求但要验签。MVP 选前者。
10. **Prisma migration**：改了 schema 之后 `migrate dev --name xxx`（沿用你之前那条 Prisma CLI 命令），会同时更新数据库和生成 client。

### 🟢 了解即可

11. **PKCE**：给授权码流程加一道校验，原生 App / SPA 必做。我们 `client_secret` 在后端，属于"机密客户端"，教科书上不强制。有余力可以做，写进报告是加分项，MVP 可以跳过。
12. **Refresh Token**：Google 登录我们不拿 Google 的 refresh token。用户的登录时长由**我们自己的 JWT（7 天）**决定，跟 Google 无关。

---

## 十、需要你本人去 Google 控制台做的事（我做不了）

按顺序：

1. 进 <https://console.cloud.google.com/> ，建个项目（或选已有的）
2. 左侧 **APIs & Services → OAuth consent screen**
   - User Type 选 **External**
   - 填 App name（`MiniCoze`）、你的支持邮箱
   - 未发布状态下，**Authorized domains 一般留空即可**，但要到 **Audience → Test users 里把你的 Google 邮箱加进去**（这步漏了会登录时报错）
3. 左侧 **Credentials → Create credentials → OAuth client ID**
   - Application type：**Web application**
   - **Authorized redirect URIs** 填（必须和我们后端的一字不差）：
     ```
     http://localhost:3000/api/auth/google/callback
     ```
4. 创建完会弹出 **Client ID** 和 **Client secret**，粘到 `.env` 里对应的两项（`.env` 不进 git）
5. 网络：Google 这几个域名要能通 —— `accounts.google.com`、`oauth2.googleapis.com`、`www.googleapis.com`。**不通不影响你写代码**，Mock Provider 就是为此准备的。

---

## 十一、风险与兜底

| 风险 | 兜底 |
|---|---|
| Google 网络不通 / 凭据申请卡住 | Mock Provider 走完全一样的链路，代码一行不用改，验收能正常演示 |
| `passwordHash` 放开 nullable 引起群友意见 | 提前在群里 sync；备选方案是用随机哈希占位（见表下注释） |
| 邮箱未验证导致的账号接管 | MVP 接受，已在第五节写明；后续补邮箱验证时把 ②-a 换成"要求先登录密码账号再手动绑定" |
| `state` Cookie 被浏览器吞 | SameSite 设 `Lax` + 短期 `maxAge`（5 分钟），顶层 GET 导航场景 Lax 允许发送，够用 |

---

## 十二、这块的验收标准（写在这，做完自检）

- [ ] Mock 模式：点「使用 Google 继续」→ 走完整流程 → 落到 `/workspace` → `/api/auth/me` 返回用户信息
- [ ] Mock 模式第二次登录：不重复建号，User 表行数不变
- [ ] Google 返回 `email_verified: false` → 拒绝登录，跳回登录页带错误提示
- [ ] 手动改 `state` 参数 → 拒绝登录（`GOOGLE_STATE_MISMATCH`）
- [ ] 真实模式：自己的 Google 账号能登录成功
- [ ] 已存在的邮箱密码账号，用同邮箱 Google 登录 → 绑定而非新建（`googleId` 被补写）
- [ ] 全程 `passwordHash` 没有出现在任何响应里
