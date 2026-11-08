/**
 * 0031 이관을 진짜 Postgres 에서 본다. 0030 까지 올린 새 DB 에 그림 · MVP 등급 · 컨텐츠 줄을 넣고 0031 을 적용한다.
 * 운영 DB 는 그림 표가 차 있어서, 빈 표에서만 도는 test-db 의 마이그레이션으로는 채우는 SQL 이 한 번도 안 돈다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0030_items_table'
const AFTER = '0031_app_images'

const FRAME_COUNTS = { screen: 16, pre: 8, loop: 24, end: 7 } as const

/** 이관 전 앱 코드가 이름으로 찾던 그림. 0031 이 app_images 에 붙이는 72장이다. */
const APP_IMAGE_PATHS = [
  'items/intense_power_crystal_weekly.webp',
  'items/intense_power_crystal_monthly.webp',
  'items/cube_gold.png',
  'items/equipment_enhancement_scroll.png',
  'items/potential_reset.png',
  'items/additional_potential_reset.png',
  'items/soul_weapon_potential.webp',
  'items/meso_pouch.webp',
  'items/union_wealth.webp',
  'items/selazar_coin.webp',
  'items/sole_1000.webp',
  'items/sole_500.webp',
  'items/sole_200.png',
  'items/sole_10.png',
  'force/arcane-force.png',
  'force/authentic-force.png',
  'characters/unknown.webp',
  ...Object.entries(FRAME_COUNTS).flatMap(([stage, count]) =>
    Array.from({ length: count }, (_, n) => `drop-effect/${stage}/${n}.webp`),
  ),
]

describeDb('0031 앱 그림 이관', () => {
  const name = `mig_app_images_${process.pid}_${Date.now()}`
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

  async function insertAssets(paths: readonly string[]): Promise<Map<string, string>> {
    const { rows: inserted } = await pool.query<{ id: string; path: string }>(
      `INSERT INTO assets (path, sha256, size, width, height)
       SELECT p, repeat('0', 64), 1, 1, 1 FROM unnest($1::text[]) AS p RETURNING id, path`,
      [paths],
    )
    return new Map(inserted.map((r) => [r.path, r.id]))
  }

  async function insertContent(key: string, mapAssetId: string | null = null): Promise<void> {
    await pool.query(
      `INSERT INTO contents (key, section, api_name, category_id, display_name, short_name, type, max_count, sort_order, background_map_asset_id)
       SELECT $1, 'weekly', $1, id, $1, $1, 'contents', 1, 0, $2 FROM content_categories LIMIT 1`,
      [key, mapAssetId],
    )
  }

  async function seedRows(): Promise<Map<string, string>> {
    const ids = await insertAssets([
      ...APP_IMAGE_PATHS,
      'mvp/bronze.webp',
      'mvp/gold.webp',
      'bosses/armorDragon.webp',
      'bosses/arcanus.webp',
      'maps/hallOfHeroes.webp',
      'maps/flagRace.jpg',
      'maps/icons/flagRace.png',
      'maps/arcana.webp',
      'maps/icons/arcana.png',
      'maps/icons/arcana.webp',
    ])
    await pool.query(
      `INSERT INTO mvp_grades (key, name, auction_fee_percent, starforce_discount_percent, sort_order)
       VALUES ('normal', '일반', 5, 0, 0), ('bronze', '브론즈', 5, 0, 1), ('gold', '골드', 3, 5, 2)`,
    )
    await pool.query(
      `INSERT INTO content_categories (key, name, sort_order) VALUES ('guild', '길드', 0)`,
    )
    for (const key of [
      'maple_union_weekly_dragon',
      'maple_union_pc_cafe_weekly_dragon',
      'guild_underground_waterway',
      'guild_weekly_mission_points',
      'guild_flag_race',
    ])
      await insertContent(key)
    await insertContent('arcana_daily', ids.get('maps/arcana.webp'))
    return ids
  }

  it('지금 앱이 이름으로 찾던 그림으로 명패 · 컨텐츠 배경 · 지역 아이콘 · 새 표를 채우고 캐시 종류를 더한다', async () => {
    const ids = await seedRows()

    await migrate(db, { migrationsFolder: folders[AFTER] })

    expect(
      await rows(
        `SELECT g.key, a.path FROM mvp_grades g LEFT JOIN assets a ON a.id = g.plate_asset_id ORDER BY g.sort_order`,
      ),
    ).toEqual([
      { key: 'normal', path: null },
      { key: 'bronze', path: 'mvp/bronze.webp' },
      { key: 'gold', path: 'mvp/gold.webp' },
    ])
    expect(
      await rows(
        `SELECT c.key, m.path AS map, p.path AS portrait, i.path AS icon FROM contents c
         LEFT JOIN assets m ON m.id = c.background_map_asset_id
         LEFT JOIN assets p ON p.id = c.background_portrait_asset_id
         LEFT JOIN assets i ON i.id = c.region_icon_asset_id ORDER BY c.key`,
      ),
    ).toEqual([
      // 아이콘 후보가 둘이면 앱이 찾던 차례(webp · png · jpg)에서 앞선 것이다
      {
        key: 'arcana_daily',
        map: 'maps/arcana.webp',
        portrait: null,
        icon: 'maps/icons/arcana.webp',
      },
      {
        key: 'guild_flag_race',
        map: 'maps/flagRace.jpg',
        portrait: null,
        icon: 'maps/icons/flagRace.png',
      },
      { key: 'guild_underground_waterway', map: null, portrait: 'bosses/arcanus.webp', icon: null },
      {
        key: 'guild_weekly_mission_points',
        map: 'maps/hallOfHeroes.webp',
        portrait: null,
        icon: null,
      },
      {
        key: 'maple_union_pc_cafe_weekly_dragon',
        map: null,
        portrait: 'bosses/armorDragon.webp',
        icon: null,
      },
      {
        key: 'maple_union_weekly_dragon',
        map: null,
        portrait: 'bosses/armorDragon.webp',
        icon: null,
      },
    ])
    const images = (await rows(
      `SELECT x.key, a.path FROM app_images x JOIN assets a ON a.id = x.asset_id`,
    )) as { key: string; path: string }[]
    expect(images).toHaveLength(72)
    expect(new Set(images.map((r) => r.path))).toEqual(new Set(APP_IMAGE_PATHS))
    expect(images).toContainEqual({ key: 'drop_effect_loop_23', path: 'drop-effect/loop/23.webp' })
    expect(images).toContainEqual({
      key: 'boss_crystal_weekly',
      path: 'items/intense_power_crystal_weekly.webp',
    })
    expect(ids.size).toBeGreaterThan(72)
    expect(
      await rows(
        `SELECT key, name, unit, has_tariff, sort_order FROM cashbook_item_kinds ORDER BY sort_order`,
      ),
    ).toEqual([
      { key: 'equipment', name: '장비', unit: null, has_tariff: true, sort_order: 0 },
      { key: 'consumable', name: '소비', unit: '개', has_tariff: false, sort_order: 1 },
      { key: 'etc', name: '기타', unit: '개', has_tariff: false, sort_order: 2 },
      { key: 'cash', name: '캐시', unit: '개', has_tariff: true, sort_order: 3 },
    ])
  })

  it('그림 표에 줄이 있는데 찾는 그림이 없으면 멈추고 아무것도 안 바뀐다', async () => {
    await seedRows()
    await pool.query(`DELETE FROM assets WHERE path = 'drop-effect/end/6.webp'`)

    const failure: unknown = await migrate(db, { migrationsFolder: folders[AFTER] }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(String((failure as { cause?: unknown } | null)?.cause)).toContain('app_images 1줄')
    expect(
      await rows(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_images'`,
      ),
    ).toEqual([])
  })

  it('그림 표가 빈 새 DB 는 채울 것을 건너뛰고 캐시 종류만 더한다', async () => {
    await migrate(db, { migrationsFolder: folders[AFTER] })
    expect(await rows(`SELECT count(*)::int AS n FROM app_images`)).toEqual([{ n: 0 }])
    expect(await rows(`SELECT key FROM cashbook_item_kinds WHERE key = 'cash'`)).toEqual([
      { key: 'cash' },
    ])
  })
})
