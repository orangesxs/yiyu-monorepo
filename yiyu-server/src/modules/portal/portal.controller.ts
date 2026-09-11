import { Controller, Get } from '@nestjs/common'
import { PortalService } from './portal.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

/** 广场门户(登录落地页):应用卡摘要聚合,按需轻量 */
@Controller('portal')
export class PortalController {
  constructor(private portal: PortalService) {}

  /** 广场摘要:记账本卡片的当月收支(默认账本口径) */
  @Get('summary')
  summary(@CurrentUser() user: User) {
    return this.portal.summary(user.id)
  }
}
