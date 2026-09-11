import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

/**
 * 入口:全局前缀 /api、校验管道、异常过滤器、helmet、CORS。
 * 本地联调走前端 vite proxy(同源,无 CORS);CORS 白名单留部署期配置。
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.setGlobalPrefix('api')
  app.use(helmet({ crossOriginResourcePolicy: false }))
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
    credentials: true,
  })

  // 全局校验:DTO 用 class-validator 装饰器,非法入参直接 400(中文 message 在 DTO 定义)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥掉 DTO 未声明的字段
      transform: true, // query 参数按类型标注转换
    }),
  )
  // 全局成功包装:{ success, code: 0, message, data, timestamp }
  app.useGlobalInterceptors(new TransformInterceptor())
  // 全局异常:同构错误包装(中文 message,code=HTTP 状态码)
  app.useGlobalFilters(new AllExceptionsFilter())

  const port = Number(process.env.PORT) || 3000
  await app.listen(port)
  console.log(`[yiyu-server] listening on http://localhost:${port}/api`)
}
bootstrap()
