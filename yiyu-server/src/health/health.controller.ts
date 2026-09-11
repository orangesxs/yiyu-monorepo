import { Controller, Get } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'

/** 健康检查:前端/运维探活用 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', time: new Date().toISOString() }
  }
}
