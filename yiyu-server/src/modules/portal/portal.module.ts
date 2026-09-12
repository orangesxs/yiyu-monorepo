import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'

/** 广场门户模块:应用卡摘要聚合 */
@Module({
  imports: [PrismaModule],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService], // agent 开场白复用 summary 拼装
})
export class PortalModule {}
