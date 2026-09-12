import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type LogModule = 'auth' | 'ledger' | 'profile' | 'admin' | 'agent'
export type LogAction = 'login' | 'create' | 'update' | 'delete' | 'security'

/**
 * 系统日志服务:全站唯一的 admin_logs 写入口。
 * 摘要为中文一句话(≤40 字,DDL 有 VarChar(40) 截断保护),文风对齐前端 mock 时代日志。
 * 写日志失败不影响主流程(catch 后仅打运行日志)。
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(module: LogModule, action: LogAction, operatorId: string, summary: string) {
    try {
      await this.prisma.adminLog.create({
        data: { module, action, operatorId, summary: summary.slice(0, 40) },
      })
    } catch (e) {
      console.error('[audit] 日志写入失败:', e)
    }
  }
}
