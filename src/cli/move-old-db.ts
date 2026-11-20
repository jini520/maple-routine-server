/**
 * 옛 DB(1.0.14 까지의 운영 DB)의 줄을 새 DB(1.0.15)로 옮긴다.
 *
 * 새 DB 는 마이그레이션을 처음부터 적용한 DB 다. 옛 DB 는 읽기만 한다. 표 묶음 PR 마다 그 묶음의 표를 더한다.
 * 줄 id 는 그대로 옮긴다. 기기가 받아 둔 그림과 기기의 기록이 이 id 로 줄을 가리킨다.
 *
 * @example
 * OLD_DATABASE_URL=postgres://…/maple_routine DATABASE_URL=postgres://…/maple_routine_next node dist/cli/move-old-db.js
 */
import { randomUUID } from 'node:crypto'

import { eq, isNotNull, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

import * as oldSchema from '../database/old-schema'
import * as schema from '../database/schema'
import { parseAssetPath } from '../modules/assets/asset-paths'

export type OldDb = NodePgDatabase<typeof oldSchema>
export type NewDb = NodePgDatabase<typeof schema>

/** 옮긴 표마다 줄 수. 옛 DB 에 없던 줄(반지 레벨 · 같은 물건)은 새로 만든 수다. */
export interface MoveResult {
  assets: number
  bosses: number
  bossDifficulties: number
  itemGroups: number
  items: number
  ringLevelItems: number
  sameItemLinks: number
  tradeGroups: number
  worlds: number
  worldOpenPeriods: number
}

/** 옛 DB 와 새 DB 를 바꿔 넣었다. 그대로 돌리면 옛 DB 를 비운다. */
export class SwappedDatabases extends Error {}

/** 옛 그림 경로의 폴더 · 확장자를 분류로 읽지 못했다. message 가 그 경로다. */
export class UnknownAssetPath extends Error {}

/** 이름을 정하지 않은 거래권 글자다. message 가 그 글자다. */
export class UnknownTradeGroup extends Error {}

/** 한 번에 넣는 줄 수. Postgres 의 자리 표시자 상한(65535)을 넘지 않게 나눈다. */
const CHUNK = 1000

/** 거래권의 이름. 시즌마다 붙는 챌린저스 월드는 이름에 넣지 않는다. */
const TRADE_GROUP_NAMES: Record<string, string> = {
  general: '일반 월드',
  helios_eos: '에오스 · 핼리오스',
}

/** 보스가 직접도 떨구고 상자로도 주는 아이템. 상자에서 나온 것을 같은 물건의 다른 줄로 둔다. */
const BOXED_COPIES = [{ originalKey: 'life_whetstone', key: 'life_whetstone_from_box' }]

/** 새 DB 의 옮기는 표. 비울 때는 뒤에서부터 지운다. 앞의 표를 뒤의 표가 가리킨다. */
const MOVED_TABLES = [
  schema.assets,
  schema.bosses,
  schema.bossDifficulties,
  schema.tradeGroups,
  schema.worlds,
  schema.worldOpenPeriods,
  schema.itemGroups,
  schema.items,
  schema.ringLevelItems,
  schema.sameItemLinks,
]

/**
 * 한 트랜잭션으로 옮긴다. 새 DB 의 옮기는 표를 먼저 비운다. 옛 마이그레이션 가운데 빈 DB 에도 기준 줄을 넣는 것이 있고,
 * 다시 돌려도 같은 줄이 두 번 들어가지 않게 하려는 것이다. 도중에 실패하면 새 DB 에 아무것도 남지 않는다.
 */
export async function moveOldDb(oldDb: OldDb, newDb: NewDb): Promise<MoveResult> {
  if (
    !(await hasColumn(oldDb, 'assets', 'path')) ||
    !(await hasColumn(newDb, 'assets', 'category'))
  )
    throw new SwappedDatabases('옛 DB 에 assets.path, 새 DB 에 assets.category 가 있어야 한다')

  const [oldAssets, oldBosses, oldDifficulties, oldWorlds, oldPeriods, oldGroups, oldItems] =
    await Promise.all([
      oldDb.select().from(oldSchema.assets),
      oldDb.select().from(oldSchema.bosses),
      oldDb.select().from(oldSchema.bossDifficulties),
      oldDb.select().from(oldSchema.worlds),
      oldDb.select().from(oldSchema.worldPeriods),
      oldDb.select().from(oldSchema.itemGroups),
      oldDb.select().from(oldSchema.items),
    ])
  const levelBoxContents = await oldDb
    .select({
      itemId: oldSchema.dropBoxContents.itemId,
      levelMin: oldSchema.dropBoxes.levelMin,
      levelMax: oldSchema.dropBoxes.levelMax,
    })
    .from(oldSchema.dropBoxContents)
    .innerJoin(oldSchema.dropBoxes, eq(oldSchema.dropBoxes.id, oldSchema.dropBoxContents.boxId))
    .where(isNotNull(oldSchema.dropBoxes.levelMax))

  const assets = oldAssets.map((r) => {
    const key = parseAssetPath(r.path)
    if (key === null) throw new UnknownAssetPath(r.path)
    return {
      id: r.id,
      ...key,
      sha256: r.sha256,
      sizeBytes: r.size,
      width: r.width,
      height: r.height,
      name: r.name,
      updatedAt: r.updatedAt,
    }
  })
  // 옛 표는 시즌 보스를 주기의 값(event_weekly)으로 적었다. 시즌 보스의 주기는 주간이다.
  const cycleOf = new Map(oldBosses.map((b) => [b.id, b.cycle]))
  const bosses = oldBosses.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    shortName: r.alias,
    isSeasonBoss: r.cycle === 'event_weekly',
    portraitAssetId: r.portraitAssetId,
    sortOrder: r.sortOrder,
    validFrom: r.from,
    validUntil: r.until,
    updatedAt: r.updatedAt,
  }))
  const bossDifficulties = oldDifficulties.map((r) => ({
    id: r.id,
    bossId: r.bossId,
    difficulty: r.difficulty,
    cycle: cycleOf.get(r.bossId) === 'monthly' ? ('monthly' as const) : ('weekly' as const),
    requiredLevel: r.requiredLevel,
    maxPartySize: r.maxPartySize,
    validFrom: r.from,
    validUntil: r.until,
  }))

  const tradeGroups = [
    ...new Set(oldWorlds.flatMap((w) => (w.priceGroup === null ? [] : [w.priceGroup]))),
  ]
    .sort()
    .map((key) => {
      const name = TRADE_GROUP_NAMES[key]
      if (name === undefined) throw new UnknownTradeGroup(key)
      return { id: randomUUID(), key, name }
    })
  const tradeGroupId = new Map(tradeGroups.map((g) => [g.key, g.id]))
  const worlds = oldWorlds.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    emblemAssetId: r.emblemAssetId,
    isChallengers: r.challengers,
    isEvent: r.event,
    tradeGroupId: r.priceGroup === null ? null : (tradeGroupId.get(r.priceGroup) ?? null),
    sortOrder: r.sortOrder,
    updatedAt: r.updatedAt,
  }))
  const worldOpenPeriods = oldPeriods.map((r) => ({
    id: r.id,
    worldId: r.worldId,
    validFrom: r.from,
    validUntil: r.until,
    updatedAt: r.updatedAt,
  }))

  const itemGroups = oldGroups.map((r) => ({
    id: r.id,
    key: r.key,
    type: itemGroupType(r.kind),
    name: r.name,
    sortOrder: r.sortOrder,
  }))
  const groupByKey = new Map(itemGroups.map((g) => [g.key, g]))
  const items = oldItems.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    groupId: r.category === null ? null : (groupByKey.get(r.category)?.id ?? null),
    iconAssetId: r.iconAssetId,
    isValuable: r.valuable,
    requiredLevel: r.level,
    isDrop: r.isDrop,
    isEquipment: r.isEquipment,
    updatedAt: r.updatedAt,
  }))

  // 반지는 레벨 범위가 있는 상자에 든 장신구다. 같은 상자의 연마석은 레벨이 없다. 레벨은 그 반지가 든 상자들의 범위다.
  const typeOfItem = new Map(
    items.map((i) => [i.id, itemGroups.find((g) => g.id === i.groupId)?.type ?? null]),
  )
  const ringRanges = new Map<string, { min: number; max: number }>()
  for (const c of levelBoxContents) {
    if (typeOfItem.get(c.itemId) !== 'accessory' || c.levelMin === null || c.levelMax === null)
      continue
    const range = ringRanges.get(c.itemId)
    ringRanges.set(c.itemId, {
      min: Math.min(range?.min ?? c.levelMin, c.levelMin),
      max: Math.max(range?.max ?? c.levelMax, c.levelMax),
    })
  }
  const levelItems: (typeof items)[number][] = []
  const ringLevelItems: (typeof schema.ringLevelItems.$inferInsert)[] = []
  for (const ring of items) {
    const range = ringRanges.get(ring.id)
    if (range === undefined) continue
    for (let level = range.min; level <= range.max; level += 1) {
      const id = randomUUID()
      levelItems.push({
        ...ring,
        id,
        key: `${ring.key}_lv${level}`,
        name: `${ring.name} lv.${level}`,
        requiredLevel: null,
        isDrop: true,
        isEquipment: false,
      })
      ringLevelItems.push({ itemId: id, ringItemId: ring.id, ringLevel: level })
    }
  }
  const boxedItems: (typeof items)[number][] = []
  const sameItemLinks: (typeof schema.sameItemLinks.$inferInsert)[] = []
  for (const copy of BOXED_COPIES) {
    const original = items.find((i) => i.key === copy.originalKey)
    if (original === undefined) continue
    const id = randomUUID()
    boxedItems.push({ ...original, id, key: copy.key })
    sameItemLinks.push({ itemId: id, originalItemId: original.id })
  }

  await newDb.transaction(async (tx) => {
    for (const table of [...MOVED_TABLES].reverse()) await tx.delete(table)
    await insertAll(tx, schema.assets, assets)
    await insertAll(tx, schema.bosses, bosses)
    await insertAll(tx, schema.bossDifficulties, bossDifficulties)
    await insertAll(tx, schema.tradeGroups, tradeGroups)
    await insertAll(tx, schema.worlds, worlds)
    await insertAll(tx, schema.worldOpenPeriods, worldOpenPeriods)
    await insertAll(tx, schema.itemGroups, itemGroups)
    await insertAll(tx, schema.items, [...items, ...levelItems, ...boxedItems])
    await insertAll(tx, schema.ringLevelItems, ringLevelItems)
    await insertAll(tx, schema.sameItemLinks, sameItemLinks)
  })
  return {
    assets: assets.length,
    bosses: bosses.length,
    bossDifficulties: bossDifficulties.length,
    itemGroups: itemGroups.length,
    items: items.length + levelItems.length + boxedItems.length,
    ringLevelItems: ringLevelItems.length,
    sameItemLinks: sameItemLinks.length,
    tradeGroups: tradeGroups.length,
    worlds: worlds.length,
    worldOpenPeriods: worldOpenPeriods.length,
  }
}

/** 옛 묶음의 종류 글자. enum 밖의 글자면 옮기지 않고 멈춘다. */
function itemGroupType(kind: string): (typeof schema.itemGroupTypeEnum.enumValues)[number] {
  const types: readonly string[] = schema.itemGroupTypeEnum.enumValues
  if (!types.includes(kind)) throw new Error(`모르는 묶음 종류다: ${kind}`)
  return kind as (typeof schema.itemGroupTypeEnum.enumValues)[number]
}

async function hasColumn(db: OldDb | NewDb, table: string, column: string): Promise<boolean> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = ${table} and column_name = ${column}`,
  )
  return (result.rows[0]?.n ?? 0) > 0
}

type Tx = Parameters<Parameters<NewDb['transaction']>[0]>[0]

async function insertAll<T extends PgTable>(
  tx: Tx,
  table: T,
  rows: readonly T['$inferInsert'][],
): Promise<void> {
  for (const chunk of chunks(rows)) await tx.insert(table).values(chunk)
}

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK))
  return out
}

async function main(): Promise<void> {
  const oldUrl = process.env.OLD_DATABASE_URL
  const newUrl = process.env.DATABASE_URL
  if (oldUrl === undefined || oldUrl === '' || newUrl === undefined || newUrl === '')
    throw new Error('OLD_DATABASE_URL 과 DATABASE_URL 이 둘 다 있어야 한다')
  if (oldUrl === newUrl) throw new Error('옛 DB 와 새 DB 가 같다')
  const oldPool = new Pool({ connectionString: oldUrl })
  const newPool = new Pool({ connectionString: newUrl })
  try {
    const result = await moveOldDb(
      drizzle(oldPool, { schema: oldSchema }),
      drizzle(newPool, { schema }),
    )
    console.log(`옮겼다: ${JSON.stringify(result)}`)
  } finally {
    await Promise.all([oldPool.end(), newPool.end()])
  }
}

if (process.argv[1]?.endsWith('move-old-db.js') || process.argv[1]?.endsWith('move-old-db.ts')) {
  main().catch((error: unknown) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
