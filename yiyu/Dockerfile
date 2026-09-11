# 前端镜像:两段式(多阶段构建)
#   阶段一 build:Node 镜像里 pnpm build 打包(vue-tsc 类型检查 + vite 产物)
#   阶段二 运行 :产物拷进官方 nginx:alpine,由 Nginx 托管静态文件
# 注意:Dockerfile 指令同一行不能跟 # 注释,注释必须独占一行
FROM node:22-alpine AS build
WORKDIR /app
# 启用 corepack 以获得 pnpm
RUN corepack enable
# 先拷清单文件利用层缓存:依赖不变则跳过安装
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# VITE_API_BASE 不设置 → http.ts 里自动回退为相对路径 /api,
# 生产环境由 nginx 反代 /api 到后端(同源,无 CORS),与本地 vite proxy 行为一致
RUN pnpm build

# ── 运行阶段 ──
FROM nginx:alpine
# 构建产物拷到 Nginx 默认站点目录
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# 站点配置(compose 里以只读卷挂载,不打进镜像):deploy/nginx.conf
