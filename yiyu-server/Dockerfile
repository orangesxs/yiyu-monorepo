# 后端镜像:两段式(多阶段构建)
#   阶段一 build:Node 镜像里装依赖 + prisma generate + nest build 编译
#   阶段二 运行 :只把产物拷进干净的 Node 镜像 —— 无源码、无 devDependencies,体积小
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable                       # 启用 corepack 以获得 pnpm
COPY package.json pnpm-lock.yaml ./       # 先只拷清单文件,利用 Docker 层缓存:依赖不变则跳过安装
RUN pnpm install --frozen-lockfile
COPY . .                                  # 再拷源码
RUN pnpm prisma:generate && pnpm build    # 生成 Prisma Client + 编译 TS → dist/

# ── 运行阶段 ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma            # 迁移文件要在启动时应用到数据库
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
# 启动入口:见 docker-entrypoint.sh —— 迁移 → 仅首次初始化 seed → 起服务
# (SEED_MODE 控制 seed 内容:minimal 仅超管+分类 / demo 完整演示数据)
ENTRYPOINT ["/app/docker-entrypoint.sh"]
