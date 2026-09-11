# CLAUDE.md

「一隅」(yiyu-server)——后端服务:NestJS 11 + Prisma 6 + PostgreSQL 17,无状态 JWT。为前端 `../yiyu`(Vue 3)提供认证/档案/邀请码/记账/管理后台全部 API。

## 常用命令

```bash
pnpm start:dev        # 开发(watch),http://localhost:3000,前缀 /api
pnpm build            # 生产构建
pnpm test             # 单元测试(Jest)
pnpm test:e2e         # e2e(Supertest 打真实 PG 库 yiyu,测试数据自清理,runInBand)
pnpm lint             # ESLint
pnpm prisma migrate dev   # 应用迁移(改 schema 后)
pnpm prisma migrate reset # 重置库 + 重新 seed
pnpm prisma studio        # 数据库 GUI
```

启动项已加入 `C:\Users\an\Desktop\my\.claude\launch.json`(yiyu-server:3000)。本地联调:本服务 + `../yiyu` 的 `pnpm dev`(vite proxy `/api` 已配)。

## 目录结构

```
prisma/schema.prisma · migrations/ · seed.ts      # 6 表;seed 双用户:admin(admin/admin123456 超管)+ yiyu(yiyu/yiyu123456,演示数据主人)。**全部 ID 统一 cuid**(seed 内用 key 映射到 create 返回的真实 cuid,不硬编码 ID)
src/
├── main.ts / app.module.ts                       # 全局 prefix 'api'、helmet、CORS、ValidationPipe(whitelist+transform)、ThrottlerGuard(60/min)
├── common/
│   ├── guards/     jwt-auth.guard(@Public 豁免)· admin.guard(401/403 中文文案)
│   ├── filters/    all-exceptions.filter(错误也走 envelope:success=false + code=HTTP 状态码)
│   ├── interceptors/ transform.interceptor(成功响应统一包装 {success:true,code:0,message,data,timestamp})
│   ├── decorators/ current-user / public / admin
│   ├── audit/      audit.service(record(module, action, operatorId, summary≤40),失败不阻断)
│   └── utils/      datetime(fmtDateTime/fmtDate/parseDateTime,Asia/Shanghai 'YYYY-MM-DD HH:mm')· invite-code
└── modules/
    ├── auth/         # @Public:register(邀请码+默认账本)/login(停用403)/logout/me;JwtStrategy 每请求查库
    ├── users/        # GET/PUT /profile、PUT /profile/password(bcrypt 校验旧密码)
    ├── invite-codes/ # 我的码 @Controller('profile/invite-codes');非 admin 未使用上限 INVITE_MAX_UNUSED(默认5)
    ├── ledger/       # @Controller('ledger'):books/categories/transactions(服务端分页)/reports(服务端报表聚合)
    ├── portal/       # GET /portal/summary:广场应用卡摘要(默认账本当月收支聚合,门户唯一接口)
    └── admin/        # users(keyword 筛选/建号无邀请码/禁自改)/logs(分页)/dashboard(资源口径,无金额)/invite-codes
test/                 # e2e:auth 7 + ledger 17 + portal 4 + admin 9 = 37;helpers/configure-app(镜像 main.ts 全局件,含 TransformInterceptor)、clean-all(前缀级联清理)
docs/                 # 数据库设计.md · API契约.md
```

## 关键事实(改代码前必读)

- **统一响应包装**(2026-09-10):全部接口返回 envelope `{success, code, message, data, timestamp}`;成功 code=0、**message 恒为空串**(前端按 success 判定成败,message 有值才 toast),失败 code=HTTP 状态码、message 为中文提示(AllExceptionsFilter)。HTTP 状态码语义保留(401 仍触发前端清态)。新端点无需手工包装,拦截器全局生效(main.ts 与 test/helpers/configure-app.ts 双注册,改动需同步两处)。
- **路径带业务域前缀**:ledger 全组 `/ledger/*`,我的邀请码 `/profile/invite-codes`;旧 `/books` 等裸路径已废弃。
- **users 单表归一**:mock 阶段的 SystemUser(后台目录)与 Profile(档案)合并一张表;`role`+`status` 与档案字段同表。
- **停用即时生效**:登录 403「账号已停用」;已发 token 因 JwtStrategy 每请求查库而 401。
- **邀请码一次性**:`usedById` 全表唯一约束;8 位字符集 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`(无 I/L/O/0/1)。
- **金额**:DTO 自定义 `@IsAmount` 校验(>0、≤2 位小数、≤99,999,999;class-validator 的 Matches 对 number 无效,勿改回);DB Decimal(12,2),API number;**服务端聚合用 Prisma.Decimal 累加后转 number,避免浮点误差**。
- **分页约定**:`{total, page, pageSize, items}`(transactions 与 admin/logs 一致);GET query 分页参数需 `@Type(() => Number)`(query 传参是字符串,ValidationPipe transform 不够)。
- **categoryName 由服务端派生**(不信任客户端),删除分类后流水 categoryId 置 null 靠冗余名兜底。
- **报表聚合在服务端**:GET /ledger/reports(bookId/from/to)一次返回 stats/daily(区间≤92 天)/monthly/categories(子分类经 childToRoot 归并到根分类名);前端不再全量拉流水自算。
- **dashboard 只统计系统资源**(用户/管理员/账本/日志计数 + 近7日趋势 + 最近8条),**不含流水与金额**(2026-09-10 口径)。
- **admin_logs 只追加**:埋点在 service 内显式调 `audit.record(...)`,中文摘要 slice(0,40);写入失败静默。
- **审计关键词**:登录/注册/登出/记账 CRUD/建删分类/建账本/改档案/改密码/管理员建号/改角色/停启用/生成邀请码。
- **时间序列化**:统一 `fmtDateTime`(Asia/Shanghai,`YYYY-MM-DD HH:mm`),前端按字符串排序。
- **依赖坑**:`@nestjs/passport` 必须用 ^11(v12 纯 ESM,ts-jest CJS 跑不了);`@nestjs/jwt` 的 expiresIn 需 `as any`。
- **e2e**:跑真实 PG 库(与 dev 同库),`test/helpers/clean-all.ts` 按用户名前缀级联清理(InviteCode/Book/AdminLog 先于 User);跑完建议 `psql` 抽查或 `prisma migrate reset` 回基线。

## 环境变量(.env,见 .env.example)

`DATABASE_URL`(本地 `postgresql://postgres@localhost:5432/yiyu`)· `JWT_SECRET` · `JWT_EXPIRES=7d` · `INVITE_MAX_UNUSED=5` · `PORT=3000` · `CORS_ORIGINS`

## seed 基线(SEED_MODE 双模式)

`SEED_MODE` 环境变量控制:**demo**(默认,本地开发)admin 超管 + yiyu 演示用户(45 分类 · 3 账本 · 593 笔流水锚定当前日期 · 2 邀请码 · 21 日志);**minimal**(部署)仅 admin 超管 + 37 全局预置分类,**无任何业务数据**——普通用户走注册(admin 后台生成邀请码)。seed 内部用可读 key 建映射,落库 ID 全部为 cuid。容器启动经 `docker-entrypoint.sh`:migrate deploy → **仅用户表为空时才 seed**(重启不覆盖数据),`SEED_MODE` 默认 minimal。

## 文档

[docs/数据库设计.md](docs/数据库设计.md) · [docs/API契约.md](docs/API契约.md) · 前端契约侧:`../yiyu/src/shared/api/index.ts`
