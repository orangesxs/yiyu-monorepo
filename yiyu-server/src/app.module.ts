import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { AuditModule } from './common/audit/audit.module'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { InviteCodesModule } from './modules/invite-codes/invite-codes.module'
import { LedgerModule } from './modules/ledger/ledger.module'
import { AdminModule } from './modules/admin/admin.module'
import { PortalModule } from './modules/portal/portal.module'
import { HealthController } from './health/health.controller'

/**
 * 「一隅」后端根模块。
 * 全局:ThrottlerGuard(限流兜底,默认 60 次/分/IP;敏感路由自行加严)。
 * 业务模块按里程碑挂载:auth(M2)→ users/invite-codes(M2)→ ledger(M3)→ admin(M4)。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局限流兜底:60 次/分/IP;登录注册等敏感路由在 controller 上自行加严(5 次/分)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    InviteCodesModule,
    LedgerModule,
    AdminModule,
    PortalModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
