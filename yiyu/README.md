# 依宇 yiyu

个人生活工具集(Vue 3 + TypeScript + Vite):门户 + 记账本(💰 多账本记账 + 报表)。纯前端 mock 实现,数据存内存,刷新重置。

## 命令

```bash
pnpm install
pnpm dev        # 开发
pnpm build      # vue-tsc 类型检查 + vite 生产构建
```

## 结构

- `src/modules/<name>/` —— 按子应用划分:auth(登录注册)/ portal(门户)/ ledger(记账本)/ profile(个人中心)/ admin(管理后台),每个模块自持 types、mock、stores、routes、views
- `src/shared/` —— 跨模块共享:布局、通用组件、用户/主题 store、设计 tokens
- 路由:`src/router/index.ts` 汇总各模块导出的路由表

详见根目录 `CLAUDE.md` 与 `docs/` 下各模块需求设计文档。
