/**
 * 0033 이관을 진짜 Postgres 에서 본다. 0032 까지 올린 새 DB 에 그림을 넣고 0033 을 적용한다.
 * 운영 DB 에만 있는 그림을 지우는 SQL 이라, 빈 표에서만 도는 test-db 의 마이그레이션으로는 한 번도 안 돈다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0032_item_names_kms'
const AFTER = '0033_asset_names'
const TOWER = 'items/rings/Tower_Boost_Ring.png'

describeDb('0033 그림 이름 칸과 안 쓰는 그림 하나', () => {
  const name = `mig_asset_names_${process.pid}_${Date.now()}`
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

  async function insertAsset(path: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO assets (path, sha256, size, width, height) VALUES ($1, repeat('0', 64), 1, 1, 1) RETURNING id`,
      [path],
    )
    return rows[0]?.id ?? ''
  }
  const paths = async (): Promise<string[]> =>
    (await pool.query<{ path: string }>(`SELECT path FROM assets ORDER BY path`)).rows.map(
      (r) => r.path,
    )

  it('아무도 쓰지 않으면 그 그림과 크롭을 지우고, 다른 그림과 이름 칸은 남긴다', async () => {
    const tower = await insertAsset(TOWER)
    await insertAsset('bosses/bellona.webp')
    await pool.query(
      `INSERT INTO image_crops (kind, asset_id, size, position) VALUES ('boss_portrait', $1, '120% auto', '50% 50%')`,
      [tower],
    )
    await migrate(db, { migrationsFolder: folders[AFTER] })
    expect(await paths()).toEqual(['bosses/bellona.webp'])
    expect((await pool.query(`SELECT 1 FROM image_crops`)).rows).toHaveLength(0)
    expect((await pool.query(`SELECT name FROM assets`)).rows).toEqual([{ name: null }])
  })

  it('아이템이 쓰고 있으면 지우지 않는다', async () => {
    const tower = await insertAsset(TOWER)
    await pool.query(`INSERT INTO items (key, name, icon_asset_id) VALUES ('tower', '타워', $1)`, [
      tower,
    ])
    await migrate(db, { migrationsFolder: folders[AFTER] })
    expect(await paths()).toEqual([TOWER])
  })
})
