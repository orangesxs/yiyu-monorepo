# Gitee WebHook 自动部署说明

> 2026-09-14 起,自动部署从 GitHub Actions 切换为 Gitee WebHook。
> 原因:阿里云服务器直连 github.com 持续失败(TLS 中断/超时,重试无解),Gitee 国内秒通。

## 链路

```
本地 push → Gitee(orange-up/yiyu main)
          → Gitee WebHook 回调 http://<服务器IP>/webhook/deploy(POST,带 X-Gitee-Token)
          → nginx → webhook 容器(校验签名)
          → 执行 deploy/webhook/deploy.sh:
              remote 幂等指向 Gitee → git pull → docker compose up -d --build db server web
              → 健康检查 GET /api/health
```

GitHub 仓库保留作备份;Actions 手动通道(应急用,见 deploy.yml)。

## 首次启用(服务器上一次性操作)

```bash
# 1. 生成部署私钥(已完成的话跳过)
ssh-keygen -t ed25519 -f ~/.ssh/gitee_deploy -N ""
cat ~/.ssh/gitee_deploy.pub
#    → 公钥添加到 Gitee 仓库「管理 → 部署公钥」(只读)

# 2. 生成 webhook 签名密钥,追加到 deploy/.env
openssl rand -hex 16    # 输出值记为 SECRET
echo "WEBHOOK_SECRET=<SECRET>" >> /root/yiyu-monorepo/deploy/.env
```

3. 启动 webhook 服务(在服务器仓库目录):

```bash
cd /root/yiyu-monorepo/deploy
docker compose up -d --build webhook
```

4. Gitee 网页配置 WebHook:

   - 仓库「管理 → WebHooks → 添加 webHook」
   - URL:`http://<服务器IP>/webhook/deploy`
   - 密码:填第 2 步的 SECRET(事件默认「Push」即可)

## 日常发版

```bash
git pushall   # 一条命令推 origin(GitHub)+ gitee 两边
```

push 到 Gitee 后约半分钟自动完成部署;结果可看 Gitee WebHook 的「请求记录」或服务器上 `docker compose logs webhook`。

## 注意

- **webhook 容器自身不在自动重建范围**(deploy.sh 只重建 db/server/web)——改了 `webhook/` 代码需手动 `docker compose up -d --build webhook`。
- 首次部署若 403:检查 `.env` 的 `WEBHOOK_SECRET` 与 Gitee WebHook「密码」是否一致。
- 首次部署若拉取失败:检查 `~/.ssh/gitee_deploy` 存在且公钥已加到 Gitee 部署公钥。
