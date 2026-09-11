/**
 * 「一隅」种子数据,两种模式(SEED_MODE 环境变量):
 * - demo(默认,开发环境):admin 超管 + yiyu 演示用户(预置/自定义分类、
 *   3 账本、593 笔流水、2 邀请码、21 日志,流水锚定真实当前日期)
 * - minimal(部署环境):仅 admin 超管账号 + 全局预置分类,无任何业务数据;
 *   普通用户由注册(邀请码)产生,邀请码由 admin 在后台生成
 * 可重复执行:先清空全部表再写入。
 */
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()
/** 'demo' | 'minimal' */
const SEED_MODE = process.env.SEED_MODE === 'minimal' ? 'minimal' : 'demo'

/* ───────────────────────── 工具 ───────────────────────── */

function pad(n: number) {
  return n < 10 ? '0' + n : '' + n
}

/** Date → PG timestamp(本地时区,与 API 序列化口径一致) */
function ts(d: Date): Date {
  return d
}

/** 伪随机(seed 固定,保证每次 seed 出同样的演示数据) */
let seedState = 42
function rnd() {
  seedState = (seedState * 9301 + 49297) % 233280
  return seedState / 233280
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}
function amt(base: number, jitter = 0.35) {
  return +(base * (1 - jitter + rnd() * jitter * 2)).toFixed(2)
}

/** 今天 20:00 为"数据基准点"(与前端 mock 同思路:当天已有晚间流水) */
const TODAY = (() => {
  const d = new Date()
  d.setHours(20, 0, 0, 0)
  return d
})()

function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d
}

/* ───────────────────────── 用户 ───────────────────────── */

const USER_SEED = [
  { key: 'u1', username: 'admin', password: 'admin123456', nickname: '管理员', avatar: '🧑‍💻', role: 'admin', status: 'active', registeredAt: daysAgo(125, 9, 10), lastActiveAt: daysAgo(0, 21, 36), bio: '系统管理员。' },
]

/** 仅 demo 模式写入的演示用户 */
const DEMO_USER = { key: 'u2', username: 'yiyu', password: 'yiyu123456', nickname: '一隅', avatar: '👩', role: 'user', status: 'active', registeredAt: daysAgo(111, 14, 20), lastActiveAt: daysAgo(0, 19, 2), bio: '认真记账,好好生活。' }

/* ───────────────────────── 预置分类(照搬前端 mock) ───────────────────────── */

const PRESET_CATEGORIES: { key: string; type: 'expense' | 'income'; name: string; icon: string; children: { key: string; name: string }[] }[] = [
  { key: 'food', type: 'expense', name: '餐饮', icon: '🍜', children: [{ key: 'food-breakfast', name: '早餐' }, { key: 'food-lunch', name: '午餐' }, { key: 'food-dinner', name: '晚餐' }, { key: 'food-snack', name: '零食饮料' }] },
  { key: 'transport', type: 'expense', name: '交通', icon: '🚇', children: [{ key: 'transport-subway', name: '地铁公交' }, { key: 'transport-taxi', name: '打车' }, { key: 'transport-fuel', name: '加油' }] },
  { key: 'shopping', type: 'expense', name: '购物', icon: '🛒', children: [{ key: 'shopping-daily', name: '日用' }, { key: 'shopping-cloth', name: '服饰' }, { key: 'shopping-digital', name: '数码' }] },
  { key: 'housing', type: 'expense', name: '居住', icon: '🏠', children: [{ key: 'housing-rent', name: '房租' }, { key: 'housing-utility', name: '水电物业' }] },
  { key: 'fun', type: 'expense', name: '娱乐', icon: '🎮', children: [{ key: 'fun-movie', name: '电影演出' }, { key: 'fun-game', name: '游戏' }, { key: 'fun-video', name: '视频会员' }] },
  { key: 'medical', type: 'expense', name: '医疗', icon: '💊', children: [{ key: 'medical-drug', name: '药品' }, { key: 'medical-check', name: '体检' }] },
  { key: 'social', type: 'expense', name: '人情', icon: '🧧', children: [{ key: 'social-gift', name: '礼物' }, { key: 'social-dinner', name: '请客' }] },
  { key: 'study', type: 'expense', name: '教育', icon: '📚', children: [{ key: 'study-book', name: '书籍' }, { key: 'study-course', name: '课程' }] },
  { key: 'pet', type: 'expense', name: '宠物', icon: '🐱', children: [{ key: 'pet-food', name: '猫粮' }, { key: 'pet-vet', name: '医疗' }] },
  { key: 'salary', type: 'income', name: '工资', icon: '💰', children: [] },
  { key: 'parttime', type: 'income', name: '兼职', icon: '💼', children: [] },
  { key: 'invest', type: 'income', name: '理财', icon: '📈', children: [] },
  { key: 'redpacket', type: 'income', name: '红包', icon: '🧧', children: [] },
  { key: 'refund', type: 'income', name: '退款', icon: '↩️', children: [] },
]

/* ───────────────────────── 流水生成器(移植自前端 mock,锚定 TODAY) ───────────────────────── */

const lunchNotes = ['公司楼下 麻辣烫', '和同事 食堂', '外卖 黄焖鸡', '兰州拉面', '沙县小吃', '茶餐厅 双拼', '外卖 咖喱饭', '公司的轻食']
const dinnerNotes = ['火锅 人均90', '下班和对象吃饭', '夜市烧烤', '家常菜', '日料定食', '川菜馆', '自己做饭 买菜']
const breakfastNotes = ['煎饼果子', '包子豆浆', '地铁口肠粉', '三明治 + 咖啡', '茶叶蛋 白粥']
const taxiNotes = ['加班打车回家', '下雨打车', '赶高铁', '太晚了打车']
const shopNotes = ['超市周采购', '纸巾 洗发水', '京东 洗衣凝珠', '生鲜 水果', '山姆囤货']
const funNotes = ['电影 档期新片', '周末剧本杀', '游戏 月卡', 'KTV 团建', '视频会员续费']
const socialNotes = ['同事结婚 随礼', '朋友生日礼物', '请爸妈吃饭', '满月酒 随礼']

interface ExpensePool {
  pool: () => [string, number]
  cat: [string, string] // [categoryId, categoryName]
  freq: number
}

const b1Pools: ExpensePool[] = [
  { pool: () => [pick(breakfastNotes), amt(9, 0.4)], cat: ['food-breakfast', '早餐'], freq: 0.55 },
  { pool: () => [pick(lunchNotes), amt(26, 0.45)], cat: ['food-lunch', '午餐'], freq: 0.95 },
  { pool: () => [pick(dinnerNotes), amt(52, 0.6)], cat: ['food-dinner', '晚餐'], freq: 0.75 },
  { pool: () => [pick(['奶茶', '瑞幸生椰拿铁', '咖啡续命', '喜茶']), amt(18, 0.4)], cat: ['food-snack', '零食饮料'], freq: 0.6 },
  { pool: () => ['地铁通勤', 6], cat: ['transport-subway', '地铁公交'], freq: 0.7 },
  { pool: () => [pick(taxiNotes), amt(34, 0.5)], cat: ['transport-taxi', '打车'], freq: 0.22 },
  { pool: () => [pick(shopNotes), amt(96, 0.55)], cat: ['shopping-daily', '日用'], freq: 0.3 },
  { pool: () => [pick(funNotes), amt(58, 0.6)], cat: [rnd() > 0.5 ? 'fun-movie' : 'fun-game', '娱乐'], freq: 0.18 },
  { pool: () => [pick(['猫罐头', '猫砂', '猫条冻干', '猫粮补给']), amt(115, 0.5)], cat: ['pet-food', '猫粮'], freq: 0.12 },
  { pool: () => [pick(['优衣库 换季', '淘宝 秋装', '球鞋 冲动消费']), amt(320, 0.6)], cat: ['shopping-cloth', '服饰'], freq: 0.08 },
  { pool: () => [pick(['微信读书年卡', '买书 网易蜗牛', 'B站大会员']), amt(48, 0.5)], cat: ['study-book', '书籍'], freq: 0.1 },
]

interface TxRow {
  type: 'expense' | 'income'
  amount: number
  categoryId: string
  categoryName: string
  bookId: string
  date: Date
  note: string
}

/** 日常账本(370 天,周期固定支出 + 日常散笔) */
function generateDailyBook(): TxRow[] {
  const list: TxRow[] = []
  for (let i = 0; i < 370; i++) {
    const day = new Date(TODAY)
    day.setDate(TODAY.getDate() - i)
    const dow = day.getDay()
    const ym = day.getMonth() + 1
    const dom = day.getDate()
    const isToday = i === 0
    const y = day.getFullYear()
    const m = day.getMonth()

    // 房租:每月 1 号
    if (dom === 1) {
      list.push({ type: 'expense', amount: 3200, categoryId: 'housing-rent', categoryName: '房租', bookId: 'b1', date: new Date(y, m, 1, 9, 10), note: '房租 月付' })
    }
    // 水电物业:每月 5 号
    if (dom === 5) {
      list.push({ type: 'expense', amount: amt(180, 0.3), categoryId: 'housing-utility', categoryName: '水电物业', bookId: 'b1', date: new Date(y, m, 5, 11, 0), note: ym === 7 || ym === 8 ? '夏天空调费 有点吓人' : '水电燃气' })
    }
    // 视频会员:每月 12 号
    if (dom === 12) {
      list.push({ type: 'expense', amount: 25, categoryId: 'fun-video', categoryName: '视频会员', bookId: 'b1', date: new Date(y, m, 12, 8, 30), note: '爱奇艺连续包月' })
    }
    // 猫粮囤货:每月 18 号
    if (dom === 18) {
      list.push({ type: 'expense', amount: amt(139, 0.35), categoryId: 'pet-food', categoryName: '猫粮', bookId: 'b1', date: new Date(y, m, 18, 21, 0), note: '猫粮 + 猫砂 囤货' })
    }
    // 理发:每月 26 号
    if (dom === 26) {
      list.push({ type: 'expense', amount: amt(68, 0.4), categoryId: 'shopping-daily', categoryName: '日用', bookId: 'b1', date: new Date(y, m, 26, 19, 0), note: '理发' })
    }
    // 工资:每月 10 号(1 月另有年终奖)
    if (dom === 10) {
      list.push({ type: 'income', amount: amt(12800, 0.06), categoryId: 'salary', categoryName: '工资', bookId: 'b1', date: new Date(y, m, 10, 10, 0), note: ym === 1 ? '工资 + 年终奖尾款' : '工资 到账' })
      if (ym === 1) {
        list.push({ type: 'income', amount: 26000, categoryId: 'salary', categoryName: '工资', bookId: 'b1', date: new Date(y, 0, 15, 10, 0), note: '年终奖 🧨' })
      }
    }
    // 理财收益:每周一
    if (dow === 1) {
      list.push({ type: 'income', amount: amt(42, 0.7), categoryId: 'invest', categoryName: '理财', bookId: 'b1', date: new Date(y, m, dom, 15, 0), note: '基金收益' })
    }
    // 偶发收入
    if (dom === 15 && rnd() < 0.5) {
      list.push({ type: 'income', amount: amt(380, 0.5), categoryId: 'parttime', categoryName: '兼职', bookId: 'b1', date: new Date(y, m, 15, 14, 20), note: '兼职稿费' })
    }
    if (dom === 2 && rnd() < 0.4) {
      list.push({ type: 'income', amount: amt(88, 0.6), categoryId: 'refund', categoryName: '退款', bookId: 'b1', date: new Date(y, m, 2, 16, 40), note: '退货退款' })
    }
    if (ym === 2 && dom === 9) {
      list.push({ type: 'income', amount: 1200, categoryId: 'redpacket', categoryName: '红包', bookId: 'b1', date: new Date(y, 1, 9, 12, 0), note: '长辈给的红包' })
    }
    // 人情 / 医疗:低频随机
    if (rnd() < 0.035) {
      list.push({ type: 'expense', amount: amt(320, 0.7), categoryId: 'social-gift', categoryName: '礼物', bookId: 'b1', date: new Date(y, m, dom, 12 + Math.floor(rnd() * 8), Math.floor(rnd() * 60)), note: pick(socialNotes) })
    }
    if (rnd() < 0.012) {
      list.push({ type: 'expense', amount: amt(260, 0.4), categoryId: 'medical-drug', categoryName: '药品', bookId: 'b1', date: new Date(y, m, dom, 15, 30), note: pick(['感冒药 维C', '体检复查', '超市 药品']) })
    }
    // 日常散笔(周末加成)
    const weekendBoost = dow === 0 || dow === 6 ? 1.6 : 1
    const count = Math.round((1 + rnd() * 2.2) * weekendBoost) + (isToday ? 1 : 0)
    for (let j = 0; j < count; j++) {
      const weighted = [...b1Pools]
      if (dow === 0 || dow === 6) weighted.push(b1Pools[2], b1Pools[7])
      const p = pick(weighted)
      if (rnd() > p.freq) continue
      const [note, amount] = p.pool()
      const t = new Date(y, m, dom, 7 + Math.floor(rnd() * 14), Math.floor(rnd() * 60))
      if (t > TODAY) continue
      list.push({ type: 'expense', amount, categoryId: p.cat[0], categoryName: p.cat[1], bookId: 'b1', date: t, note })
    }
  }
  return list
}

/** 装修账(10 个月,大额低频,归入 yiyu 自定义分类「装修」的子分类) */
function generateDecorBook(): TxRow[] {
  const list: TxRow[] = []
  const items: [string, string, number][] = [
    ['材料', '瓷砖 地砖', 8600], ['材料', '乳胶漆 全屋', 3200], ['材料', '定制柜体 定金', 12000], ['材料', '木地板 客厅', 7800],
    ['人工', '水电改造', 9200], ['人工', '泥瓦工 贴砖', 8800], ['人工', '油工 刷漆', 6400], ['人工', '安装费 灯具五金', 2300],
    ['家具', '沙发 布艺三人位', 4600], ['家具', '餐桌椅 实木', 3100],
    ['家电', '空调 挂机×2', 7400], ['家电', '冰箱 双开门', 5200], ['家电', '洗碗机 13套', 4300], ['家电', '扫地机器人', 2600],
    ['软装', '窗帘 遮光', 1800], ['软装', '绿植 花架', 620],
    ['设计', '设计费 半包方案', 5000],
  ]
  for (let k = 0; k < 20; k++) {
    const item = items[Math.floor(rnd() * items.length)]
    const back = Math.floor((k / 20) * 290 + rnd() * 14)
    const day = new Date(TODAY)
    day.setDate(TODAY.getDate() - back)
    const hour = 10 + Math.floor(rnd() * 9)
    list.push({
      type: 'expense',
      amount: +(item[2] * (0.85 + rnd() * 0.3)).toFixed(2),
      categoryId: `custom-decor-${item[0]}`,
      categoryName: item[0],
      bookId: 'b2',
      date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 30),
      note: item[1],
    })
  }
  return list
}

/** 旅行基金(每月 8 号定投 + 少量预支) */
function generateTravelBook(): TxRow[] {
  const list: TxRow[] = []
  for (let m = 0; m < 9; m++) {
    const day = new Date(TODAY.getFullYear(), TODAY.getMonth(), 8)
    day.setMonth(day.getMonth() - m)
    list.push({ type: 'income', amount: 2000, categoryId: 'salary', categoryName: '工资', bookId: 'b3', date: new Date(day.getFullYear(), day.getMonth(), 8, 9, 0), note: '旅行基金定存' })
  }
  const spends: [string, number][] = [
    ['酒店 预付两晚', 736], ['机票 往返', 1580],
    ['演出票 川剧', 320], ['火锅店 探店', 186],
  ]
  for (let s = 0; s < spends.length; s++) {
    const day = new Date(TODAY)
    day.setDate(TODAY.getDate() - 10 + s * 3)
    if (day > TODAY) continue
    list.push({ type: 'expense', amount: spends[s][1], categoryId: 'custom-trip', categoryName: '旅行', bookId: 'b3', date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 20, 10), note: spends[s][0] })
  }
  return list
}

/* ───────────────────────── 系统日志(最近 7 天,约 21 条) ───────────────────────── */

const LOG_SEED: [number, number, number, string, string, string, string][] = [
  // [daysAgo, hour, minute, module, action, operatorId, summary]
  [0, 21, 36, 'auth', 'login', 'u2', '「一隅」登录了一隅'],
  [0, 21, 40, 'ledger', 'create', 'u2', '记了一笔支出「早餐 · ¥9.00」'],
  [0, 19, 5, 'ledger', 'update', 'u2', '修改了流水「地铁通勤」的金额'],
  [0, 10, 31, 'ledger', 'create', 'u2', '记了一笔支出「农贸市场 · ¥68.50」'],
  [0, 9, 2, 'profile', 'update', 'u2', '更新了个性签名'],
  [1, 22, 18, 'auth', 'login', 'u2', '「一隅」登录了一隅'],
  [1, 20, 15, 'ledger', 'delete', 'u2', '删除了一笔重复记的支出'],
  [1, 14, 26, 'ledger', 'create', 'u2', '在旅行基金记了一笔收入「退款 ¥320.00」'],
  [2, 21, 20, 'auth', 'login', 'u2', '「一隅」登录了一隅'],
  [2, 16, 40, 'ledger', 'update', 'u2', '修改了流水「外卖 黄焖鸡」的备注'],
  [3, 20, 55, 'auth', 'login', 'u2', '「一隅」登录了一隅'],
  [3, 19, 30, 'ledger', 'create', 'u2', '记了一笔收入「兼职结算 ¥1,200.00」'],
  [3, 12, 48, 'profile', 'update', 'u2', '更换了头像'],
  [4, 23, 5, 'admin', 'security', 'u1', '管理员登录了系统'],
  [4, 17, 22, 'ledger', 'create', 'u2', '新建了账本「宠物开支」'],
  [4, 9, 15, 'auth', 'login', 'u2', '「一隅」登录了一隅'],
  [5, 18, 44, 'admin', 'login', 'u1', '「管理员」登录了后台'],
  [5, 15, 8, 'ledger', 'update', 'u2', '重命名了账本「日常」为「日常开支」'],
  [6, 22, 40, 'admin', 'update', 'u1', '管理员更新了系统配置'],
  [6, 20, 12, 'auth', 'login', 'u2', '「一隅」登录了一隅'],
  [6, 9, 30, 'admin', 'security', 'u1', '管理员生成了邀请码'],
]

/* ───────────────────────── 主流程 ───────────────────────── */

async function main() {
  console.log('清空旧数据…')
  await prisma.$transaction([
    prisma.adminLog.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.inviteCode.deleteMany(),
    prisma.category.deleteMany(),
    prisma.book.deleteMany(),
    prisma.user.deleteMany(),
  ])

  // key → 真实 cuid 映射,后续外键引用一律查此表
  const ids: Record<string, string> = {}

  console.log(`写入用户(mode=${SEED_MODE})…`)
  const users = SEED_MODE === 'demo' ? [...USER_SEED, DEMO_USER] : USER_SEED
  for (const { key, password, ...u } of users) {
    const user = await prisma.user.create({
      data: { ...u, passwordHash: await bcrypt.hash(password, 10), birthday: null },
    })
    ids[key] = user.id
  }

  console.log('写入预置分类…')
  for (const c of PRESET_CATEGORIES) {
    const root = await prisma.category.create({
      data: { type: c.type, name: c.name, icon: c.icon, parentId: null },
    })
    ids[c.key] = root.id
    for (const ch of c.children) {
      const child = await prisma.category.create({
        data: { type: c.type, name: ch.name, icon: '', parentId: root.id },
      })
      ids[ch.key] = child.id
    }
  }

  // 以下业务数据仅 demo 模式写入
  if (SEED_MODE !== 'demo') {
    const counts = {
      users: await prisma.user.count(),
      categories: await prisma.category.count(),
      books: await prisma.book.count(),
      transactions: await prisma.transaction.count(),
      inviteCodes: await prisma.inviteCode.count(),
      adminLogs: await prisma.adminLog.count(),
    }
    console.log('seed 完成(干净库,仅 admin + 预置分类):', counts)
    return
  }

  console.log('写入 yiyu 的自定义分类(装修/旅行)…')
  const decorRoot = await prisma.category.create({ data: { ownerId: ids.u2, type: 'expense', name: '装修', icon: '🏗️' } })
  ids['custom-decor'] = decorRoot.id
  for (const bucket of ['材料', '人工', '家具', '家电', '软装', '设计']) {
    const child = await prisma.category.create({
      data: { ownerId: ids.u2, type: 'expense', name: bucket, icon: '', parentId: decorRoot.id },
    })
    ids[`custom-decor-${bucket}`] = child.id
  }
  const tripCat = await prisma.category.create({ data: { ownerId: ids.u2, type: 'expense', name: '旅行', icon: '✈️' } })
  ids['custom-trip'] = tripCat.id

  console.log('写入账本…')
  const bookSeeds: { key: string; name: string; icon: string; isDefault?: boolean }[] = [
    { key: 'b1', name: '日常账本', icon: '📘', isDefault: true },
    { key: 'b2', name: '装修账', icon: '🏗️' },
    { key: 'b3', name: '旅行基金', icon: '✈️' },
  ]
  for (const b of bookSeeds) {
    const book = await prisma.book.create({ data: { userId: ids.u2, name: b.name, icon: b.icon, isDefault: b.isDefault ?? false } })
    ids[b.key] = book.id
  }

  console.log('生成流水(日常 370 天 + 装修 + 旅行)…')
  const txs = [...generateDailyBook(), ...generateDecorBook(), ...generateTravelBook()]
  await prisma.transaction.createMany({
    data: txs.map((t) => ({
      userId: ids.u2,
      bookId: ids[t.bookId],
      type: t.type,
      amount: t.amount,
      categoryId: ids[t.categoryId],
      categoryName: t.categoryName,
      date: ts(t.date),
      note: t.note,
    })),
  })

  console.log('写入邀请码(2 张未使用)…')
  await prisma.inviteCode.create({ data: { code: 'LLKK2345', creatorId: ids.u2 } })
  await prisma.inviteCode.create({ data: { code: 'MMNN6789', creatorId: ids.u2 } })

  console.log('写入系统日志(21 条)…')
  for (const [d, h, mi, module, action, operator, summary] of LOG_SEED) {
    await prisma.adminLog.create({
      data: { time: daysAgo(d, h, mi), module, action, operatorId: ids[operator], summary },
    })
  }

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    books: await prisma.book.count(),
    transactions: await prisma.transaction.count(),
    inviteCodes: await prisma.inviteCode.count(),
    adminLogs: await prisma.adminLog.count(),
  }
  console.log('seed 完成(demo 演示数据):', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
