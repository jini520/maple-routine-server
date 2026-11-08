/**
 * 0029 이관을 진짜 Postgres 에서 본다. 0028 까지 올린 새 DB 에 글자로 된 그림 칸을 넣고 0029 를 적용한다. 운영 DB 는 줄이
 * 차 있어서, 빈 표에서만 도는 test-db 의 마이그레이션으로는 채우는 SQL 이 한 번도 안 돈다.
 */
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0028_referral_code'
const AFTER = '0029_asset_id_refs'

describeDb('0029 그림 id 이관', () => {
  const name = `mig_${process.pid}_${Date.now()}`
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
    // 0014 가 넣은 가계부 분류 줄은 이 스펙이 넣는 그림을 안 가리켜 0029 를 멈추게 한다. 스펙마다 볼 표만 남긴다.
    await pool.query('DELETE FROM cashbook_categories')
  })
  afterEach(async () => {
    await pool.end()
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
  })
  afterAll(async () => {
    cleanup()
    await admin.end()
  })

  async function asset(path: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO assets (path, sha256, size, width, height) VALUES ($1, $2, 1, 1, 1) RETURNING id`,
      [path, '0'.repeat(64)],
    )
    return rows[0]?.id ?? ''
  }

  it('글자 칸을 그 그림의 id 로 바꾸고 옛 칸을 지운다. 후보가 여럿이면 앱이 찾는 차례에서 앞선 그림이다', async () => {
    const webp = await asset('bosses/lotus.webp')
    await asset('bosses/lotus.png')
    const ring = await asset('items/ring.png')
    await asset('items/rings/ring.png')
    const emblem = await asset('worlds/scania.png')
    const region = await asset('maps/arcana.webp')
    await pool.query(
      `INSERT INTO bosses (key, name, alias, cycle, portrait_slug, sort_order) VALUES ('lotus', '스우', '스우', 'weekly', 'lotus', 0)`,
    )
    await pool.query(
      `INSERT INTO drop_items (key, name, icon_file) VALUES ('ring', '반지', 'ring.png'), ('none', '없음', NULL)`,
    )
    await pool.query(
      `INSERT INTO worlds (key, name, emblem, sort_order) VALUES ('scania', '스카니아', 'scania', 0)`,
    )
    await pool.query(
      `INSERT INTO image_crops (kind, slug, size, position) VALUES ('boss_portrait', 'lotus', '100% auto', '50% 50%'), ('daily_quest_region', 'arcana', '100% auto', '50% 50%')`,
    )

    await migrate(db, { migrationsFolder: folders[AFTER] })

    const one = async (q: string): Promise<unknown[]> => (await pool.query<object>(q)).rows
    expect(await one(`SELECT portrait_asset_id AS id FROM bosses`)).toEqual([{ id: webp }])
    expect(await one(`SELECT key, icon_asset_id AS id FROM drop_items ORDER BY key`)).toEqual([
      { key: 'none', id: null },
      { key: 'ring', id: ring },
    ])
    expect(await one(`SELECT emblem_asset_id AS id FROM worlds`)).toEqual([{ id: emblem }])
    expect(await one(`SELECT kind, asset_id AS id FROM image_crops ORDER BY kind`)).toEqual([
      { kind: 'boss_portrait', id: webp },
      { kind: 'daily_quest_region', id: region },
    ])
    const columns = await one(
      `SELECT table_name, column_name FROM information_schema.columns WHERE column_name IN ('portrait_slug', 'icon_file', 'emblem', 'icon_map', 'background_map', 'background_portrait', 'slug') AND table_schema = 'public'`,
    )
    expect(columns).toEqual([])
  })

  it('그림 표에 없는 값이 하나라도 있으면 멈추고 아무것도 안 바뀐다', async () => {
    await asset('bosses/lotus.webp')
    await pool.query(
      `INSERT INTO bosses (key, name, alias, cycle, portrait_slug, sort_order) VALUES ('lotus', '스우', '스우', 'weekly', 'lotus', 0), ('ghost', '없는 보스', '없는 보스', 'weekly', 'ghost', 1)`,
    )

    const failure: unknown = await migrate(db, { migrationsFolder: folders[AFTER] }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(String((failure as { cause?: unknown } | null)?.cause)).toContain(
      'bosses.portrait_slug=ghost',
    )
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'bosses' AND column_name IN ('portrait_slug', 'portrait_asset_id')`,
    )
    expect(rows).toEqual([{ column_name: 'portrait_slug' }])
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM bosses`)).rows).toEqual([{ n: 2 }])
  })
})
