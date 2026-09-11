/**
 * 记账本 e2e:账本/分类/流水 CRUD(分页)、报表聚合、归属校验(跨用户 403)、分类校验。
 * 自建两个用户(A/B)验证数据隔离。响应均为统一包装 { success, code, message, data }。
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { configureApp } from './helpers/configure-app'
import { cleanAll } from './helpers/clean-all'

describe('Ledger (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  const prefix = `e2l${Date.now().toString(36)}`
  const userA = `${prefix}a` // 数据属主
  const userB = `${prefix}b` // 入侵者
  let tokenA = ''
  let tokenB = ''
  let bookA = ''
  let txId = ''
  let catId = { food: '', breakfast: '', lunch: '', salary: '' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    await cleanAll(prisma, prefix)

    // 造两个用户(各一张邀请码,8 位与生产同规格)
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
    await prisma.inviteCode.create({ data: { code: 'E2EAAAA1', creatorId: admin!.id } })
    await prisma.inviteCode.create({ data: { code: 'E2EAAAA2', creatorId: admin!.id } })
    const regA = await request(app.getHttpServer()).post('/api/auth/register').send({
      username: userA, nickname: '甲', password: 'test123456', inviteCode: 'E2EAAAA1',
    })
    const regB = await request(app.getHttpServer()).post('/api/auth/register').send({
      username: userB, nickname: '乙', password: 'test123456', inviteCode: 'E2EAAAA2',
    })
    tokenA = regA.body.data.token
    tokenB = regB.body.data.token

    const books = await request(app.getHttpServer()).get('/api/ledger/books').set('Authorization', `Bearer ${tokenA}`)
    bookA = books.body.data[0].id // 注册自带默认账本

    // 预置分类名 → 真实 cuid 映射(seed 统一 cuid 后不再有可读 ID)
    const cats = await request(app.getHttpServer()).get('/api/ledger/categories?type=expense').set('Authorization', `Bearer ${tokenA}`)
    const income = await request(app.getHttpServer()).get('/api/ledger/categories?type=income').set('Authorization', `Bearer ${tokenA}`)
    const food = cats.body.data.find((c: any) => c.name === '餐饮')
    catId.food = food.id
    catId.breakfast = food.children.find((c: any) => c.name === '早餐').id
    catId.lunch = food.children.find((c: any) => c.name === '午餐').id
    catId.salary = income.body.data.find((c: any) => c.name === '工资').id
  })

  afterAll(async () => {
    await cleanAll(prisma, prefix)
    await app.close()
  })

  it('响应包装:success/code/message/data/timestamp 齐备', async () => {
    const res = await request(app.getHttpServer()).get('/api/ledger/books').set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.code).toBe(0)
    expect(res.body.message).toBe('')
    expect(typeof res.body.timestamp).toBe('number')
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('账本列表:注册自带默认账本,monthExpense 为 0', async () => {
    const res = await request(app.getHttpServer()).get('/api/ledger/books').set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].isDefault).toBe(true)
    expect(res.body.data[0].monthExpense).toBe(0)
  })

  it('新建账本', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/books')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: '装修账', icon: '🏗️' })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('装修账')
    expect(res.body.data.isDefault).toBe(false)
  })

  it('分类列表:预置分类可见(餐饮含 4 个子分类)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ledger/categories?type=expense')
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    const food = res.body.data.find((c: any) => c.id === catId.food)
    expect(food).toBeTruthy()
    expect(food.children).toHaveLength(4)
    // 预置分类不带 custom 标记
    expect(res.body.data.every((c: any) => c.custom === undefined || c.custom === false)).toBe(true)
  })

  it('自定义分类:创建成功;同名(与预置)→ 400', async () => {
    const ok = await request(app.getHttpServer())
      .post('/api/ledger/categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'expense', name: '装修', icon: '🏗️' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.custom).toBe(true)

    const dupPreset = await request(app.getHttpServer())
      .post('/api/ledger/categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'expense', name: '餐饮', icon: '🍜' })
    expect(dupPreset.status).toBe(400)

    const dupCustom = await request(app.getHttpServer())
      .post('/api/ledger/categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'expense', name: '装修', icon: '🏗️' })
    expect(dupCustom.status).toBe(400)

    // B 用户同名不受 A 的自定义影响
    const bCreate = await request(app.getHttpServer())
      .post('/api/ledger/categories')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ type: 'expense', name: '装修', icon: '🏠' })
    expect(bCreate.status).toBe(201)
  })

  it('预置分类删除 → 403/无权', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/ledger/categories/${catId.food}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect([403, 400]).toContain(res.status)
  })

  it('记一笔:预置子分类,categoryName 服务端派生', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/transactions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'expense', amount: 9, categoryId: catId.breakfast,
        date: '2026-09-10 08:30', note: '煎饼果子', bookId: bookA,
      })
    expect(res.status).toBe(201)
    expect(res.body.data.categoryName).toBe('早餐') // 子分类名,非"餐饮"
    expect(res.body.data.amount).toBe(9)
    txId = res.body.data.id
  })

  it('记一笔:金额非法(三位小数)→ 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/transactions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'expense', amount: 9.123, categoryId: catId.breakfast,
        date: '2026-09-10 08:30', bookId: bookA,
      })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe(400)
  })

  it('记一笔:分类与类型不匹配(收入用支出分类)→ 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/transactions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'income', amount: 100, categoryId: catId.breakfast,
        date: '2026-09-10 08:30', bookId: bookA,
      })
    expect(res.status).toBe(400)
  })

  it('跨用户:B 访问 A 的账本流水 → 403', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/ledger/transactions?bookId=${bookA}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(list.status).toBe(403)

    const patch = await request(app.getHttpServer())
      .patch(`/api/ledger/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: 1 })
    expect(patch.status).toBe(403)

    const del = await request(app.getHttpServer())
      .delete(`/api/ledger/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(del.status).toBe(403)
  })

  it('改流水:改金额/分类,categoryName 跟随', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/ledger/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: 10, categoryId: catId.lunch })
    expect(res.status).toBe(200)
    expect(res.body.data.amount).toBe(10)
    expect(res.body.data.categoryName).toBe('午餐')
  })

  it('流水分页:倒序 + from/to 过滤 + 分页字段', async () => {
    // 再记一笔更晚的
    await request(app.getHttpServer())
      .post('/api/ledger/transactions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'income', amount: 2000, categoryId: catId.salary,
        date: '2026-09-09 10:00', note: '工资', bookId: bookA,
      })

    const all = await request(app.getHttpServer())
      .get(`/api/ledger/transactions?bookId=${bookA}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(all.status).toBe(200)
    expect(all.body.data.total).toBe(2)
    expect(all.body.data.items).toHaveLength(2)
    // 倒序:09-10 08:30 > 09-09 10:00
    expect(all.body.data.items[0].date > all.body.data.items[1].date).toBe(true)

    // 默认分页参数回显
    expect(all.body.data.page).toBe(1)

    const ranged = await request(app.getHttpServer())
      .get(`/api/ledger/transactions?bookId=${bookA}&from=2026-09-09&to=2026-09-09`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(ranged.body.data.total).toBe(1)
    expect(ranged.body.data.items[0].categoryName).toBe('工资')

    // pageSize=1 只回 1 条
    const paged = await request(app.getHttpServer())
      .get(`/api/ledger/transactions?bookId=${bookA}&page=1&pageSize=1`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(paged.body.data.items).toHaveLength(1)
    expect(paged.body.data.pageSize).toBe(1)
  })

  it('报表聚合:stats/daily/categories 服务端计算', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/ledger/reports?bookId=${bookA}&from=2026-09-01&to=2026-09-30`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    const r = res.body.data
    // 早餐 10 元(午餐已改)+ 工资 2000
    expect(r.stats.expense).toBe(10)
    expect(r.stats.income).toBe(2000)
    expect(r.stats.balance).toBe(1990)
    expect(r.stats.count).toBe(2)
    // 按日:两天各有聚合
    expect(r.daily).toHaveLength(2)
    expect(r.daily[0]).toMatchObject({ date: '2026-09-09', income: 2000, expense: 0 })
    expect(r.daily[1]).toMatchObject({ date: '2026-09-10', income: 0, expense: 10 })
    // 分类:子分类归并到根分类(早餐/午餐 → 餐饮)
    expect(r.categories.expense[0]).toMatchObject({ name: '餐饮', value: 10 })
    expect(r.categories.income[0]).toMatchObject({ name: '工资', value: 2000 })
    // 月聚合
    expect(r.monthly).toHaveLength(1)
    expect(r.monthly[0]).toMatchObject({ month: '2026-09', income: 2000, expense: 10 })
  })

  it('报表聚合:from 晚于 to → 400;跨用户 bookId → 403', async () => {
    const bad = await request(app.getHttpServer())
      .get(`/api/ledger/reports?bookId=${bookA}&from=2026-09-30&to=2026-09-01`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(bad.status).toBe(400)

    const foreign = await request(app.getHttpServer())
      .get(`/api/ledger/reports?bookId=${bookA}&from=2026-09-01&to=2026-09-30`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(foreign.status).toBe(403)
  })

  it('账本 monthExpense 实时聚合', async () => {
    const res = await request(app.getHttpServer()).get('/api/ledger/books').set('Authorization', `Bearer ${tokenA}`)
    const def = res.body.data.find((b: any) => b.id === bookA)
    expect(def.monthExpense).toBe(10) // 早餐 10 元(已改金额),工资是收入不计
  })

  it('删流水', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/ledger/transactions/${txId}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    const list = await request(app.getHttpServer())
      .get(`/api/ledger/transactions?bookId=${bookA}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(list.body.data.total).toBe(1)
  })

  it('删自定义分类:其下流水 categoryName 冗余兜底', async () => {
    // A 建自定义分类并记一笔(名避开预置 pet「宠物」)
    const cat = await request(app.getHttpServer())
      .post('/api/ledger/categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'expense', name: '宠物美容', icon: '🐱' })
    expect(cat.status).toBe(201)
    const tx = await request(app.getHttpServer())
      .post('/api/ledger/transactions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'expense', amount: 50, categoryId: cat.body.data.id,
        date: '2026-09-10 12:00', note: '猫砂', bookId: bookA,
      })
    expect(tx.body.data.categoryName).toBe('宠物美容')

    const del = await request(app.getHttpServer())
      .delete(`/api/ledger/categories/${cat.body.data.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(del.status).toBe(200)

    const list = await request(app.getHttpServer())
      .get(`/api/ledger/transactions?bookId=${bookA}`)
      .set('Authorization', `Bearer ${tokenA}`)
    const pet = list.body.data.items.find((t: any) => t.note === '猫砂')
    expect(pet).toBeTruthy()
    expect(pet.categoryName).toBe('宠物美容') // 兜底
    expect(pet.categoryId).toBe('') // 已断开
  })
})
