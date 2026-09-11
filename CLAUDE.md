# CLAUDE.md

「一隅」(yiyu)——个人生活记录应用前端:记账本 + 广场门户 + 管理后台。**后端已接入**(2026-09-10):独立仓库 `../yiyu-server`(NestJS + Prisma + PostgreSQL),本前端不再有 mock 数据。**TypeScript + 模块化(monorepo-style 子模块)架构**。

## 常用命令

```bash
pnpm dev          # 开发服务器,默认端口 5173(需 ../yiyu-server 后端在 3000 端口运行)
pnpm build        # vue-tsc 类型检查 + vite 生产构建(类型不过则构建失败)
pnpm type-check   # 仅类型检查(vue-tsc --noEmit)
pnpm preview      # 预览构建产物,端口 4173
```

预览配置见 `.claude/launch.json`(yiyu-dev / yiyu-dev-alt:5174 / yiyu-preview / yiyu-server:3000)。**注意 launch.json 在上级目录 `C:\Users\an\Desktop\my\.claude\`,不在 yiyu 内。**

## 后端联调(重要)

- 开发:vite proxy `/api → http://localhost:3000`,同源无 CORS;先起 `yiyu-server` 再起本前端。
- 生产:`VITE_API_BASE` 环境变量指向后端地址。
- 请求层 `src/shared/api/http.ts`:Bearer token 自动注入(`yiyu-token` localStorage);**响应拦截器统一解包 envelope**(后端全部接口返回 `{success, code, message, data, timestamp}`,拦截器按 `success` 判定成败、直接返回 `data` 本体;**message 有值才 toast**(成功恒为空串不提示,失败中文提示),业务层拿到的就是数据);**401 清 token 回登录页**(登录页自身除外);业务错误(中文 message)直接 ElMessage toast,调用方 catch 里不必重复提示。
- 全部接口封装在 `src/shared/api/index.ts`(authApi / profileApi / inviteApi / ledgerApi / portalApi / adminApi + DTO 类型)。**路径带业务域前缀**:ledger 组 `/ledger/*`、我的邀请码 `/profile/invite-codes`。
- 后端契约详见 `../yiyu-server/docs/API契约.md` 与 `数据库设计.md`。seed 双模式(SEED_MODE):本地 demo(admin + yiyu/yiyu123456 演示数据,邀请码 LLKK2345/MMNN6789);部署 minimal(仅 admin/admin123456,无业务数据)。

## 技术栈

- Vue 3.5(`<script setup lang="ts">`)+ Vite 8 + TypeScript 5.9(strict)+ vue-tsc + pnpm
- Element Plus 2.14(全量引入,图标在 `main.ts` 全量注册)+ 暗色主题 css-vars
- Pinia 4(组合式 API)、vue-router 4(**hash 模式**,配合 GitHub Pages 子路径部署,`base: './'`)
- axios(经 `src/shared/api/` 封装)
- 路径别名:`@` → `src/`(tsconfig paths + vite alias)。**跨层/跨模块导入必须用 `@/`(如 `@/shared/stores/user`、`@/modules/ledger/stores/ledger`),模块内部才用相对路径。**
- ECharts 6 + vue-echarts(按需 `use()` 注册,见 Reports.vue 顶部)

## 目录结构(模块化)

每个业务域是一个自治子模块(`src/modules/<name>/`),内聚 types / stores / routes / views;跨模块共享的放 `src/shared/`:

```
yiyu/src/
├── main.ts                  # 入口:Pinia + Router + ElementPlus + fetchMe 后再 mount(避免刷新闪跳)
├── App.vue                  # 仅 <router-view>
├── router/index.ts          # 组装各模块 routes + requiresAuth/requiresAdmin 守卫(async,先等登录态就绪)+ document.title
├── styles/                  # tokens.css(设计令牌)+ base.css(全局样式与 .yiyu-card 等)
├── shared/                  # 跨模块共享层
│   ├── api/                 # http.ts(axios 实例/token/401 处理)+ index.ts(全部 API 封装与 DTO 类型)│   ├── layouts/             # AuthLayout / PortalLayout / AppShellLayout(应用壳,菜单按 route.meta.app 切换;窄屏抽屉为纯图标条)
│   ├── stores/              # user(token 登录态:login/register/fetchMe/logout,含 isAdmin)/ theme(深浅色)
│   └── types/               # common.ts(User/UserRole/DateTimeStr/nowStr/nowYM)+ router.d.ts(RouteMeta 扩展)
└── modules/
    ├── auth/                # 登录/注册(注册需邀请码)
    ├── portal/              # 广场:问候 + 应用卡摘要(portalApi.summary,默认账本当月收支;不拉 ledger 数据)
    ├── ledger/              # 记账本:Transactions(按月分页)/ Reports(服务端聚合)/ Books(store API 化)
    ├── profile/             # 个人中心:ProfileInfo(默认页:资料 + 账号 + 邀请码 + 修改密码)
    ├── admin/               # 管理后台:AdminDashboard(默认页)/ AdminUsers / AdminLogs(服务端分页)/ AdminInvites(平台级,requiresAdmin)
    └── (auth / portal / ledger / profile / admin 五模块)
```

**模块内结构约定**:`types.ts`(领域类型)· `stores/`(Pinia,API 数据源)· `routes.ts`(导出 `xxxRoutes: RouteRecordRaw[]`,由主 router 汇总)· `views/`。新增页面时在对应模块内添加,不要跨模块 import 别人的 views/stores(共享需求提升到 shared)。

需求文档:[docs/记账本/需求设计.md](docs/记账本/需求设计.md) · [docs/个人中心/需求设计.md](docs/个人中心/需求设计.md) · [docs/后台管理/需求设计.md](docs/后台管理/需求设计.md)

## TypeScript 约定

- `strict` + `noUnusedLocals` + `noUnusedParameters` 全开;`verbatimModuleSyntax` 类型导入必须 `import type`。
- 领域类型集中在各模块 `types.ts`(Transaction/Book 等),视图和 store 从这里导入;API DTO 类型集中在 `shared/api/index.ts`。
- `RouteMeta` 的 `app/title/requiresAuth/requiresAdmin` 类型扩展在 `src/shared/types/router.d.ts`。
- 大文件的 `<style scoped>` 独立成同名 `.css`(如 `Reports.vue` + `Reports.css`),通过 `<style src="./Reports.css" scoped>` 引入。
- 常量断言注意元组字面量(如 `['早餐', 9]` 需显式 `as const` 或标注类型)。

## 关键约定

- **UI 文案全中文**,注释也以中文为主。
- 颜色语义固定:**红 `--color-expense` = 支出,绿 `--color-income` = 收入**;各应用身份色经 CSS 变量 `--app-ledger` / `--app-admin`(管理后台,石板灰)定义于 tokens.css。
- 样式用 tokens.css 的 CSS 变量(`--bg-card`、`--radius-card`、`--fs-caption` 等),卡片统一 `.yiyu-card` / `.yiyu-card--hover` 类,数字加 `.num` 类。支持深浅色,不要写死颜色值。
- 新页面路由加 `meta: { app: 'ledger'|'profile'|'admin', title: '...', requiresAuth: true }`,壳层菜单会自动跟随 `meta.app`。个人中心仅 基本信息(默认页)一页;管理后台菜单顺序:数据概览(默认页)→ 用户管理 → 系统日志 → 邀请码。**管理后台路由额外加 `requiresAdmin: true`**,守卫对非 admin 弹提示并跳回广场。
- **角色与后台(`shared` + `modules/admin`)**:`UserRole = 'admin' | 'user'`,`userStore.isAdmin`(来自 `/auth/me` 返回的 `user.role`)是全站唯一"是否管理员"判定。后台入口仅一处且 `v-if="isAdmin"`:头像下拉「后台管理」。管理后台与个人中心同为**平台级模块**(非子应用,不进应用卡栅格)。
- **个人中心(`modules/profile`)是平台级用户模块而非子应用**:入口仅头像下拉「个人中心」,不设应用身份色。档案是全站共享数据源(`stores/profile.ts` 走 GET/PUT /profile),子应用不得自建用户资料副本;改昵称/头像后需同步 `userStore.user` 展示层。页面含**邀请码卡片**(我的码列表 + 生成,非 admin 未使用上限 5)。
- 时间字符串格式统一 `YYYY-MM-DD HH:mm`(排序直接用字符串比较),类型别名 `DateTimeStr`;当前时间用 `nowStr()`(common.ts),当月用 `nowYM()`,直接 `new Date()` 取真实时钟——**mock 基准日(2026-09-07)机制已随 mock 一起移除**。

## ⚠️ 数据层的关键事实(改功能前必读)

- **数据全部来自后端 API**(2026-09-10 起):无 mock 目录;持久化在后端 PostgreSQL,刷新不丢。
- **登录态**:JWT 存 `yiyu-token`(localStorage);`main.ts` mount 前先 `fetchMe()`(有 token 则 GET /auth/me),路由守卫等 `ready` 再判断,避免刷新闪跳。**注册需邀请码**(用户个人中心生成 / 管理员后台生成或直接建号)。
- **停用即时生效**:被停用用户的登录 403;已持有 token 的请求 401(后端每请求查库),前端请求层自动清态回登录页。
- **数据加载分层(2026-09-10)**:**登录落地广场只调 `GET /portal/summary`**(应用卡摘要:默认账本当月收支 + 账本名/图标);books/categories/transactions 等应用内数据**点进记账本时才加载**(ledger 三个视图 onMounted 调 `store.init()`)。ledger store `init()` 有 `loaded`/`loading` 短路,应用内切页共享一次拉取。
- **流水分页与报表聚合(2026-09-10)**:`GET /ledger/transactions` **服务端分页** `{total, page, pageSize, items}`(1-100/页);`GET /ledger/reports?bookId&from&to` **服务端聚合** stats/daily/monthly/categories(子分类归并根分类)。前端报表页(Reports.vue)与流水页月汇总(Transactions.vue)全部消费 reports 端点,客户端聚合代码已删。
- **ledger store**:`init()` 只拉账本/分类(**不拉流水**,loaded/loading 短路);流水由视图驱动——Transactions 页按月分页(`loadMonthTransactions(ym, page)`,pageSize 50,"加载更多"追加),`monthQuery` 记录当前月份视图;报表走 `fetchReports(from, to)` 即 `GET /ledger/reports` **服务端聚合**(stats/daily/monthly/categories),前端不再全量拉流水自算;`groupedByDay` 仅剩展示分组。CRUD 走 API 后本地同步(txTotal 增减);**切账本会重拉流水**。Transactions 页靠 `watch([month, currentBookId], …, {immediate:true})` 驱动首挂与切换。
- **admin store**:dashboard 一次性返回统计/趋势/最近操作;用户列表服务端筛选(关键词 300ms 防抖);**日志服务端分页**(el-pagination,page/pageSize/module/action 参数);操作人昵称/头像由日志项自带 `operator`,不再查用户表。
- **Transactions.vue 月份列表**由当前月倒推 12 个月(不再硬编码)。
- **概览口径**:数据概览只统计系统资源(用户/管理员/账本/日志),不展示流水与收支金额(2026-09-10 口径,前后端一致)。

## 已移除项(历史记录)

- **账户概念**(2026-09):无 accountId/Account 维度。
- **记事本模块**(2026-09-10):notes 模块、wangEditor、`--app-notes` 均删。
- **协同与好友**(2026-09-10):纯单人应用,流水只有 分类/账本 两个维度。
- **mock 数据层**(2026-09-10):`ledger/mock`、`admin/mock`、`profile/mock` 目录与 `mockToday`/`mockNowStr` 均删,后端 yiyu-server 接管。

## 部署

push 到 main 触发 GitHub Actions 自动构建部署到 GitHub Pages(`actions/configure-pages` 自动启用 Pages)。hash 路由 + 相对 base,无需额外配置。注意:Pages 静态托管不含后端,联调/生产需另行部署 yiyu-server 并在前端构建时注入 `VITE_API_BASE`。
