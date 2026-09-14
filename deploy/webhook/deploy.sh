#!/usr/bin/env bash
# 「一隅」部署脚本:由 webhook 容器调用执行
# 环境:webhook 容器内(挂载 /repo=服务器仓库目录、docker.sock、/root/.ssh)
set -e
cd /repo

# 幂等自愈:remote 指向 Gitee + 部署私钥 + 首次连 gitee.com 自动信任主机指纹
GITEE_URL="git@gitee.com:orange-up/yiyu.git"
if [ "$(git remote get-url origin)" != "$GITEE_URL" ]; then
  echo "origin 指向 $(git remote get-url origin),切换为 Gitee…"
  git remote set-url origin "$GITEE_URL"
fi
if ! grep -q "gitee_deploy" /root/.ssh/config 2>/dev/null; then
  printf 'Host gitee.com\n  IdentityFile /root/.ssh/gitee_deploy\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' >> /root/.ssh/config
fi

# 拉取(Gitee 国内可达,一般一次即通;保留 3 次重试兜底)
for i in 1 2 3; do
  if git pull --ff-only; then break; fi
  [ "$i" = "3" ] && { echo "::error::git pull 三次均失败,检查服务器 ~/.ssh/gitee_deploy 与 Gitee 部署公钥"; exit 1; }
  echo "git pull 失败,5 秒后重试($i/3)…"; sleep 5
done

HEAD=$(git rev-parse --short HEAD)
echo "部署提交: $HEAD"

cd /repo/deploy
# 逐个指定服务:不含 webhook 自身——重建自己会杀掉正在执行的部署进程;
# webhook 代码变更时需手动执行 docker compose up -d --build webhook
docker compose up -d --build db server web
docker compose ps

# 健康检查:容器网络内直接访问 web 的 nginx(它反代 /api)
sleep 5
if curl -sf http://web/api/health > /dev/null; then
  echo "健康检查通过,部署完成: $HEAD"
else
  echo "::error::后端健康检查失败"
  docker compose logs --tail 30 server
  exit 1
fi
