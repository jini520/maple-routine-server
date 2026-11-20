/**
 * 드롭 시세의 앱 응답 다시 만들기. `node dist/cli/market-responses.js`
 *
 * 1.0.15 로 옛 DB 를 옮긴 뒤 한 번 돌린다. 옛 응답은 반지 레벨이 든 열쇠와 몸이라 옮기지 않아서, 다음 하루 작업 전까지 앱이 시세를
 * 못 받는다. 마지막으로 낸 날의 응답을 지금 계산으로 다시 만든다. 기준가 · 범위 · 판정 · MASPI 는 그대로다.
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
    const day = await service.rebuildLatestResponses()
    console.log(
      day === null ? '낸 날이 없어 만들 응답이 없다' : `${day} 의 시세 응답을 다시 만들었다`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
