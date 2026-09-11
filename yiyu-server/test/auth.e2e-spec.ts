/**
 * 认证模块 e2e:注册(邀请码)、登录(停用/错密)、me、改密码。
 * 直连本地 PG(yiyu 库),测试自建自清数据,不动 seed 演示数据。
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { configureApp } from './helpers/configure-app'
import { cleanAll } from './helpers/clean-all'

describe('Auth (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  const username = `e2ea${Date.now().toString(36)}`
  const password = 'test123456'

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    // 幂等:清掉历史运行残留,保证"先造码再注册"的顺序依赖成立
    await cleanAll(prisma, username)
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
    await prisma.inviteCode.create({ data: { code: 'E2EAAAA1', creatorId: admin!.id } })
    await prisma.inviteCode.create({ data: { code: 'E2EBBBB2', creatorId: admin!.id } })
  })

  afterAll(async () => {
    await cleanAll(prisma, username)
    await app.close()
  })

  it('无 token 访问 /auth/me → 401 中文提示', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('请先登录')
  })

  it('注册:邀请码错误 → 400', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send({
      username,
      nickname: '认证测试',
      password,
      inviteCode: 'WRONGCODE',
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('邀请码')
  })

  it('注册:DTO 校验(密码过短)→ 400', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send({
      username,
      nickname: '认证测试',
      password: '123',
      inviteCode: 'E2EAAAA1',
    })
    expect(res.status).toBe(400)
  })

  it('注册:正确邀请码 → 200 返回 token + 普通用户 + 默认账本', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send({
      username,
      nickname: '认证测试',
      password,
      inviteCode: 'E2EAAAA1',
    })
    expect(res.status).toBe(201)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.user.role).toBe('user')
    const books = await prisma.book.findMany({ where: { userId: res.body.data.user.id } })
    expect(books).toHaveLength(1)
    expect(books[0].isDefault).toBe(true)
  })

  it('注册:邀请码已用 → 400;用户名重复 → 409', async () => {
    const r1 = await request(app.getHttpServer()).post('/api/auth/register').send({
      username: `${username}_x`,
      nickname: 'x',
      password,
      inviteCode: 'E2EAAAA1',
    })
    expect(r1.status).toBe(400)
    const r2 = await request(app.getHttpServer()).post('/api/auth/register').send({
      username,
      nickname: 'x',
      password,
      inviteCode: 'E2EBBBB2',
    })
    expect(r2.status).toBe(409)
    await prisma.inviteCode.deleteMany({ where: { code: 'E2EBBBB2' } })
  })

  it('登录:错密码 → 401;正确 → 200;停用 → 403', async () => {
    const bad = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password: 'nope' })
    expect(bad.status).toBe(401)

    const ok = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password })
    expect(ok.status).toBe(200)
    expect(ok.body.data.user.username).toBe(username)

    const u = await prisma.user.findUnique({ where: { username } })
    await prisma.user.update({ where: { id: u!.id }, data: { status: 'disabled' } })
    const dis = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password })
    expect(dis.status).toBe(403)
    // 停用用户的旧 token 也被拒(每次请求查库)
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${ok.body.data.token}`)
    expect(me.status).toBe(401)
    await prisma.user.update({ where: { id: u!.id }, data: { status: 'active' } })
  })

  it('改密码:旧密码错 → 400;正确 → 新密码可登录', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password })
    const token = login.body.data.token
    const bad = await request(app.getHttpServer())
      .put('/api/profile/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'wrong', newPassword: 'new123456' })
    expect(bad.status).toBe(400)

    const ok = await request(app.getHttpServer())
      .put('/api/profile/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: password, newPassword: 'new123456' })
    expect(ok.status).toBe(200)

    const relogin = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password: 'new123456' })
    expect(relogin.status).toBe(200)
  })
})
