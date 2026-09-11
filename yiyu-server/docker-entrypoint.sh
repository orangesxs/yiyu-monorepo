#!/bin/sh
# 后端容器启动入口:迁移 → 首次初始化才 seed → 起服务
# 每次容器启动(含重启/升级)都会执行本脚本
set -e                  # 任一步失败立即退出,容器转入失败状态,便于 compose 重启或暴露问题
cd /app

# 1. 应用数据库迁移:把 prisma/migrations 里的变更同步到数据库(建表/加列等)
npx prisma migrate deploy

# 2. 仅当用户表为空(即首次初始化的空库)才灌 seed;
#    日常重启/升级时库里已有用户,自动跳过,不会覆盖任何已有数据。
#    SEED_MODE=minimal(默认)→ 仅 admin 超管 + 预置全局分类,无业务数据
#    SEED_MODE=demo         → 完整演示数据(yiyu 用户 + 流水等)
USER_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().user.count().then(c=>{console.log(c);process.exit(0)}).catch(()=>process.exit(1))")
if [ "$USER_COUNT" = "0" ]; then
  echo "首次初始化:执行 seed(mode=${SEED_MODE:-minimal})"
  SEED_MODE=${SEED_MODE:-minimal} npx prisma db seed
else
  echo "已有 $USER_COUNT 个用户,跳过 seed"
fi

# 3. 启动 NestJS 服务(exec 让 node 成为 1 号进程,能正确接收停止信号)
exec node dist/main.js
