import { sql } from 'drizzle-orm'

import { describeDb, openTestDb, TEST_DATABASE_URL, type TestDb } from '../database/test-db'
import { migrateDatabase } from './migrate'

describeDb('migrateDatabase', () => {
  let db: TestDb
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestDb())
  })
  afterAll(() => close())

  it('두 번 돌려도 같은 표가 서 있고 던지지 않는다', async () => {
    await migrateDatabase(TEST_DATABASE_URL as string)
    await migrateDatabase(TEST_DATABASE_URL as string)

    const rows = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const names = (rows.rows as { table_name: string }[]).map((r) => r.table_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'bosses',
        'drop_prices',
        'notices',
        'users',
        'manual_completion_bosses',
      ]),
    )
  })
})
