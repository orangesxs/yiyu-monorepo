import { Module } from '@nestjs/common'
import { LedgerController } from './ledger.controller'
import { LedgerService } from './ledger.service'

/** 记账本:账本/分类/流水。跨用户资源一律 403。 */
@Module({
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
