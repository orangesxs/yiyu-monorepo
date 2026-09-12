import { Injectable, OnModuleInit } from '@nestjs/common'
import { SkillRegistry, type SkillDefinition } from '../skill-registry'

/** 通用技能组:纯内置、不依赖外部 API、不隶属业务模块 */
@Injectable()
export class SkillsCommon implements OnModuleInit {
  constructor(private registry: SkillRegistry) {}

  onModuleInit() {
    this.registry.register(...this.definitions())
  }

  private definitions(): SkillDefinition[] {
    const dateCalc: SkillDefinition = {
      id: 'common.date_calc',
      group: 'common',
      name: 'common_date_calc',
      label: '日期计算',
      description: '日期推算:给定基准日期(缺省今天)加/减 N 天,返回目标日期与星期。如"3天前是几号""下月第一天"前的推算。',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          base: { type: 'string', description: '基准日期 YYYY-MM-DD,缺省今天' },
          days: { type: 'number', description: '偏移天数,正为未来负为过去' },
        },
        required: ['days'],
      },
      handler: async (_userId, args) => {
        const days = Number(args.days ?? 0)
        const m = String(args.base ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
        const base = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date()
        const target = new Date(base.getTime() + days * 86400000)
        const p = (n: number) => String(n).padStart(2, '0')
        const weekdays = ['日', '一', '二', '三', '四', '五', '六']
        const date = `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`
        return {
          ok: true,
          summary: `${date} 星期${weekdays[target.getDay()]}`,
          llmData: { date, weekday: `星期${weekdays[target.getDay()]}` },
        }
      },
    }

    return [dateCalc]
  }
}
