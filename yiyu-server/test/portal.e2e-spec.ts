/**
 * 广场门户 e2e:summary 聚合口径(默认账本当月收支)与鉴权。
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { configureApp } from './helpers/configure-app'
import { cleanAll } from './helpers/clean-all'

describe('Portal (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  const prefix = `e2p${Date.now().toString(36)}`
  let token = ''

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    await cleanAll(prisma, prefix)

    const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
    await prisma.inviteCode.create({ data: { code: 'E2EAAAA1', creatorId: admin!.id } })
    const reg = await request(app.getHttpServer()).post('/api/auth/register').send({
      username: prefix, nickname: '门户测试', password: 'test123456', inviteCode: 'E2EAAAA1',
    })
    token = reg.body.data.token
  })

  afterAll(async () => {
    await cleanAll(prisma, prefix)
    await app.close()
  })

  it('无 token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/portal/summary')
    expect(res.status).toBe(401)
  })

  it('新用户(仅默认账本,无流水)→ 摘要为默认账本 + 全 0', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/portal/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.apps.ledger.bookName).toBe('日常账本')
    expect(res.body.data.apps.ledger.monthExpense).toBe(0)
    expect(res.body.data.apps.ledger.monthIncome).toBe(0)
    expect(res.body.data.apps.ledger.monthBalance).toBe(0)
  })

  it('记当月两笔(支 100 收 50.5)→ 摘要按默认账本聚合', async () => {
    const books = await request(app.getHttpServer()).get('/api/ledger/books').set('Authorization', `Bearer ${token}`)
    const bookId = books.body.data[0].id
    const cats = await request(app.getHttpServer())
      .get('/api/ledger/categories?type=expense')
      .set('Authorization', `Bearer ${token}`)
    const catId = cats.body.data[0].id

    // 另建一个账本并记一笔,验证摘要只取默认账本
    const other = await request(app.getHttpServer())
      .post('/api/ledger/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '旅行账', icon: '✈️' })
    const now = new Date()
    const p = (n: number) => (n < 10 ? '0' + n : '' + n)
    const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} 12:00`
    const incomeCats = await request(app.getHttpServer())
      .get('/api/ledger/categories?type=income')
      .set('Authorization', `Bearer ${token}`)
    const incomeCatId = incomeCats.body.data[0].id
    await request(app.getHttpServer()).post('/api/ledger/transactions').set('Authorization', `Bearer ${token}`).send({
      type: 'expense', amount: 999, categoryId: catId, date, bookId: other.body.data.id,
    })
    await request(app.getHttpServer()).post('/api/ledger/transactions').set('Authorization', `Bearer ${token}`).send({
      type: 'expense', amount: 100, categoryId: catId, date, bookId,
    })
    await request(app.getHttpServer()).post('/api/ledger/transactions').set('Authorization', `Bearer ${token}`).send({
      type: 'income', amount: 50.5, categoryId: incomeCatId, date, bookId,
    })

    const res = await request(app.getHttpServer())
      .get('/api/portal/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.apps.ledger.monthExpense).toBe(100)
    expect(res.body.data.apps.ledger.monthIncome).toBe(50.5)
    expect(res.body.data.apps.ledger.monthBalance).toBe(-49.5)
  })

  it('上月流水不计入摘要', async () => {
    const books = await request(app.getHttpServer()).get('/api/ledger/books').set('Authorization', `Bearer ${token}`)
    const bookId = books.body.data[0].id
    const cats = await request(app.getHttpServer())
      .get('/api/ledger/categories?type=expense')
      .set('Authorization', `Bearer ${token}`)
    const catId = cats.body.data[0].id
    const prev = new Date()
    prev.setMonth(prev.getMonth() - 1)
    const p = (n: number) => (n < 10 ? '0' + n : '' + n)
    const date = `${prev.getFullYear()}-${p(prev.getMonth() + 1)}-15 12:00`
    await request(app.getHttpServer()).post('/api/ledger/transactions').set('Authorization', `Bearer ${token}`).send({
      type: 'expense', amount: 777, categoryId: catId, date, bookId,
    })

    const res = await request(app.getHttpServer())
      .get('/api/portal/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.data.apps.ledger.monthExpense).toBe(100) // 上月 777 不计入
  })
})
