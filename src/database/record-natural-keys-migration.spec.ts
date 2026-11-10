/**
 * 0036 이관을 진짜 Postgres 에서 본다. 0035 까지 올린 새 DB 에 옛 모양의 줄을 넣고 0036 을 적용한다.
 * 기기 계정 id 칸을 걷고 기록 표의 칸을 바꾸는 SQL 이라, 빈 표에서만 도는 test-db 의 마이그레이션으로는 줄이 있는 경우를 못 본다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0035_nexon_account_identity'
const AFTER = '0036_record_natural_keys'

describeDb('0036 기록 표를 넥슨이 준 값으로', () => {
  const name = `mig_record_keys_${process.pid}_${Date.now()}`
  let admin: Pool
  let pool: Pool
  let db: NodePgDatabase
  let folders: Record<typeof BEFORE | typeof AFTER, string>
  let cleanup: () => void

  beforeAll(async () => {
    admin = new Pool({ connectionString: TEST_DATABASE_URL })
    ;({ folders, cleanup } = migrationFoldersUpTo([BEFORE, AFTER]))
  })
  beforeEach(async () => {
    await admin.query(`CREATE DATABASE ${name}`)
    const url = new URL(TEST_DATABASE_URL ?? '')
    url.pathname = `/${name}`
    pool = new Pool({ connectionString: url.toString() })
    db = drizzle(pool)
    await migrate(db, { migrationsFolder: folders[BEFORE] })
  })
  afterEach(async () => {
    await pool.end()
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
  })
  afterAll(async () => {
    cleanup()
    await admin.end()
  })

  // 1.0.13 앱이 보낸 드롭 줄은 ocid 가 없어 1.0.13 을 잠글 때까지 그대로 둔다. 시세 표본이다.
  it('넥슨 계정 줄의 기기 계정 id 를 걷고, 옛 드롭 줄은 넥슨이 준 값이 빈 채로 남긴다', async () => {
    const { rows: users } = await pool.query<{ id: string }>(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    )
    const user = users[0]?.id
    await pool.query(
      `INSERT INTO nexon_accounts (user_id, account_record_id) VALUES ($1, gen_random_uuid())`,
      [user],
    )
    const { rows: items } = await pool.query<{ id: string }>(
      `INSERT INTO items (key, name, is_drop) VALUES ('ring', '반지', true) RETURNING id`,
    )
    await pool.query(
      `INSERT INTO drop_prices (user_id, drop_record_id, identified_by, item_id, record_status, period_key)
       VALUES ($1, gen_random_uuid(), 'key', $2, 'pending', '2026-11-05')`,
      [user, items[0]?.id],
    )

    await migrate(db, { migrationsFolder: folders[AFTER] })

    const columns = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'nexon_accounts' AND column_name = 'account_record_id'`,
    )
    expect(columns.rows).toHaveLength(0)
    const { rows } = await pool.query(
      `SELECT user_id, maple_id, ocid, boss_id, item_ordinal FROM drop_prices`,
    )
    expect(rows).toEqual([
      { user_id: user, maple_id: null, ocid: null, boss_id: null, item_ordinal: null },
    ])
  })
})
