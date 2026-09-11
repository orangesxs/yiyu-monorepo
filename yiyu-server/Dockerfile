# 后端镜像:两段式(多阶段构建)
#   阶段一 build:Node 镜像里装依赖 + prisma generate + nest build 编译
#   阶段二 运行 :只把产物拷进干净的 Node 镜像 —— 无源码、无 devDependencies,体积小
# 注意:Dockerfile 指令同一行不能跟 # 注释,注释必须独占一行
FROM node:22-alpine AS build
WORKDIR /app
# 启用 corepack 以获得 pnpm
RUN corepack enable
# 先只拷清单文件,利用 Docker 层缓存:依赖不变则跳过安装
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# 再拷源码,生成 Prisma Client + 编译 TS → dist/
COPY . .
RUN pnpm prisma:generate && pnpm build

# ── 运行阶段 ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# 迁移文件要在启动时应用到数据库
COPY --from=build /app/prisma ./prisma
# tsconfig.json:运行期 entrypoint 用 ts-node 执行 prisma/seed.ts 时必须存在,
# 缺失时 ts-node 回退默认 module=NodeNext,会报 TS5109 编译错误导致容器重启循环
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
# 启动入口:见 docker-entrypoint.sh —— 迁移 → 仅首次初始化 seed → 起服务
# (SEED_MODE 控制 seed 内容:minimal 仅超管+分类 / demo 完整演示数据)
ENTRYPOINT ["/app/docker-entrypoint.sh"]
