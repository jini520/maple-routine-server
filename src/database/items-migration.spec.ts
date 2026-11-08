/**
 * 0030 이관을 진짜 Postgres 에서 본다. 0029 까지 올린 새 DB 에 드롭 아이템 · 강화 장비 · 사냥 전리품 줄을 넣고 0030 을
 * 적용한다. 운영 DB 는 줄이 차 있어서, 빈 표에서만 도는 test-db 의 마이그레이션으로는 옮기는 SQL 이 한 번도 안 돈다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0029_asset_id_refs'
const AFTER = '0030_items_table'

describeDb('0030 아이템 표 이관', () => {
  const name = `mig_items_${process.pid}_${Date.now()}`
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

  const rows = async (q: string, params: unknown[] = []): Promise<unknown[]> =>
    (await pool.query<object>(q, params)).rows

  async function asset(path: string): Promise<string> {
    const {
      rows: [row],
    } = await pool.query<{ id: string }>(
      `INSERT INTO assets (path, sha256, size, width, height) VALUES ($1, $2, 1, 1, 1) RETURNING id`,
      [path, '0'.repeat(64)],
    )
    return row?.id ?? ''
  }

  it('드롭 아이템 id 를 지켜 상자 FK 가 이어지고, 같은 key 의 장비는 그 줄에 얹고, 사냥 전리품은 아이템을 가리킨다', async () => {
    const icon = await asset('items/sol_erda_fragment.webp')
    const {
      rows: [terror],
    } = await pool.query<{ id: string }>(
      `INSERT INTO drop_items (key, name, valuable) VALUES ('giant_terror', '거대한 공포', true) RETURNING id`,
    )
    const {
      rows: [box],
    } = await pool.query<{ id: string }>(
      `INSERT INTO drop_items (key, name) VALUES ('ring_box', '보스 반지 상자') RETURNING id`,
    )
    await pool.query(`INSERT INTO drop_boxes (item_id) VALUES ($1)`, [box?.id])
    await pool.query(
      `INSERT INTO equipment_items (key, name, level) VALUES ('giant_terror', '거대한공포', 200), ('absolab_bow', '앱솔랩스슈팅보우', 160)`,
    )
    await pool.query(
      `INSERT INTO hunt_loot_items (key, kind, name, icon_asset_id, sort_order) VALUES ('sol_erda_fragment', 'fragment', '솔 에르다 조각', $1, 0)`,
      [icon],
    )

    await migrate(db, { migrationsFolder: folders[AFTER] })

    expect(
      await rows(
        `SELECT key, name, level, is_drop, is_equipment, valuable, icon_asset_id FROM items ORDER BY key`,
      ),
    ).toEqual([
      {
        key: 'absolab_bow',
        name: '앱솔랩스슈팅보우',
        level: 160,
        is_drop: false,
        is_equipment: true,
        valuable: false,
        icon_asset_id: null,
      },
      {
        key: 'giant_terror',
        name: '거대한 공포',
        level: 200,
        is_drop: true,
        is_equipment: true,
        valuable: true,
        icon_asset_id: null,
      },
      {
        key: 'ring_box',
        name: '보스 반지 상자',
        level: null,
        is_drop: true,
        is_equipment: false,
        valuable: false,
        icon_asset_id: null,
      },
      {
        key: 'sol_erda_fragment',
        name: '솔 에르다 조각',
        level: null,
        is_drop: false,
        is_equipment: false,
        valuable: false,
        icon_asset_id: icon,
      },
    ])
    expect(await rows(`SELECT id FROM items WHERE key = 'giant_terror'`)).toEqual([
      { id: terror?.id },
    ])
    expect(await rows(`SELECT i.key FROM drop_boxes b JOIN items i ON i.id = b.item_id`)).toEqual([
      { key: 'ring_box' },
    ])
    expect(
      await rows(`SELECT i.key, h.kind FROM hunt_loot_items h JOIN items i ON i.id = h.item_id`),
    ).toEqual([{ key: 'sol_erda_fragment', kind: 'fragment' }])
    expect(
      await rows(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('drop_items', 'equipment_items')`,
      ),
    ).toEqual([])
  })

  it('NFC · 공백 제거 뒤 이름이 같은데 key 가 다른 줄이 있으면 멈추고 아무것도 안 바뀐다', async () => {
    await pool.query(`INSERT INTO drop_items (key, name) VALUES ('giant_terror', '거대한 공포')`)
    await pool.query(
      `INSERT INTO equipment_items (key, name, level) VALUES ('great_terror', '거대한공포', 200)`,
    )

    const failure: unknown = await migrate(db, { migrationsFolder: folders[AFTER] }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(String((failure as { cause?: unknown } | null)?.cause)).toContain(
      'giant_terror, great_terror',
    )
    expect(
      await rows(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('drop_items', 'equipment_items', 'items') ORDER BY 1`,
      ),
    ).toEqual([{ table_name: 'drop_items' }, { table_name: 'equipment_items' }])
  })
})
