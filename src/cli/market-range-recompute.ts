/**
 * 드롭 시세의 범위 다시 계산. `node dist/cli/market-range-recompute.js`
 *
 * 범위를 내는 방법을 바꾼 뒤 한 번 돌린다. 낸 날마다 범위만 지금 방식으로 다시 내고, 마지막 날의 앱 응답을 다시 만든다.
 * 기준가 · 울타리 · 판정 · MASPI 는 그대로다. 배포 뒤 컨테이너 안에서
 * `docker compose run --rm server node dist/cli/market-range-recompute.js` 로 돌린다.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '../database/schema'
import { MarketDailyRepository } from '../modules/drop-market/market-daily.repository'
import { MarketPublishService } from '../modules/drop-market/market-publish.service'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') throw new Error('DATABASE_URL 이 없다')
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5_000 })
  try {
    const service = new MarketPublishService(new MarketDailyRepository(drizzle(pool, { schema })))
    const days = await service.recomputeRanges()
    console.log(`드롭 시세 범위를 ${days}일 다시 냈다`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
