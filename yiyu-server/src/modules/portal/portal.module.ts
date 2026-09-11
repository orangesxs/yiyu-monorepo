import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'

/** 广场门户模块:应用卡摘要聚合 */
@Module({
  imports: [PrismaModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
