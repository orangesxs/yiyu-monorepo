import { Module } from '@nestjs/common'
import { LedgerController } from './ledger.controller'
import { LedgerService } from './ledger.service'

/** 记账本:账本/分类/流水。跨用户资源一律 403。 */
@Module({
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService], // agent 模块的技能直接函数调用 service(权限校验内聚其中)
})
export class LedgerModule {}
