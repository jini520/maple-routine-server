/**
 * 리포지토리 스펙이 쓰는 진짜 Postgres. TEST_DATABASE_URL 이 없으면 그 스펙들은 건너뛴다.
 *
 * 마이그레이션은 advisory lock 안에서 한 번만 돈다. 표를 비우는 것은 스펙이 beforeEach 에서 한다.
 * 스펙 파일이 같은 DB 를 나눠 쓰므로 DB 스펙은 --runInBand 로 돌린다(npm run test:db).
 */
import { and, eq, sql } from 'drizzle-orm'
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
  'maspi_daily_closes',
  'maspi_basket_items',
  'market_published_days',
  'market_judgements',
  'market_reference_prices',
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
  'boss_drops',
  'boss_profit_entries',
  'boss_split_settings',
  'drop_sale_prices',
  'deleted_row_purges',
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

/**
 * 반지 판매가 줄이 가리킬 아이템. 그 반지 · 레벨의 레벨 줄이 있으면 그 줄, 없으면 반지 줄이다. 판매가 줄은 반지를 레벨 줄로
 * 가리키므로 레벨 줄을 둔 스펙만 레벨로 갈린다.
 */
export async function saleItemId(
  db: TestDb,
  itemId: string,
  ringLevel: number | null,
): Promise<string> {
  if (ringLevel === null) return itemId
  const [row] = await db
    .select({ id: schema.ringLevelItems.itemId })
    .from(schema.ringLevelItems)
    .where(
      and(
        eq(schema.ringLevelItems.ringItemId, itemId),
        eq(schema.ringLevelItems.ringLevel, ringLevel),
      ),
    )
  return row?.id ?? itemId
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

/** 기록 표가 가리키는 게임 데이터 줄. 동기화 스펙이 함께 쓴다. */
export interface RecordReferences {
  bossId: string
  /** 루시드의 주간 하드 · 주간 노말 · 월간 익스트림 */
  hard: string
  normal: string
  monthly: string
  worldId: string
  /** 루시드 하드의 드롭 표에 든 아이템. 드롭은 그 보스에서 얻을 수 있는 아이템만 받는다. */
  itemId: string
  otherItemId: string
  categoryId: string
  equipmentTypeId: string
  consumableTypeId: string
  contentId: string
}

/** 기록 표가 가리키는 보스 · 난이도 · 월드 · 아이템 · 가계부 분류 · 아이템 종류 · 컨텐츠를 하나씩 넣는다. */
export async function insertRecordReferences(db: TestDb): Promise<RecordReferences> {
  const iconAssetId = await insertAsset(db, 'items/etc.webp')
  const [boss] = await db
    .insert(schema.bosses)
    .values({
      key: 'lucid',
      name: '루시드',
      shortName: '루시드',
      isSeasonBoss: false,
      portraitAssetId: await insertAsset(db, 'bosses/lucid.webp'),
      sortOrder: 0,
    })
    .returning({ id: schema.bosses.id })
  if (boss === undefined) throw new Error('보스를 못 넣었다')
  const difficulties = await db
    .insert(schema.bossDifficulties)
    .values([
      { bossId: boss.id, difficulty: 'hard', cycle: 'weekly', requiredLevel: 220 },
      { bossId: boss.id, difficulty: 'normal', cycle: 'weekly', requiredLevel: 220 },
      { bossId: boss.id, difficulty: 'extreme', cycle: 'monthly', requiredLevel: 220 },
    ])
    .returning({ id: schema.bossDifficulties.id })
  const [world] = await db
    .insert(schema.worlds)
    .values({ key: 'scania', name: '스카니아', sortOrder: 0 })
    .returning({ id: schema.worlds.id })
  const madeItems = await db
    .insert(schema.items)
    .values([
      { key: 'drop-a', name: '드롭 가' },
      { key: 'drop-b', name: '드롭 나' },
    ])
    .returning({ id: schema.items.id })
  const [category] = await db
    .insert(schema.cashbookCategories)
    .values({
      entryType: 'spend',
      key: 'etc',
      name: '기타',
      cardTitle: '기타',
      iconAssetId,
      description: '기타',
      sortOrder: 0,
    })
    .returning({ id: schema.cashbookCategories.id })
  const types = await db
    .insert(schema.cashbookItemTypes)
    .values([
      { key: 'equipment', name: '장비', hasTariff: false, sortOrder: 0 },
      { key: 'consumable', name: '소비', unit: '개', hasTariff: true, sortOrder: 1 },
    ])
    .returning({ id: schema.cashbookItemTypes.id })
  const [contentCategory] = await db
    .insert(schema.contentCategories)
    .values({ key: 'weekly_quest', name: '주간 퀘스트', sortOrder: 0 })
    .returning({ id: schema.contentCategories.id })
  if (contentCategory === undefined) throw new Error('컨텐츠 분류를 못 넣었다')
  const [content] = await db
    .insert(schema.contents)
    .values({
      key: 'erda-spectrum',
      cycle: 'weekly',
      apiName: '에르다 스펙트럼',
      categoryId: contentCategory.id,
      name: '에르다 스펙트럼',
      shortName: '스펙트럼',
      type: 'quest',
      checkType: 'state_only',
      shareScope: 'world',
      sortOrder: 0,
    })
    .returning({ id: schema.contents.id })
  const [hard, normal, monthly] = difficulties
  const [itemA, itemB] = madeItems
  const [equipment, consumable] = types
  if (
    hard === undefined ||
    normal === undefined ||
    monthly === undefined ||
    world === undefined ||
    itemA === undefined ||
    itemB === undefined ||
    category === undefined ||
    equipment === undefined ||
    consumable === undefined ||
    content === undefined
  ) {
    throw new Error('게임 데이터 줄을 못 넣었다')
  }
  await db
    .insert(schema.bossDifficultyRewards)
    .values({ bossDifficultyId: hard.id, category: 'equipment', itemId: itemA.id, sortOrder: 0 })
  return {
    bossId: boss.id,
    hard: hard.id,
    normal: normal.id,
    monthly: monthly.id,
    worldId: world.id,
    itemId: itemA.id,
    otherItemId: itemB.id,
    categoryId: category.id,
    equipmentTypeId: equipment.id,
    consumableTypeId: consumable.id,
    contentId: content.id,
  }
}

/** 처치 난이도로 드롭을 모으는 스펙이 쓰는 드롭 표. 아이템은 key 로, 난이도는 보스마다 난이도 이름으로 찾는다. */
export interface ClearedDropTables {
  item: Record<string, string>
  kalos: { easy: string; normal: string; chaos: string }
  bellona: { normal: string; hard: string }
}

/**
 * 앱 저장소 `src/__fixtures__/game-data` 의 감시자 칼로스 · 벨로나 줄 가운데 처치 난이도 묶음을 맞추는 데 드는 것만 옮긴 드롭 표.
 * 앱의 같은 예를 서버도 같은 결과로 맞추는지 보려고 key 와 난이도를 앱과 같게 둔다.
 */
export async function insertClearedDropTables(db: TestDb): Promise<ClearedDropTables> {
  const keys = [
    'restraint_ring',
    'restraint_ring_lv3',
    'restraint_ring_lv4',
    'continuous_ring',
    'continuous_ring_lv3',
    'continuous_ring_lv4',
    'ultimatum_ring',
    'ultimatum_ring_lv4',
    'white_boss_ring_box',
    'life_boss_ring_box',
    'life_whetstone',
    'life_whetstone_from_box',
    'magical_weapon_scroll_voucher',
    'lingering_kalos_will_fragment',
  ]
  const made = await db
    .insert(schema.items)
    .values(keys.map((key) => ({ key, name: key })))
    .returning({ id: schema.items.id, key: schema.items.key })
  const item = Object.fromEntries(made.map((row) => [row.key, row.id])) as Record<string, string>
  await db.insert(schema.ringLevelItems).values([
    { itemId: item.restraint_ring_lv3, ringItemId: item.restraint_ring, ringLevel: 3 },
    { itemId: item.restraint_ring_lv4, ringItemId: item.restraint_ring, ringLevel: 4 },
    { itemId: item.continuous_ring_lv3, ringItemId: item.continuous_ring, ringLevel: 3 },
    { itemId: item.continuous_ring_lv4, ringItemId: item.continuous_ring, ringLevel: 4 },
    { itemId: item.ultimatum_ring_lv4, ringItemId: item.ultimatum_ring, ringLevel: 4 },
  ])
  await db
    .insert(schema.sameItemLinks)
    .values({ itemId: item.life_whetstone_from_box, originalItemId: item.life_whetstone })
  const [white, life] = await db
    .insert(schema.dropBoxes)
    .values([
      { itemId: item.white_boss_ring_box, ringLevelMin: 3, ringLevelMax: 4 },
      { itemId: item.life_boss_ring_box, ringLevelMin: 3, ringLevelMax: 4 },
    ])
    .returning({ id: schema.dropBoxes.id })
  if (white === undefined || life === undefined) throw new Error('상자를 못 넣었다')
  const contents = (boxId: string, contentKeys: string[]) =>
    contentKeys.map((key, sortOrder) => ({ boxId, itemId: item[key], sortOrder }))
  await db
    .insert(schema.dropBoxContents)
    .values([
      ...contents(white.id, ['restraint_ring', 'continuous_ring', 'ultimatum_ring']),
      ...contents(life.id, ['restraint_ring', 'continuous_ring', 'life_whetstone_from_box']),
    ])
  const boss = async (key: string, difficulties: ('easy' | 'normal' | 'hard' | 'chaos')[]) => {
    const [row] = await db
      .insert(schema.bosses)
      .values({
        key,
        name: key,
        shortName: key,
        isSeasonBoss: false,
        portraitAssetId: await insertAsset(db, `bosses/${key}.webp`),
        sortOrder: 0,
      })
      .returning({ id: schema.bosses.id })
    if (row === undefined) throw new Error('보스를 못 넣었다')
    const rows = await db
      .insert(schema.bossDifficulties)
      .values(
        difficulties.map((difficulty) => ({
          bossId: row.id,
          difficulty,
          cycle: 'weekly' as const,
          requiredLevel: 260,
        })),
      )
      .returning({ id: schema.bossDifficulties.id, difficulty: schema.bossDifficulties.difficulty })
    return Object.fromEntries(rows.map((r) => [r.difficulty, r.id])) as Record<string, string>
  }
  const kalos = await boss('guardian_kalos', ['easy', 'normal', 'chaos'])
  const bellona = await boss('bellona', ['normal', 'hard'])
  const voucherUntil = '2026-09-17T10:00'
  const reward = (
    bossDifficultyId: string,
    key: string,
    over: Partial<typeof schema.bossDifficultyRewards.$inferInsert> = {},
  ) => ({
    bossDifficultyId,
    category: 'consumable' as const,
    itemId: item[key],
    sortOrder: 0,
    ...over,
  })
  await db
    .insert(schema.bossDifficultyRewards)
    .values([
      reward(kalos.easy, 'white_boss_ring_box'),
      reward(kalos.normal, 'lingering_kalos_will_fragment', { category: 'fixed', quantity: 1 }),
      reward(kalos.normal, 'white_boss_ring_box'),
      reward(kalos.normal, 'life_whetstone'),
      reward(kalos.normal, 'magical_weapon_scroll_voucher', { validUntil: voucherUntil }),
      reward(kalos.chaos, 'life_boss_ring_box'),
      reward(kalos.chaos, 'life_whetstone'),
      reward(kalos.chaos, 'magical_weapon_scroll_voucher', { validUntil: voucherUntil }),
      reward(bellona.normal, 'white_boss_ring_box'),
      reward(bellona.normal, 'life_whetstone'),
      reward(bellona.hard, 'life_boss_ring_box'),
    ])
  return {
    item,
    kalos: { easy: kalos.easy, normal: kalos.normal, chaos: kalos.chaos },
    bellona: { normal: bellona.normal, hard: bellona.hard },
  }
}
