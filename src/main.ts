import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'

import { AppModule } from './app.module'
import type { Env } from './config/env.schema'

/** 요청 본문 상한. 드롭 가격 묶음과 프렌즈 작업 목록이 가장 크고 그래도 수십 KB 다. */
const BODY_LIMIT_BYTES = 256 * 1024

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: BODY_LIMIT_BYTES, trustProxy: true }),
    { bufferLogs: true },
  )
  app.useLogger(app.get(Logger))
  // SIGTERM 에 모듈의 onModuleDestroy 가 돈다. DB 풀이 거기서 닫힌다.
  app.enableShutdownHooks()

  const config = app.get(ConfigService<Env, true>)
  await app.listen({ port: config.get('PORT', { infer: true }), host: '0.0.0.0' })
}

void bootstrap()
