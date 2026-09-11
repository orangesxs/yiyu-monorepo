import { Controller, Get, Post } from '@nestjs/common'
import { InviteCodesService } from './invite-codes.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

/** 「我的邀请码」:个人中心消费,归用户档案域 /api/profile/invite-codes */
@Controller('profile/invite-codes')
export class InviteCodesController {
  constructor(private invites: InviteCodesService) {}

  @Get()
  listMine(@CurrentUser() user: User) {
    return this.invites.listMine(user.id)
  }

  @Post()
  create(@CurrentUser() user: User) {
    return this.invites.create(user.id, user.role === 'admin')
  }
}
