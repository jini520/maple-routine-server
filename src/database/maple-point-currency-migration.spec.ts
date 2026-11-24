/**
 * 0067 이관을 진짜 Postgres 에서 본다. 0066 까지 올린 DB 에 메이플포인트 지출 항목을 넣고 0067 을 적용한다.
 * 빈 표에서만 도는 test-db 의 마이그레이션으로는 `point` 를 든 줄이 있는 DB 를 못 본다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { MIGRATION_HOOK_TIMEOUT_MS, migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0066_settled_days_deleted_at'
const AFTER = '0067_maple_point_currency'

describeDb('0067 지출 재화 point 를 maple_point 로', () => {
  const name = `mig_maple_point_${process.pid}_${Date.now()}`
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
    // DB 를 지울 때 남은 연결이 끊기며 내는 오류다. 처리기가 없으면 다음 테스트의 실패로 올라온다.
    pool.on('error', () => undefined)
    db = drizzle(pool)
    await migrate(db, { migrationsFolder: folders[BEFORE] })
  }, MIGRATION_HOOK_TIMEOUT_MS)
  afterEach(async () => {
    await pool.end()
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
  }, MIGRATION_HOOK_TIMEOUT_MS)
  afterAll(async () => {
    cleanup()
    await admin.end()
  })

  // enum 을 지우고 다시 만들면 `point` 를 든 줄이 새 형으로 바뀌지 못해 이관이 멈춘다. 이미 줄이 있는 DB 에도 돌아야 한다.
  it('메이플포인트 항목은 maple_point 가 되고 메소 항목은 그대로다', async () => {
    const one = async (query: string, values: unknown[] = []) =>
      (await pool.query<{ id: string }>(query, values)).rows[0]?.id
    const asset = await one(
      `INSERT INTO assets (category, file_name, extension, sha256, size_bytes, width, height)
       VALUES ('item', 'etc', 'png', $1, 1, 1, 1) RETURNING id`,
      ['0'.repeat(64)],
    )
    const category = await one(
      `INSERT INTO cashbook_categories (entry_type, key, name, card_title, icon_asset_id, description, sort_order)
       VALUES ('spend', 'contents', '컨텐츠', '컨텐츠', $1, '컨텐츠', 0) RETURNING id`,
      [asset],
    )
    const group = await one(
      `INSERT INTO spend_groups (key, name, cashbook_category_id, card_title, sort_order)
       VALUES ('epic', '에픽던전', $1, '에픽던전', 0) RETURNING id`,
      [category],
    )
    const tile = await one(
      `INSERT INTO spend_tiles (key, name) VALUES ('high_mountain', '하이마운틴') RETURNING id`,
    )
    await pool.query(
      `INSERT INTO spend_items (key, group_id, tile_id, name, currency, unit, sort_order)
       VALUES ('by_point', $1, $2, '포인트', 'point', '회', 0), ('by_meso', $1, $2, '메소', 'meso', '회', 1)`,
      [group, tile],
    )

    await migrate(db, { migrationsFolder: folders[AFTER] })

    const { rows } = await pool.query<{ key: string; currency: string }>(
      `SELECT key, currency FROM spend_items ORDER BY key`,
    )
    expect(rows).toEqual([
      { key: 'by_meso', currency: 'meso' },
      { key: 'by_point', currency: 'maple_point' },
    ])
  })
})
