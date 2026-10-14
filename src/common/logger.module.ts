import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'

import type { Env } from '../config/env.schema'

/** pino 를 Nest 의 Logger 자리에 끼운다. 요청마다 JSON 한 줄이고 수준은 LOG_LEVEL 이다. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          serializers: {
            req: (req: {
              method: string
              url: string
              headers: Record<string, string | undefined>
            }) => ({
              method: req.method,
              url: req.url,
              ua: req.headers['user-agent'],
            }),
          },
        },
      }),
    }),
  ],
})
export class AppLoggerModule {}
