# 「一隅」前端多阶段构建:node 构建产物交给 nginx 托管
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# VITE_API_BASE 留空 → 前端走同源 /api,由反代转发
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
