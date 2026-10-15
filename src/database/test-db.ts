/**
 * 리포지토리 스펙이 쓰는 진짜 Postgres. TEST_DATABASE_URL 이 없으면 그 스펙들은 건너뛴다.
 *
 * 마이그레이션은 advisory lock 안에서 한 번만 돈다. 표를 비우는 것은 스펙이 beforeEach 에서 한다.
 * 스펙 파일이 같은 DB 를 나눠 쓰므로 DB 스펙은 --runInBand 로 돌린다(npm run test:db).
 */
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import * as schema from './schema'

export type TestDb = NodePgDatabase<typeof schema>

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** `describe` 대신 쓴다. DB 가 없으면 건너뛴다. */
export const describeDb = TEST_DATABASE_URL ? describe : describe.skip

const TABLES = [
  'drop_prices',
  'nexon_login_attempts',
  'nexon_sessions',
  'users',
  'notices',
  'manual_completion_bosses',
  'boss_difficulties',
  'bosses',
  'game_rules',
] as const

export async function openTestDb(): Promise<{
  db: TestDb
  truncate: () => Promise<void>
  close: () => Promise<void>
}> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  const db = drizzle(pool, { schema })
  await db.execute(sql`SELECT pg_advisory_lock(1)`)
  try {
    await migrate(db, { migrationsFolder: `${__dirname}/migrations` })
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(1)`)
  }
  return {
    db,
    truncate: async () => {
      await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} CASCADE`))
    },
    close: () => pool.end(),
  }
}
