/**
 * 드롭 시세의 처음 채우기. `node dist/cli/market-backfill.js`
 *
 * 그때까지의 드롭 가격 줄로 첫날부터 어제(KST)까지의 일일 기준가를 차례로 내고, 기준 기간으로 MASPI 바스켓을 정한 뒤
 * MASPI 와 앱에 줄 응답을 만든다. 한 번만 돌린다. 이미 낸 날이 있으면 아무것도 하지 않고 끝낸다. 그 뒤는 하루 작업이
 * 날마다 이어서 낸다. 배포 뒤 컨테이너 안에서 `docker compose run --rm server node dist/cli/market-backfill.js` 로 돌린다.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '../database/schema'
import { MarketDailyRepository } from '../modules/drop-market/market-daily.repository'
import { kstYesterday } from '../modules/drop-market/market-publish.job'
import { MarketPublishService } from '../modules/drop-market/market-publish.service'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') throw new Error('DATABASE_URL 이 없다')
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5_000 })
  try {
    const service = new MarketPublishService(new MarketDailyRepository(drizzle(pool, { schema })))
    const yesterday = kstYesterday(new Date())
    await service.backfill(yesterday)
    console.log(`드롭 시세를 ${yesterday} 까지 채웠다`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
