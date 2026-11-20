/**
 * 리포지토리 스펙이 쓰는 진짜 Postgres. TEST_DATABASE_URL 이 없으면 그 스펙들은 건너뛴다.
 *
 * 마이그레이션은 advisory lock 안에서 한 번만 돈다. 표를 비우는 것은 스펙이 beforeEach 에서 한다.
 * 스펙 파일이 같은 DB 를 나눠 쓰므로 DB 스펙은 --runInBand 로 돌린다(npm run test:db).
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { parseAssetPath } from '../modules/assets/asset-paths'
import * as schema from './schema'

export type TestDb = NodePgDatabase<typeof schema>

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** `describe` 대신 쓴다. DB 가 없으면 건너뛴다. */
export const describeDb = TEST_DATABASE_URL ? describe : describe.skip

const TABLES = [
  'market_responses',
  'maspi_days',
  'maspi_basket',
  'market_runs',
  'market_judgements',
  'market_days',
  'hunting_ground_levels',
  'hunting_grounds',
  'hunting_regions',
  'potential_reset_costs',
  'soul_potential_reset_costs',
  'starforce_cost_steps',
  'superior_items',
  'superior_series',
  'mvp_grades',
  'contents',
  'content_categories',
  'symbol_level_costs',
  'symbols',
  'symbol_groups',
  'spend_item_reward_types',
  'spend_reward_types',
  'spend_item_options',
  'spend_items',
  'spend_tiles',
  'spend_groups',
  'cashbook_categories',
  'hunt_loot_items',
  'hexa_core_level_costs',
  'hexa_cores',
  'hexa_core_types',
  'jobs',
  'hexa_stats',
  'faq_items',
  'faq_sheets',
  'cashbook_item_types',
  'boss_crystal_prices',
  'drop_box_contents',
  'drop_boxes',
  'boss_difficulty_rewards',
  'same_item_links',
  'ring_level_items',
  'items',
  'game_data_section_updates',
  'app_images',
  'assets',
  'image_crops',
  'world_open_periods',
  'worlds',
  'trade_groups',
  'cashbook_entry_items',
  'cashbook_entries',
  'boss_clears',
  'drop_prices',
  'usage_events',
  'nexon_login_attempts',
  'nexon_sessions',
  'nexon_accounts',
  'users',
  'notices',
  'boss_manual_completion_periods',
  'boss_difficulties',
  'bosses',
  'game_rules',
] as const

/** 아이템 줄을 바로 넣는다. 역할 · 성질은 안 주면 꺼진 채다. 칸의 시각은 안 민다. */
export async function insertItems(
  db: TestDb,
  rows: readonly (typeof schema.items.$inferInsert)[],
): Promise<void> {
  await db.insert(schema.items).values([...rows])
}

/**
 * 그림 줄을 넣고 경로마다 id 를 돌려준다. 그림 칸이 FK 라 그 칸을 채우는 스펙은 그림부터 넣어야 한다. 해시 · 크기는 가짜다.
 * 경로는 옛 폴더 경로(`bosses/bellona.webp`)이고 분류 · 파일 이름 · 확장자로 나눠 넣는다. 같은 그림이 이미 있으면 그 줄의 id 다.
 */
export async function insertAssets(
  db: TestDb,
  paths: readonly string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const path of paths) {
    const key = parseAssetPath(path)
    if (key === null) throw new Error(`그림 경로 규칙에 맞지 않는다: ${path}`)
    const [row] = await db
      .insert(schema.assets)
      .values({ ...key, sha256: '0'.repeat(64), sizeBytes: 1, width: 1, height: 1 })
      .onConflictDoUpdate({
        target: [schema.assets.category, schema.assets.fileName, schema.assets.extension],
        set: { fileName: key.fileName },
      })
      .returning({ id: schema.assets.id })
    if (row === undefined) throw new Error(`그림 줄을 못 넣었다: ${path}`)
    out[path] = row.id
  }
  return out
}

/** 묶음 key 의 줄 id. 0041 이 넣은 묶음은 truncate 가 비우지 않아 스펙이 key 로 가리킨다. */
export async function itemGroupId(db: TestDb, key: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.itemGroups.id })
    .from(schema.itemGroups)
    .where(eq(schema.itemGroups.key, key))
  if (row === undefined) throw new Error(`묶음이 없다: ${key}`)
  return row.id
}

/** 그림 한 장을 넣고 그 id. 같은 그림이 이미 있으면 그 줄의 id 다. */
export async function insertAsset(db: TestDb, path: string): Promise<string> {
  const id = (await insertAssets(db, [path]))[path]
  if (id === undefined) throw new Error(`그림 줄을 못 넣었다: ${path}`)
  return id
}

/** 사람 · 넥슨 계정 줄을 만들고 메이플 ID 를 단다. 기록 표가 메이플 ID 를 가리키므로 기록보다 먼저 둔다. */
export async function insertNexonAccount(
  db: TestDb,
  mapleIds: readonly string[],
): Promise<{ userId: string; nexonAccountId: string }> {
  const [user] = await db.insert(schema.users).values({}).returning({ id: schema.users.id })
  if (user === undefined) throw new Error('사람을 못 넣었다')
  const [account] = await db
    .insert(schema.nexonAccounts)
    .values({ userId: user.id })
    .returning({ id: schema.nexonAccounts.id })
  if (account === undefined) throw new Error('넥슨 계정 줄을 못 넣었다')
  if (mapleIds.length > 0) {
    await db
      .insert(schema.mapleIds)
      .values(mapleIds.map((hash) => ({ nexonAccountId: account.id, hash })))
  }
  return { userId: user.id, nexonAccountId: account.id }
}

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
