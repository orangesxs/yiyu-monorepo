import { INestApplication, ValidationPipe } from '@nestjs/common'
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter'
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor'

/** 与 main.ts 同构的 app 装配(前缀/管道/拦截器/过滤器),保证 e2e 测的就是线上行为 */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())
}
