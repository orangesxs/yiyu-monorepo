import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

/** 管理后台:用户管理/系统日志/邀请码/概览。AdminGuard 统一在 controller 层挂载。 */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
