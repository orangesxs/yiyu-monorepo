# yiyu-server —「一隅」后端服务

「一隅」个人生活记录应用(记账本 + 广场门户 + 管理后台)的后端:NestJS 11 + Prisma 6 + PostgreSQL 17,无状态 JWT 认证。

配套前端仓库:`../yiyu`(Vue 3 + Pinia + Element Plus)。

## 技术栈

- NestJS 11(模块化结构 `src/modules/<域>/`,与前端模块心智一致)+ TypeScript strict
- Prisma 6 ORM + PostgreSQL 17(6 张表,见 [docs/数据库设计.md](docs/数据库设计.md))
- 认证:`@nestjs/jwt` Bearer 请求头,7 天过期;**strategy 每请求从 DB 加载用户**,停用/降权即时生效
- 校验:class-validator 全局 ValidationPipe(whitelist + transform);安全:helmet、全局 ThrottlerGuard(60 次/分,登录注册 5 次/分)、bcrypt(10 轮)
- 审计:登录/注册/增删改/管理操作写 `admin_logs`(中文摘要,见 [docs/API契约.md](docs/API契约.md))

## 快速开始

```bash
pnpm install
cp .env.example .env        # 按需修改 DATABASE_URL / JWT_SECRET
pnpm prisma migrate deploy  # 应用迁移
pnpm prisma db seed         # 灌入演示数据
pnpm start:dev              # http://localhost:3000,前缀 /api
```

`.env` 要求:本地 PostgreSQL 建库 `yiyu`(`createdb yiyu`);`DATABASE_URL` 示例 `postgresql://postgres@localhost:5432/yiyu`(本机 trust 认证可无密码)。

**seed 账号**:u1 `an` / u2 `xiaolin` / u3 `mama` / u4 `biaomei` / u5 `laozhou`(已停用)/ u6 `ajun` / u7 `aze`,密码统一 `yiyu123456`;`an` 为管理员。演示流水锚定**真实当前日期**生成 594 笔。演示邀请码:`LLKK2345` / `MMNN6789`(未使用)。

## 常用命令

```bash
pnpm start:dev      # 开发(watch)
pnpm build          # 生产构建
pnpm test           # 单元测试(Jest)
pnpm test:e2e       # e2e(Supertest 打真实 PG,自清理测试数据,runInBand)
pnpm lint           # ESLint
pnpm prisma studio  # 数据库 GUI
```

## 本地联调(前端)

前端 `yiyu/vite.config.ts` 已配 proxy `/api → http://localhost:3000`,两仓同起即可:

```bash
# 本仓
pnpm start:dev
# ../yiyu
pnpm dev
```

生产部署时前端以 `VITE_API_BASE` 指向本服务地址;本服务 CORS 白名单由 `CORS_ORIGINS` 控制。

## 目录结构

```
prisma/schema.prisma · migrations/ · seed.ts
src/
├── main.ts / app.module.ts        # 全局 prefix /api、helmet、CORS、ValidationPipe、Throttler
├── common/                         # guards(jwt/admin)、filters(异常中文化)、decorators、audit、utils(datetime)
└── modules/
    ├── auth/                       # 注册(邀请码)/登录/me/logout + JWT 策略
    ├── users/                      # 个人档案 GET/PUT /profile、改密码
    ├── invite-codes/               # 我的邀请码(非 admin 未使用上限 5)
    ├── ledger/                     # 账本/分类/流水 CRUD(归属校验、categoryName 服务端派生)
    └── admin/                      # 用户管理/日志分页/dashboard/邀请码管理(requiresAdmin)
test/                               # e2e:auth(7) + ledger(14) + admin(9)
docs/                               # 数据库设计.md · API契约.md
```

## 关键设计决策

- **users 单表归一**:mock 阶段后台目录与个人档案两份数据合并为一张 users 表。
- **停用即时生效**:登录 403;已持有 token 的请求因 strategy 查库而 401,前端清态回登录页。
- **邀请码一次性**:`usedById` 唯一约束天然保证;注册成功即标记 usedBy/usedAt。
- **categoryName 冗余**:流水保存服务端派生的分类名,分类删除后列表仍可读(categoryId 置空)。
- **monthExpense 不落库**:GET /books 按当月实时聚合。
- **金额**:DB Decimal(12,2),API number(元,两位小数上限校验)。
