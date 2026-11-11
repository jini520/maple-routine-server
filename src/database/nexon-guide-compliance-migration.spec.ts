/**
 * 0037 이관을 진짜 Postgres 에서 본다. 0036 까지 올린 새 DB 에 원문 식별자와 넥슨 공지를 넣고 0037 을 적용한다.
 * 줄을 고치는 SQL 이라, 빈 표에서만 도는 test-db 의 마이그레이션으로는 한 번도 안 돈다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { sha256Hex } from '../common/hash'
import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0036_record_natural_keys'
const AFTER = '0037_nexon_guide_compliance'

describeDb('0037 넥슨 식별자를 해시로, 넥슨 공지에 받은 시각을', () => {
  const name = `mig_nexon_guide_${process.pid}_${Date.now()}`
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

  const one = async <T>(text: string): Promise<T> => (await pool.query(text)).rows[0] as T

  it('넥슨 uid · 메이플 ID · ocid 원문을 앱과 같은 SHA-256 16진으로 바꾸고, 기록의 메이플 ID 도 따라 바뀐다', async () => {
    const { id: userId } = await one<{ id: string }>(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    )
    const { id: login } = await one<{ id: string }>(
      `INSERT INTO nexon_accounts (user_id, nexon_uid, referral_code) VALUES ('${userId}', 'uid-raw', 'ABCDEFGH') RETURNING id`,
    )
    await pool.query(
      `INSERT INTO nexon_account_maple_ids (nexon_account_id, maple_id) VALUES ('${login}', 'maple-raw')`,
    )
    const { id: itemId } = await one<{ id: string }>(
      `INSERT INTO items (key, name) VALUES ('item', '아이템') RETURNING id`,
    )
    await pool.query(
      `INSERT INTO drop_prices (user_id, identified_by, drop_record_id, item_id, record_status, period_key, maple_id, ocid, item_ordinal)
       VALUES ('${userId}', 'login', gen_random_uuid(), '${itemId}', 'pending', '2026-10-22', 'maple-raw', 'ocid-raw', 1)`,
    )
    await pool.query(
      `INSERT INTO drop_prices (user_id, identified_by, drop_record_id, item_id, record_status, period_key)
       VALUES ('${userId}', 'login', gen_random_uuid(), '${itemId}', 'pending', '2026-10-22')`,
    )

    await migrate(db, { migrationsFolder: folders[AFTER] })

    expect(await one(`SELECT nexon_uid FROM nexon_accounts`)).toEqual({
      nexon_uid: sha256Hex('uid-raw'),
    })
    expect(await one(`SELECT maple_id FROM nexon_account_maple_ids`)).toEqual({
      maple_id: sha256Hex('maple-raw'),
    })
    expect(
      (await pool.query(`SELECT maple_id, ocid FROM drop_prices ORDER BY maple_id NULLS LAST`))
        .rows,
    ).toEqual([
      { maple_id: sha256Hex('maple-raw'), ocid: sha256Hex('ocid-raw') },
      { maple_id: null, ocid: null },
    ])
  })

  it('이미 있는 넥슨 공지는 올린 시각을 받은 시각으로 두고, 운영자 공지는 비워 둔다', async () => {
    await pool.query(
      `INSERT INTO notices (notice_key, kind, title, published_at, blocks) VALUES
       ('event-1', 'event', '썬데이', '2026-09-01T00:00:00Z', '[]'::jsonb),
       ('game-1', 'game', '점검', '2026-09-02T00:00:00Z', NULL),
       ('notice-1', 'app', '운영자', '2026-09-03T00:00:00Z', NULL)`,
    )

    await migrate(db, { migrationsFolder: folders[AFTER] })

    const rows = (
      await pool.query(
        `SELECT notice_key, fetched_at = published_at AS fetched, detail_fetched_at = published_at AS detail FROM notices ORDER BY notice_key`,
      )
    ).rows
    expect(rows).toEqual([
      { notice_key: 'event-1', fetched: true, detail: true },
      { notice_key: 'game-1', fetched: true, detail: null },
      { notice_key: 'notice-1', fetched: null, detail: null },
    ])
  })
})
