#!/bin/sh
# 容器启动:迁移 → 首次初始化才 seed → 起服务
set -e
cd /app

npx prisma migrate deploy

# 仅当用户表为空(首次初始化)才灌 seed,重启不覆盖已有数据。
# SEED_MODE=minimal(默认)→ 仅 admin 超管 + 预置分类;demo → 完整演示数据。
USER_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().user.count().then(c=>{console.log(c);process.exit(0)}).catch(()=>process.exit(1))")
if [ "$USER_COUNT" = "0" ]; then
  echo "首次初始化:执行 seed(mode=${SEED_MODE:-minimal})"
  SEED_MODE=${SEED_MODE:-minimal} npx prisma db seed
else
  echo "已有 $USER_COUNT 个用户,跳过 seed"
fi

exec node dist/main.js
