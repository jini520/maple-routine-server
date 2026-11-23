import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'

import { AppModule } from './app.module'
import { registerImageBody } from './common/image-body'
import type { Env } from './config/env.schema'

/**
 * 요청 본문 상한. 동기화의 올리기 묶음이 가장 크다. 사냥 입력이 붙은 가계부 기록 100건이 130KB 안팎이고, 품목이 많은 기록을
 * 묶을 때는 앱이 이 상한 안으로 나눠 보낸다. 넘으면 요청 전체가 413 이다.
 */
const BODY_LIMIT_BYTES = 256 * 1024

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: BODY_LIMIT_BYTES, trustProxy: true }),
    { bufferLogs: true },
  )
  app.useLogger(app.get(Logger))
  registerImageBody(app)
  // SIGTERM 에 모듈의 onModuleDestroy 가 돈다. DB 풀이 거기서 닫힌다.
  app.enableShutdownHooks()

  const config = app.get(ConfigService<Env, true>)
  await app.listen({
    port: config.get('PORT', { infer: true }),
    host: config.get('HOST', { infer: true }),
  })
}

void bootstrap()
