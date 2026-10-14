import { Global, Module, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import type { Env } from '../config/env.schema'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

/** 리포지토리가 `@Inject(DB)` 로 받는 토큰. */
export const DB = Symbol('DB')

/** pg 풀 하나에 Drizzle 을 얹어 전역으로 준다. 종료 때 풀을 닫는다. */
@Global()
@Module({
  providers: [
    {
      provide: Pool,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          // DB 박스가 사설망 건너에 있어 연결 실패가 새 고장 모양이다. 매달리지 않고 깨끗이 실패한다.
          connectionTimeoutMillis: 5_000,
        }),
    },
    {
      provide: DB,
      inject: [Pool],
      useFactory: (pool: Pool): Db => drizzle(pool, { schema }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}
