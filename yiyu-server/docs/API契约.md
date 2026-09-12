# API 契约

> 前缀 `/api`;本地开发经 vite proxy(`/api → http://localhost:3000`)同源访问,生产由前端 `VITE_API_BASE` 指向后端。
> 全部接口(除 auth/login、auth/register、health)要求 `Authorization: Bearer <JWT>`;admin 组另要求 `role=admin`。
> 时间一律 `YYYY-MM-DD HH:mm`(Asia/Shanghai);日期 `YYYY-MM-DD`;金额 number(元,≤2 位小数)。

## 统一响应包装(2026-09-10)

所有接口(成功与失败)统一返回 envelope,由全局 `TransformInterceptor` / `AllExceptionsFilter` 同构生成:

```jsonc
{
  "success": true,          // 业务成功与否(HTTP 2xx 恒 true,错误恒 false)
  "code": 0,                // 成功恒 0;失败 = HTTP 状态码(400/401/403/404/409/429/500)
  "message": "",            // 成功恒为空串;失败为中文人话(校验错误数组已拼为单句)
  "data": { },              // 业务数据;无数据端点(如 DELETE)为 null
  "timestamp": 1789107840000        // 毫秒时间戳(服务端响应生成时刻)
}
```

- 前端 `http.ts` 响应拦截器统一解包:按 `success` 判定成败,直接返回 `data` 本体;`message` 有值才 toast(成功绿色/失败红色),空串不提示;`success=false` 或 HTTP 错误时 reject。
- HTTP 语义保留:错误仍带真实 HTTP 状态码(401 拦截器据此清登录态)。
- 限流:全局 60 次/分,登录/注册 5 次/分(429)。

## 路径规范

资源按业务域分组前缀(名词复数 + 层级):`/auth/*`、`/profile/*`、`/profile/invite-codes`(我的邀请码,归属 profile 域)、`/ledger/*`、`/portal/*`、`/admin/*`。旧路径 `/books`、`/categories`、`/transactions`、`/invite-codes` 已废弃(404)。

## auth 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册 `{username, nickname, password, inviteCode}` → `{token, user}`;用户名 2-20 `[a-zA-Z0-9_]` 唯一(409),密码≥6,邀请码 8 位须未使用;成功即登录,并自动创建默认账本 |
| POST | `/auth/login` | `{username, password}` → `{token, user}`;停用账号 403「账号已停用,请联系管理员」 |
| POST | `/auth/logout` | 记登出日志(无状态 JWT,不做服务端注销) |
| GET | `/auth/me` | → `User {id, username, nickname, avatar, role}`;token 过期/停用/删除均 401 |

`user.role` 是前端全站唯一管理员判定依据。

## profile 个人档案

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/profile` | → `{id, username, nickname, avatar, bio, gender, birthday(''\|YYYY-MM-DD), region, joinedAt(YYYY-MM-DD), updatedAt}` |
| PUT | `/profile` | 部分/全量更新上述可编辑字段 → 返回更新后档案 |
| PUT | `/profile/password` | `{oldPassword, newPassword}`;旧密码错误 400「当前密码不正确」 |

## 我的邀请码(profile 域)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/profile/invite-codes` | → 我的码列表 `[{id, code, createdAt, usedAt, usedBy:{id,nickname,avatar}|null}]`(新在前) |
| POST | `/profile/invite-codes` | 生成一个;非 admin 未使用数达上限(默认 5)→ 400 |

## ledger 记账本

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ledger/books` | → `[{id, name, icon, monthExpense, isDefault}]`;monthExpense 当月支出实时聚合;默认账本在前 |
| POST | `/ledger/books` | `{name, icon}` → Book |
| GET | `/ledger/categories?type=expense\|income` | → 根分类树 `[{id, name, icon, custom?, children:[{id,name}]}]`;预置在前,`custom=true` 为我的自定义;**省略 type 时一次返回两套** `{expense:[], income:[]}` |
| POST | `/ledger/categories` | `{type, name, icon}` → Category;同 type 重名(含预置)→ 400「该分类名已存在」 |
| DELETE | `/ledger/categories/:id` | 仅 custom 可删(他人/预置 403);删除后其流水 categoryId 置 null,展示靠 categoryName 兜底 |
| GET | `/ledger/transactions?bookId&from&to&type&categoryId&keyword&page&pageSize` | **服务端分页 + 服务端筛选**;bookId 必填(他人账本 403),from/to `YYYY-MM-DD`(to 含当日),type 支出/收入,categoryId 精确,keyword 模糊匹配备注,page≥1 默认 1,pageSize 1-100 默认 20 → `{total, page, pageSize, items}`(时间倒序) |
| POST | `/ledger/transactions` | `{type, amount, categoryId, date, note?, bookId}` → Transaction;**categoryName 由服务端派生**,type 与分类不匹配 400,金额须 >0 且 ≤2 位小数 |
| PATCH | `/ledger/transactions/:id` | 部分更新;非本人 403 |
| DELETE | `/ledger/transactions/:id` | 非本人 403 |
| GET | `/ledger/reports?bookId&from&to` | **服务端报表聚合**;三参均必填,from>to 或区间>10 年 → 400,他人账本 403 |

Transaction 形状:`{id, type, amount, categoryId('' 若已删), categoryName, bookId, date, note}`。

### /ledger/reports 返回结构

```jsonc
{
  "stats": { "income": 13310.85, "expense": 4123.74, "balance": 9187.11, "count": 15 },
  "daily":   [ { "date": "2026-09-01", "income": 0, "expense": 3266.65 } ],  // 仅区间 ≤92 天时返回
  "monthly": [ { "month": "2026-01", "income": 51254.31, "expense": 17255.37 } ],
  "categories": {
    "expense": [ { "name": "居住", "value": 3432.10 } ],   // 子分类归并到根分类名,金额倒序
    "income":  [ { "name": "工资", "value": 13310.85 } ]
  }
}
```

前端报表页(周/月/年趋势、分类占比、排行、日历热力)全部消费此端点,不再全量拉流水客户端自算。

## portal 广场门户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/portal/summary` | 登录落地页应用卡摘要 → `{apps:{ledger:{bookName, bookIcon, monthExpense, monthIncome, monthBalance}}}`;口径 = **默认账本当月**收支(非默认账本/上月不计入),无账本时全 0 |

门户只消费这一个接口;books/categories/transactions 在用户点进记账本时才由 ledger 模块接口加载(2026-09-10 懒加载拆分)。

## admin 管理后台(全部 requiresAdmin,非 admin 403)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/users?keyword&role&status` | keyword 模糊匹配用户名/昵称(不分大小写);→ `[{id, username, name, avatar, role, status, registeredAt, lastActiveAt}]` |
| POST | `/admin/users` | `{username, name, avatar, role, password}` 直接建号(**不消耗邀请码**,记 security 日志);用户名冲突 409 |
| PATCH | `/admin/users/:id` | `{role?}` / `{status?}`;**操作自己 400**「不能修改自己的角色或状态」;停用即时生效(该用户现有 token 因 strategy 查库而 401) |
| GET | `/admin/logs?page&pageSize&module&action&operatorId` | → `{total, page, pageSize, items:[{id, time, moduleId, action, operatorId, summary, operator:{id,nickname,avatar}|null}]}`;时间倒序,pageSize≤100 |
| GET | `/admin/dashboard` | → `{userCount, adminCount, activeCount, disabledCount, bookCount, logCount, logTodayCount, logSecurityCount, logCountByDay:[{date,label,count}]×7, latestLogs:[…]×8}`;**只统计系统资源,不含流水/金额**(2026-09-10 口径) |
| GET | `/admin/invite-codes` | 全部码(含 creator/usedBy 信息),新在前 |
| POST | `/admin/invite-codes` | 生成码,admin 无额度限制 |

## agent AI 助手(`/agent/v1`,登录用户;`/agent/v1/admin/*` requiresAdmin)

平台级模块:聊天抽屉/未来 App 共用的"自然语言 API"。工具调用全在后端(直接函数调 LedgerService/UsersService,权限天然继承);LLM 走 OpenAI 兼容协议,配置存 SystemConfig 表(key=`ai.llm`/`ai.persona`/`agent.settings`),key 脱敏回显。

### 会话管理(envelope)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/v1/status` | → `{llmConfigured, agentEnabled}`;未配置时前端降级提示 |
| GET | `/agent/v1/conversations` | 会话列表(lastMessageAt 倒序) |
| POST | `/agent/v1/conversations` | 新建,含轻主动开场白(复用 portal summary,不调 LLM) |
| DELETE | `/agent/v1/conversations/:id` | 级联删消息;用量保留(conversationId 置 null) |
| GET | `/agent/v1/conversations/:id/messages?page&pageSize` | seq 正序分页(role/kind/content JSON 契约见下) |

### 对话(SSE:POST + Bearer,响应 text/event-stream)

| 方法 | 路径 | 入参 | 说明 |
|---|---|---|---|
| POST | `/agent/v1/conversations/:id/chat` | `{content, pageContext?{app,title,hint}}` | 主循环:LLM 多轮工具调用直至最终回答 |
| POST | `/agent/v1/confirms/:confirmId/confirm` | `{}` | 确认中/高风险卡 → 执行 → LLM 总结(同 SSE 协议) |
| POST | `/agent/v1/confirms/:confirmId/cancel` | `{}` | 取消卡(普通 envelope,不调 LLM) |
| POST | `/agent/v1/conversations/:id/regenerate` | `{}` | 裁掉最后一条 user 消息之后的回复重跑 |

SSE 事件(流前错误=HTTP envelope;流中=error 事件;15s ping 心跳):

```
message_start    {messageId, role:'assistant'}
message_delta    {messageId, delta}                  # 文本增量(打字机)
message_end      {messageId, text, meta?{model, latencyMs, aborted}}
tool_start       {callId, name, label, risk, args}
tool_result      {callId, name, ok, summary, card?{cardType,title,data}, error?, latencyMs}
confirm_required {card:{confirmId, skillId, label, risk, args, preview:{lines}, warning?, status:'pending', expiresAt}}  # +10min 过期
usage            {model, promptTokens, completionTokens, estimated}
done             {conversationId, finish:'done'|'confirm_required'|'aborted'|'error'|'max_rounds'}
error            {code, message}                     # 503 未配置 / 502 LLM 失败
```

风险分级:低=直接执行(查询);中=确认卡(记一笔);高=警告卡+二次确认(删流水)。同会话同时仅一张 pending 卡(新卡/新消息自动取代旧卡);过期惰性判定。

### 技能管理(admin)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/v1/admin/skills` | 全量技能 join 启停:`[{skillId, group, name, label, description, risk, parameters, enabled}]`;技能本体在代码注册(SkillRegistry),首期 8 个:ledger×5/profile×2/common×1 |
| PUT | `/agent/v1/admin/skills/:name` | `{enabled}` 启停(30s 缓存) |

### 配置与用量(admin)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/v1/admin/config` | `{llm:{baseUrl, apiKeyMasked(尾4位), model, streaming}, persona:{systemPrompt}, settings:{agentEnabled, contextTurns, maxToolRounds}}` |
| PUT | `/agent/v1/admin/config` | 部分更新(apiKey 空串=保留);写即失效缓存 |
| POST | `/agent/v1/admin/config/test` | 连通测试 → `{ok, latencyMs, model, message}`(落 kind='test' 用量) |
| GET | `/agent/v1/admin/usage/summary?from&to` | → `{totalCalls, totalPromptTokens, totalCompletionTokens, byDay, byUser}`(排除 test;后台仅统计**不见对话内容**) |

### 管理端(agent/v1/admin)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/PUT | `/agent/v1/admin/config`(+`/test`) | 见上 |
| GET/PUT | `/agent/v1/admin/skills(/:name)` | 见上 |
| GET | `/agent/v1/admin/usage/summary` | 见上 |

## 审计埋点(admin_logs)

| module | 触发点 |
|---|---|
| auth | 注册(邀请码注册了新用户「X」)、登录、登出 |
| ledger | 记一笔/改流水/删流水、新建账本、新增/删除自定义分类 |
| profile | 更新档案、修改密码 |
| admin | 管理员建号、改角色、停用/启用、生成邀请码 |
| agent | 经 AI 记一笔/改备注/删流水(与业务 service 自身 ledger 审计**双写**)、修改 AI 配置、技能启停 |

## 对应前端实现

`yiyu/src/shared/api/index.ts`(全部接口的 TS 封装)· `yiyu/src/shared/api/http.ts`(axios 实例:Bearer 注入、envelope 解包、401 清态回登录、错误 toast)。
