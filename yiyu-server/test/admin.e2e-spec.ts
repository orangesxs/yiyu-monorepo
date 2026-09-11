/**
 * 管理后台 e2e:AdminGuard 拦截、用户管理(建号/改角色/停用/禁自改)、
 * 日志分页筛选、概览统计、邀请码管理。使用 seed 账号(u1 admin / u2 user)。
 * 测试内的变更最后恢复原状(u2 角色、临时用户删除)。
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { configureApp } from './helpers/configure-app'
import { cleanAll } from './helpers/clean-all'

describe('Admin (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let adminToken = ''
  let userToken = ''
  const prefix = `e2d${Date.now().toString(36)}`
  let tempUserId = ''

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    await cleanAll(prisma, prefix)

    const a = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' }) // seed 超管
    adminToken = a.body.data.token
    const b = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'yiyu', password: 'yiyu123456' }) // seed 普通用户
    userToken = b.body.data.token
  })

  afterAll(async () => {
    await cleanAll(prisma, prefix)
    await app.close()
  })

  it('非管理员访问 → 403;未登录 → 401', async () => {
    const no = await request(app.getHttpServer()).get('/api/admin/users')
    expect(no.status).toBe(401)
    const anon = await request(app.getHttpServer()).get('/api/admin/users').set('Authorization', `Bearer ${userToken}`)
    expect(anon.status).toBe(403)
    expect(anon.body.message).toBe('该区域仅管理员可见')
  })

  it('用户目录:keyword/role/status 筛选', async () => {
    const all = await request(app.getHttpServer()).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`)
    expect(all.status).toBe(200)
    expect(all.body.data.length).toBeGreaterThanOrEqual(2) // seed admin + yiyu
    expect(all.body.data[0]).toHaveProperty('registeredAt')
    expect(all.body.data[0]).toHaveProperty('lastActiveAt')

    const kw = await request(app.getHttpServer())
      .get('/api/admin/users?keyword=yiyu')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(kw.body.data).toHaveLength(1)
    expect(kw.body.data[0].name).toBe('一隅')

    const disabled = await request(app.getHttpServer())
      .get('/api/admin/users?status=disabled')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(disabled.body.data.every((u: any) => u.status === 'disabled')).toBe(true)
  })

  it('管理员建号:成功且有默认账本;重名 → 409', async () => {
    const ok = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: `${prefix}tmp`, name: '临时用户', avatar: '🐱', role: 'user', password: 'temp123456' })
    expect(ok.status).toBe(201)
    tempUserId = ok.body.data.id

    const books = await prisma.book.findMany({ where: { userId: tempUserId } })
    expect(books).toHaveLength(1)

    const dup = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: `${prefix}tmp`, name: 'x', avatar: '🐱', role: 'user', password: 'temp123456' })
    expect(dup.status).toBe(409)
  })

  it('禁自改:操作自己 → 400', async () => {
    // seed 超管的 id 动态取(统一 cuid 后不再有 'u1' 可读 ID)
    const meUser = await prisma.user.findUnique({ where: { username: 'admin' } })
    const me = await request(app.getHttpServer())
      .patch(`/api/admin/users/${meUser!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' })
    expect(me.status).toBe(400)
    expect(me.body.message).toContain('自己')
  })

  it('改角色+停用:成功且落安全日志', async () => {
    const role = await request(app.getHttpServer())
      .patch(`/api/admin/users/${tempUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' })
    expect(role.status).toBe(200)

    const dis = await request(app.getHttpServer())
      .patch(`/api/admin/users/${tempUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disabled' })
    expect(dis.status).toBe(200)

    // 建的号能登录验证被停用
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: `${prefix}tmp`, password: 'temp123456' })
    expect(login.status).toBe(403)

    // 日志里应有这两条记录:停用是 security、升角色是 update,都在 admin 模块
    const logs = await request(app.getHttpServer())
      .get('/api/admin/logs?module=admin&pageSize=50')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(logs.body.data.items[0].summary).toContain('停用')
    const roleLog = logs.body.data.items.find((l: any) => l.action === 'update' && l.summary.includes('升为管理员'))
    expect(roleLog).toBeTruthy()
  })

  it('日志分页与筛选:module 筛选计数正确', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/api/admin/logs?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(page1.status).toBe(200)
    expect(page1.body.data.items).toHaveLength(10)
    expect(page1.body.data.total).toBeGreaterThanOrEqual(21)
    // 时间倒序
    expect(page1.body.data.items[0].time >= page1.body.data.items[9].time).toBe(true)
    // operator 联表信息
    expect(page1.body.data.items[0].operator).toHaveProperty('nickname')

    const authOnly = await request(app.getHttpServer())
      .get('/api/admin/logs?module=auth&pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(authOnly.body.data.items.every((l: any) => l.moduleId === 'auth')).toBe(true)
  })

  it('概览:统计口径(资源数,不含金额)+ 近 7 日 + 最近操作', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/dashboard').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.userCount).toBeGreaterThanOrEqual(2)
    expect(res.body.data.bookCount).toBeGreaterThanOrEqual(3)
    expect(res.body.data.logCount).toBeGreaterThanOrEqual(21)
    expect(res.body.data.logCountByDay).toHaveLength(7)
    expect(res.body.data.latestLogs.length).toBeLessThanOrEqual(8)
    // 不含流水金额字段(2026-09-10 精简口径)
    expect(res.body).not.toHaveProperty('txCount')
    expect(res.body).not.toHaveProperty('totalExpense')
  })

  it('邀请码管理:列表+管理员生成(不限额)', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/admin/invite-codes')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(before.status).toBe(200)
    const count = before.body.data.length

    const create = await request(app.getHttpServer())
      .post('/api/admin/invite-codes')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(create.status).toBe(201)
    expect(create.body.data.code).toMatch(/^[A-Z2-9]{8}$/)

    const after = await request(app.getHttpServer())
      .get('/api/admin/invite-codes')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(after.body.data.length).toBe(count + 1)
    // 记录创建人昵称
    expect(after.body.data[0].creator.nickname).toBe('管理员')

    // 清理这枚测试码
    await prisma.inviteCode.delete({ where: { id: create.body.data.id } })
  })

  it('普通用户看不到 admin 接口(所有路由统一 403)', async () => {
    for (const path of ['/api/admin/logs', '/api/admin/dashboard', '/api/admin/invite-codes']) {
      const res = await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    }
  })
})
