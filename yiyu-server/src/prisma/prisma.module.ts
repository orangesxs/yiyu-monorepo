import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/** 全局导出 PrismaService,业务模块无需重复 import */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
