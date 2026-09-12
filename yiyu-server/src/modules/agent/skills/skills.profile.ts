import { Injectable, OnModuleInit } from '@nestjs/common'
import { SkillRegistry, type SkillDefinition } from '../skill-registry'
import { UsersService } from '../../users/users.service'
import { InviteCodesService } from '../../invite-codes/invite-codes.service'

/** profile 技能组:查资料/查邀请码(均低风险只读) */
@Injectable()
export class SkillsProfile implements OnModuleInit {
  constructor(
    private registry: SkillRegistry,
    private users: UsersService,
    private invites: InviteCodesService,
  ) {}

  onModuleInit() {
    this.registry.register(...this.definitions())
  }

  private definitions(): SkillDefinition[] {
    const getProfile: SkillDefinition = {
      id: 'profile.get',
      group: 'profile',
      name: 'profile_get',
      label: '查我的资料',
      description: '查询用户自己的个人资料(昵称/头像/简介/性别/生日/地区/注册时间)。用户问"我的资料/个人信息"时用。',
      risk: 'low',
      parameters: { type: 'object', properties: {} },
      handler: async (userId) => {
        const p = await this.users.getProfile(userId)
        return {
          ok: true,
          summary: `昵称:${p.nickname},用户名:${p.username},性别:${p.gender},生日:${p.birthday || '未填'},地区:${p.region || '未填'},注册于 ${p.joinedAt}`,
          card: { cardType: 'profile.info', title: '我的资料', data: { ...p } },
        }
      },
    }

    const listInvites: SkillDefinition = {
      id: 'profile.invites',
      group: 'profile',
      name: 'profile_invites',
      label: '查我的邀请码',
      description: '查询用户自己生成的邀请码列表(码值/状态/创建与使用时间)。"我的邀请码还剩几个"类问题用它。',
      risk: 'low',
      parameters: { type: 'object', properties: {} },
      handler: async (userId) => {
        const rows = await this.invites.listMine(userId)
        const unused = rows.filter((r) => !r.usedAt).length
        return {
          ok: true,
          summary: `共 ${rows.length} 个邀请码,${unused} 个未使用:${rows.slice(0, 5).map((r) => `${r.code}(${r.usedAt ? '已用' : '未用'})`).join('、')}`,
          llmData: { total: rows.length, unused, items: rows.slice(0, 5).map((r) => ({ code: r.code, used: !!r.usedAt })) },
          card: { cardType: 'profile.invites', title: '我的邀请码', data: { rows, unused } },
        }
      },
    }

    return [getProfile, listInvites]
  }
}
