// 「一隅」Gitee WebHook 自动部署监听服务
//
// 链路:push 到 Gitee main → Gitee 回调 POST /deploy → 校验签名 → 执行 deploy.sh → 返回结果
// 安全:X-Gitee-Token 头与 .env 的 WEBHOOK_SECRET 比对(恒定时间比较),不符一律 403
//
// 零依赖,Node 20 原生模块;密码学比较用 crypto.timingSafeEqual
const http = require('node:http')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')

const PORT = Number(process.env.PORT || 9000)
const SECRET = process.env.WEBHOOK_SECRET || ''
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/srv/deploy.sh'
const LOG_TAIL = Number(process.env.LOG_TAIL || 40)

// 部署同一时刻只跑一个:Gitee 对超时会重试,排队比并发安全
let running = false

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function runDeploy() {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString()
    console.log(`[${startedAt}] 部署开始:执行 ${DEPLOY_SCRIPT}`)
    execFile('bash', [DEPLOY_SCRIPT], { timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
      const output = (stdout + '\n' + stderr).slice(-4000)
      if (err) {
        console.error(`部署失败: ${err.message}\n${output}`)
        resolve({ ok: false, output })
      } else {
        console.log(`部署成功\n${output}`)
        resolve({ ok: true, output })
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  // 健康自检(容器 healthcheck 用)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end(running ? 'busy' : 'ok')
  }

  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404)
    return res.end('not found')
  }

  // 签名校验:Gitee WebHook 配置的密码会放在 X-Gitee-Token 头
  const token = req.headers['x-gitee-token'] || ''
  if (!SECRET || !safeEqual(token, SECRET)) {
    console.warn(`签名不符的请求被拒绝: ${req.socket.remoteAddress}`)
    res.writeHead(403)
    return res.end('forbidden')
  }

  if (running) {
    res.writeHead(202)
    return res.end('deploy already running')
  }
  running = true
  res.writeHead(202, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('deploy accepted')

  const { ok, output } = await runDeploy()
  running = false
  console.log(`部署结果: ${ok ? '成功' : '失败'};日志尾部:\n${output.slice(-LOG_TAIL * 80)}`)
})

server.listen(PORT, () => console.log(`webhook 监听 :${PORT},部署脚本 ${DEPLOY_SCRIPT}`))
