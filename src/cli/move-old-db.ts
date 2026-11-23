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

import { and, eq, getTableName, isNotNull, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

import * as oldSchema from '../database/old-schema'
import * as schema from '../database/schema'
import { parseAssetPath } from '../modules/assets/asset-paths'
import { SECTION_KEYS } from '../modules/game-data/sections'

export type OldDb = NodePgDatabase<typeof oldSchema>
export type NewDb = NodePgDatabase<typeof schema>

/** 옮긴 표마다 줄 수. 옛 DB 에 없던 줄(반지 레벨 · 같은 물건 · 직업)은 새로 만든 수다. */
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
  jobs: number
  hexaCoreTypes: number
  hexaCores: number
  hexaCoreLevelCosts: number
  hexaStats: number
  bossDifficultyRewards: number
  dropBoxes: number
  dropBoxContents: number
  bossCrystalPrices: number
  bossManualCompletionPeriods: number
  contentCategories: number
  contents: number
  cashbookCategories: number
  cashbookItemTypes: number
  huntLootItems: number
  spendRewardTypes: number
  spendGroups: number
  spendTiles: number
  spendItems: number
  spendItemOptions: number
  spendItemRewardTypes: number
  symbolGroups: number
  symbols: number
  symbolLevelCosts: number
  huntingRegions: number
  huntingGrounds: number
  huntingGroundLevels: number
  potentialResetCosts: number
  soulPotentialResetCosts: number
  starforceCostSteps: number
  superiorSeries: number
  superiorItems: number
  mvpGrades: number
  gameRules: number
  gameDataSectionUpdates: number
  imageCrops: number
  notices: number
  faqSheets: number
  faqItems: number
  users: number
  nexonAccounts: number
  mapleIds: number
  subAccountRegistrations: number
  referrals: number
  nexonSessions: number
  marketReferencePrices: number
  marketJudgements: number
  marketPublishedDays: number
  maspiBasketItems: number
  maspiDailyCloses: number
  usageEvents: number
  enhancementAnomalies: number
  appImages: number
  dropSalePrices: number
}

/** 크롭의 크기 · 위치 글자가 `<폭>% auto` · `<가로>% <세로>%` 꼴이 아니다. message 가 그 줄의 값이다. */
export class UnknownCropValue extends Error {}

/** 옛 DB 에 게임 규칙 줄 하나가 없다. message 가 그 key 다. */
export class MissingGameRule extends Error {}

/** 옛 DB 와 새 DB 를 바꿔 넣었다. 그대로 돌리면 옛 DB 를 비운다. */
export class SwappedDatabases extends Error {}

/** 운영에 줄이 없어 옮기지 않는 옛 기록 표에 줄이 있다. 그대로 옮기면 그 줄을 잃는다. message 가 표와 줄 수다. */
export class UnmovedRecords extends Error {}

/** 2026-11-17 운영에 줄이 없어 옮기지 않는 옛 기록 표. 1.0.14 까지의 앱이 올리지 않는 표다. */
const EMPTY_OLD_RECORD_TABLES = [
  oldSchema.enhancementTotals,
  oldSchema.bossClears,
  oldSchema.serverCashbookEntries,
]

/** 옛 그림 경로의 폴더 · 확장자를 분류로 읽지 못했다. message 가 그 경로다. */
export class UnknownAssetPath extends Error {}

/** 이름을 정하지 않은 거래권 글자다. message 가 그 글자다. */
export class UnknownTradeGroup extends Error {}

/** 모든 직업에 있는 코어인데 직업마다 그림이나 넥슨 타입이 달라 한 줄로 합칠 수 없다. message 가 코어 이름이다. */
export class SharedCoreMismatch extends Error {}

/** 이름 표에도 없고 그 넥슨 타입의 기본 종류도 없어 코어의 종류를 정하지 못했다. message 가 `직업 · 코어 이름` 이다. */
export class UnknownHexaCoreType extends Error {}

/** 고정 보상의 개수 글자가 숫자나 숫자 뒤 `개` 가 아니다. message 가 그 글자다. */
export class UnknownQuantity extends Error {}

/** 시세 줄의 반지 레벨에 맞는 레벨 아이템 줄이 없다. message 가 `아이템 id · 레벨` 이다. */
export class UnknownRingLevel extends Error {}

/** 시세 줄의 범위 글자가 거래권 key 도 월드 key 도 아니다. message 가 그 글자다. */
export class UnknownMarketScope extends Error {}

/** 한 번에 넣는 줄 수. Postgres 의 자리 표시자 상한(65535)을 넘지 않게 나눈다. */
const CHUNK = 1000

/** 거래권의 이름. 시즌마다 붙는 챌린저스 월드는 이름에 넣지 않는다. */
const TRADE_GROUP_NAMES: Record<string, string> = {
  general: '일반 월드',
  helios_eos: '에오스 · 핼리오스',
}

/** 모든 직업이 함께 쓰는 코어가 가리키는 직업 줄의 이름. */
const ALL_JOBS = '전직업'

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
  schema.jobs,
  schema.hexaCoreTypes,
  schema.hexaCores,
  schema.hexaCoreLevelCosts,
  schema.hexaStats,
  schema.bossDifficultyRewards,
  schema.dropBoxes,
  schema.dropBoxContents,
  schema.bossCrystalPrices,
  schema.bossManualCompletionPeriods,
  schema.contentCategories,
  schema.contents,
  schema.cashbookCategories,
  schema.cashbookItemTypes,
  schema.huntLootItems,
  schema.spendRewardTypes,
  schema.spendGroups,
  schema.spendTiles,
  schema.spendItems,
  schema.spendItemOptions,
  schema.spendItemRewardTypes,
  schema.symbolGroups,
  schema.symbols,
  schema.symbolLevelCosts,
  schema.huntingRegions,
  schema.huntingGrounds,
  schema.huntingGroundLevels,
  schema.potentialResetCosts,
  schema.soulPotentialResetCosts,
  schema.starforceCostSteps,
  schema.superiorSeries,
  schema.superiorItems,
  schema.mvpGrades,
  schema.gameRules,
  schema.gameDataSectionUpdates,
  schema.imageCrops,
  schema.notices,
  schema.faqSheets,
  schema.faqItems,
  schema.users,
  schema.nexonAccounts,
  schema.mapleIds,
  schema.subAccountRegistrations,
  schema.referrals,
  schema.nexonSessions,
  schema.nexonLoginAttempts,
  schema.marketReferencePrices,
  schema.marketJudgements,
  schema.marketPublishedDays,
  schema.maspiBasketItems,
  schema.maspiDailyCloses,
  schema.marketResponses,
  schema.usageEvents,
  schema.enhancementAnomalies,
  schema.appImages,
  schema.dropSalePrices,
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
  for (const table of EMPTY_OLD_RECORD_TABLES) {
    const [row] = await oldDb.select({ count: sql<number>`count(*)::int` }).from(table)
    if ((row?.count ?? 0) > 0)
      throw new UnmovedRecords(`${getTableName(table)} ${row?.count ?? 0}줄`)
  }

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
  const boxedCopyOf = new Map<string, string>()
  for (const copy of BOXED_COPIES) {
    const original = items.find((i) => i.key === copy.originalKey)
    if (original === undefined) continue
    const id = randomUUID()
    boxedItems.push({ ...original, id, key: copy.key })
    sameItemLinks.push({ itemId: id, originalItemId: original.id })
    boxedCopyOf.set(original.id, id)
  }

  const hexa = await hexaRows(oldDb)
  const boss = await bossReferenceRows(oldDb, boxedCopyOf)
  const content = await contentRows(oldDb)
  const cashbook = await cashbookReferenceRows(oldDb)
  const symbol = await symbolRows(oldDb)
  const hunting = await huntingGroundRows(oldDb)
  const enhancement = await enhancementCostRows(oldDb)
  const rules = await gameRuleRow(oldDb)
  const sectionUpdates = await sectionUpdateRows(oldDb)
  const ops = await operationRows(oldDb)
  const accounts = await accountRows(oldDb)
  const market = await marketRows(oldDb, { ringLevelItems, tradeGroups, worlds, accounts })
  const logs = await logRows(oldDb)
  const salePrices = await dropSalePriceRows(oldDb, ringLevelItems)
  // 앱 그림은 칸이 그대로라 줄 id 와 함께 옮긴다. 그림 표의 줄 id 가 그대로라 가리키는 그림도 같다.
  const appImages = await oldDb.select().from(oldSchema.appImages)

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
    await insertAll(tx, schema.jobs, hexa.jobs)
    await insertAll(tx, schema.hexaCoreTypes, hexa.hexaCoreTypes)
    await insertAll(tx, schema.hexaCores, hexa.hexaCores)
    await insertAll(tx, schema.hexaCoreLevelCosts, hexa.hexaCoreLevelCosts)
    await insertAll(tx, schema.hexaStats, hexa.hexaStats)
    await insertAll(tx, schema.bossDifficultyRewards, boss.bossDifficultyRewards)
    await insertAll(tx, schema.dropBoxes, boss.dropBoxes)
    await insertAll(tx, schema.dropBoxContents, boss.dropBoxContents)
    await insertAll(tx, schema.bossCrystalPrices, boss.bossCrystalPrices)
    await insertAll(tx, schema.bossManualCompletionPeriods, boss.bossManualCompletionPeriods)
    await insertAll(tx, schema.contentCategories, content.contentCategories)
    await insertAll(tx, schema.contents, content.contents)
    await insertAll(tx, schema.cashbookCategories, cashbook.cashbookCategories)
    await insertAll(tx, schema.cashbookItemTypes, cashbook.cashbookItemTypes)
    await insertAll(tx, schema.huntLootItems, cashbook.huntLootItems)
    await insertAll(tx, schema.spendRewardTypes, cashbook.spendRewardTypes)
    await insertAll(tx, schema.spendGroups, cashbook.spendGroups)
    await insertAll(tx, schema.spendTiles, cashbook.spendTiles)
    await insertAll(tx, schema.spendItems, cashbook.spendItems)
    await insertAll(tx, schema.spendItemOptions, cashbook.spendItemOptions)
    await insertAll(tx, schema.spendItemRewardTypes, cashbook.spendItemRewardTypes)
    await insertAll(tx, schema.symbolGroups, symbol.symbolGroups)
    await insertAll(tx, schema.symbols, symbol.symbols)
    await insertAll(tx, schema.symbolLevelCosts, symbol.symbolLevelCosts)
    await insertAll(tx, schema.huntingRegions, hunting.huntingRegions)
    await insertAll(tx, schema.huntingGrounds, hunting.huntingGrounds)
    await insertAll(tx, schema.huntingGroundLevels, hunting.huntingGroundLevels)
    await insertAll(tx, schema.potentialResetCosts, enhancement.potentialResetCosts)
    await insertAll(tx, schema.soulPotentialResetCosts, enhancement.soulPotentialResetCosts)
    await insertAll(tx, schema.starforceCostSteps, enhancement.starforceCostSteps)
    await insertAll(tx, schema.superiorSeries, enhancement.superiorSeries)
    await insertAll(tx, schema.superiorItems, enhancement.superiorItems)
    await insertAll(tx, schema.mvpGrades, enhancement.mvpGrades)
    await insertAll(tx, schema.gameRules, [rules])
    await insertAll(tx, schema.gameDataSectionUpdates, sectionUpdates)
    await insertAll(tx, schema.imageCrops, ops.imageCrops)
    await insertAll(tx, schema.notices, ops.notices)
    await insertAll(tx, schema.faqSheets, ops.faqSheets)
    await insertAll(tx, schema.faqItems, ops.faqItems)
    await insertAll(tx, schema.users, accounts.users)
    await insertAll(tx, schema.nexonAccounts, accounts.nexonAccounts)
    await insertAll(tx, schema.mapleIds, accounts.mapleIds)
    await insertAll(tx, schema.subAccountRegistrations, accounts.subAccountRegistrations)
    await insertAll(tx, schema.referrals, accounts.referrals)
    await insertAll(tx, schema.nexonSessions, accounts.nexonSessions)
    await insertAll(tx, schema.marketReferencePrices, market.marketReferencePrices)
    await insertAll(tx, schema.marketJudgements, market.marketJudgements)
    await insertAll(tx, schema.marketPublishedDays, market.marketPublishedDays)
    await insertAll(tx, schema.maspiBasketItems, market.maspiBasketItems)
    await insertAll(tx, schema.maspiDailyCloses, market.maspiDailyCloses)
    await insertAll(tx, schema.usageEvents, logs.usageEvents)
    await insertAll(tx, schema.enhancementAnomalies, logs.enhancementAnomalies)
    await insertAll(tx, schema.appImages, appImages)
    await insertAll(tx, schema.dropSalePrices, salePrices)
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
    jobs: hexa.jobs.length,
    hexaCoreTypes: hexa.hexaCoreTypes.length,
    hexaCores: hexa.hexaCores.length,
    hexaCoreLevelCosts: hexa.hexaCoreLevelCosts.length,
    hexaStats: hexa.hexaStats.length,
    bossDifficultyRewards: boss.bossDifficultyRewards.length,
    dropBoxes: boss.dropBoxes.length,
    dropBoxContents: boss.dropBoxContents.length,
    bossCrystalPrices: boss.bossCrystalPrices.length,
    bossManualCompletionPeriods: boss.bossManualCompletionPeriods.length,
    contentCategories: content.contentCategories.length,
    contents: content.contents.length,
    cashbookCategories: cashbook.cashbookCategories.length,
    cashbookItemTypes: cashbook.cashbookItemTypes.length,
    huntLootItems: cashbook.huntLootItems.length,
    spendRewardTypes: cashbook.spendRewardTypes.length,
    spendGroups: cashbook.spendGroups.length,
    spendTiles: cashbook.spendTiles.length,
    spendItems: cashbook.spendItems.length,
    spendItemOptions: cashbook.spendItemOptions.length,
    spendItemRewardTypes: cashbook.spendItemRewardTypes.length,
    symbolGroups: symbol.symbolGroups.length,
    symbols: symbol.symbols.length,
    symbolLevelCosts: symbol.symbolLevelCosts.length,
    huntingRegions: hunting.huntingRegions.length,
    huntingGrounds: hunting.huntingGrounds.length,
    huntingGroundLevels: hunting.huntingGroundLevels.length,
    potentialResetCosts: enhancement.potentialResetCosts.length,
    soulPotentialResetCosts: enhancement.soulPotentialResetCosts.length,
    starforceCostSteps: enhancement.starforceCostSteps.length,
    superiorSeries: enhancement.superiorSeries.length,
    superiorItems: enhancement.superiorItems.length,
    mvpGrades: enhancement.mvpGrades.length,
    gameRules: 1,
    gameDataSectionUpdates: sectionUpdates.length,
    imageCrops: ops.imageCrops.length,
    notices: ops.notices.length,
    faqSheets: ops.faqSheets.length,
    faqItems: ops.faqItems.length,
    users: accounts.users.length,
    nexonAccounts: accounts.nexonAccounts.length,
    mapleIds: accounts.mapleIds.length,
    subAccountRegistrations: accounts.subAccountRegistrations.length,
    referrals: accounts.referrals.length,
    nexonSessions: accounts.nexonSessions.length,
    marketReferencePrices: market.marketReferencePrices.length,
    marketJudgements: market.marketJudgements.length,
    marketPublishedDays: market.marketPublishedDays.length,
    maspiBasketItems: market.maspiBasketItems.length,
    maspiDailyCloses: market.maspiDailyCloses.length,
    usageEvents: logs.usageEvents.length,
    enhancementAnomalies: logs.enhancementAnomalies.length,
    appImages: appImages.length,
    dropSalePrices: salePrices.length,
  }
}

/**
 * 로그 표의 새 줄. 줄 id 그대로다. 신원 종류는 사람의 값이라 걷는다. 강화 이상 보고의 사람은 넥슨 계정 줄이 가리키고, 장비
 * key 는 읽는 곳이 없어 걷는다. 옛 한 줄의 기준에는 상세가 없어, 새 기준에서 겹치는 줄은 생기지 않는다.
 */
/**
 * 옛 드롭 가격 줄을 판매가 줄로 옮긴다. 가격을 적은 줄만 옮기고 줄 id 는 기기의 드롭 id 다. 같은 드롭 id 의 줄이 둘이면 나중에
 * 올라온 줄을 남긴다. 같은 드롭이 사람 줄 둘에 한 번씩 올라온 것이다. 반지 줄은 그 레벨의 아이템 줄로 바꾸고 맞는 줄이 없으면
 * 멈춘다. 보스 · 난이도 · 기간 · 상자는 판매가 표에 없어 버린다.
 */
async function dropSalePriceRows(
  oldDb: OldDb,
  ringLevelItems: readonly { itemId: string; ringItemId: string; ringLevel: number }[],
) {
  const rows = await oldDb
    .select()
    .from(oldSchema.dropPrices)
    .where(
      and(
        eq(oldSchema.dropPrices.recordStatus, 'completed'),
        isNotNull(oldSchema.dropPrices.priceMeso),
      ),
    )
  const levelItem = new Map(ringLevelItems.map((r) => [`${r.ringItemId}|${r.ringLevel}`, r.itemId]))
  const latest = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const kept = latest.get(row.dropRecordId)
    if (kept === undefined || kept.createdAt < row.createdAt) latest.set(row.dropRecordId, row)
  }
  return [...latest.values()].map((row) => {
    let itemId = row.itemId
    if (row.ringLevel !== null) {
      const level = levelItem.get(`${row.itemId}|${row.ringLevel}`)
      if (level === undefined) throw new UnknownRingLevel(`${row.itemId} · ${row.ringLevel}`)
      itemId = level
    }
    return {
      id: row.dropRecordId,
      userId: row.userId,
      itemId,
      worldId: row.worldId,
      salePriceMeso: row.priceMeso ?? 0,
      // completed 줄은 옛 표의 CHECK 가 거래 시각을 채운다.
      pricedAt: row.pricedAt ?? row.updatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })
}

async function logRows(oldDb: OldDb) {
  const [events, anomalies] = await Promise.all([
    oldDb.select().from(oldSchema.usageEvents),
    oldDb.select().from(oldSchema.enhancementAnomalies),
  ])
  return {
    usageEvents: events.map((e) => ({
      id: e.id,
      userId: e.userId,
      type: e.type,
      name: e.name,
      durationMs: e.durationMs,
      platform: e.platform,
      appVersion: e.appVersion,
      occurredAt: e.occurredAt,
      receivedAt: e.receivedAt,
    })),
    enhancementAnomalies: anomalies.map((a) => ({
      id: a.id,
      nexonAccountId: a.nexonAccountId,
      historyDate: a.historyDate,
      apiType: a.enhancementType,
      reason: a.anomalyType,
      itemName: a.itemName,
      rowCount: a.rowCount,
      detail: a.detail,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  }
}

/**
 * 시세 표의 새 줄. 범위 글자는 거래권이나 월드의 줄로, 반지 레벨은 레벨 아이템 줄로, 판정의 사람 글자는 사람 줄로 바꾼다.
 *
 * 판정은 사람 줄 글자(`u:`)와 넥슨 계정 글자(`a:`) · 메이플 ID 글자(`m:`)를 그 사람 줄로 옮기고, 지워진 사람이나 익명 줄의
 * 판정은 버린다. 같은 날 같은 사람이 둘이 되면 수를 더한다. 앱 응답 저장 줄은 옮기지 않는다. 반지 레벨이 든 옛 열쇠와 옛 몸이라
 * 1.0.15 앱이 쓸 수 없고, 옮긴 뒤 `market-responses` 명령이 마지막 날의 응답을 다시 만든다.
 */
async function marketRows(
  oldDb: OldDb,
  moved: {
    ringLevelItems: readonly { itemId: string; ringItemId: string; ringLevel: number }[]
    tradeGroups: readonly { id: string; key: string }[]
    worlds: readonly { id: string; key: string }[]
    accounts: {
      users: readonly { id: string }[]
      nexonAccounts: readonly { id: string; userId: string }[]
      mapleIds: readonly { hash: string; nexonAccountId: string }[]
    }
  },
) {
  const [days, judgements, runs, basket, maspi] = await Promise.all([
    oldDb.select().from(oldSchema.marketDays),
    oldDb.select().from(oldSchema.marketJudgements),
    oldDb.select().from(oldSchema.marketRuns),
    oldDb.select().from(oldSchema.maspiBasket),
    oldDb.select().from(oldSchema.maspiDays),
  ])
  const levelItem = new Map(
    moved.ringLevelItems.map((r) => [`${r.ringItemId}|${r.ringLevel}`, r.itemId]),
  )
  const itemOf = (itemId: string, ringLevel: number | null): string => {
    if (ringLevel === null) return itemId
    const id = levelItem.get(`${itemId}|${ringLevel}`)
    if (id === undefined) throw new UnknownRingLevel(`${itemId} · ${ringLevel}`)
    return id
  }
  const scopeOf = new Map<string, { scopeType: 'trade_group' | 'world'; scopeId: string }>([
    ...moved.tradeGroups.map(
      (g) => [g.key, { scopeType: 'trade_group' as const, scopeId: g.id }] as const,
    ),
    ...moved.worlds.map((w) => [w.key, { scopeType: 'world' as const, scopeId: w.id }] as const),
  ])
  const scope = (key: string) => {
    const row = scopeOf.get(key)
    if (row === undefined) throw new UnknownMarketScope(key)
    return row
  }

  const userIds = new Set(moved.accounts.users.map((u) => u.id))
  const userOfAccount = new Map(moved.accounts.nexonAccounts.map((a) => [a.id, a.userId]))
  const accountOfMaple = new Map(moved.accounts.mapleIds.map((m) => [m.hash, m.nexonAccountId]))
  const userOf = (person: string): string | undefined => {
    const value = person.slice(2)
    if (person.startsWith('u:')) return userIds.has(value) ? value : undefined
    if (person.startsWith('a:')) return userOfAccount.get(value)
    if (person.startsWith('m:')) {
      const account = accountOfMaple.get(value)
      return account === undefined ? undefined : userOfAccount.get(account)
    }
    return undefined
  }
  const judged = new Map<string, typeof schema.marketJudgements.$inferInsert>()
  for (const j of judgements) {
    const userId = userOf(j.person)
    if (userId === undefined) continue
    const key = `${j.day}|${userId}`
    const prev = judged.get(key)
    judged.set(key, {
      date: j.day,
      userId,
      judgedCount: (prev?.judgedCount ?? 0) + j.judged,
      excludedCount: (prev?.excludedCount ?? 0) + j.excluded,
      isDummy: (prev?.isDummy ?? false) || j.dummy,
      createdAt: prev?.createdAt ?? j.createdAt,
    })
  }

  return {
    marketReferencePrices: days.map((d) => ({
      id: d.id,
      date: d.day,
      itemId: itemOf(d.itemId, d.ringLevel),
      ...scope(d.scope),
      source: d.source === 'carry' ? ('kept' as const) : d.source,
      referencePriceMeso: d.refMeso,
      rangeLowMeso: d.q1Meso,
      rangeHighMeso: d.q3Meso,
      fenceLowMeso: d.fenceLow,
      fenceHighMeso: d.fenceHigh,
      freshDate: d.freshDay,
      createdAt: d.createdAt,
    })),
    marketJudgements: [...judged.values()],
    marketPublishedDays: runs.map((r) => ({ id: r.id, date: r.day, createdAt: r.createdAt })),
    maspiBasketItems: basket.map((b) => ({
      id: b.id,
      itemId: itemOf(b.itemId, b.ringLevel),
      ...scope(b.scope),
      basePriceMeso: Math.round(b.basePriceMeso),
      voterCount: b.persons,
      indexWeight: b.weight,
      fromDate: b.entersOn,
      createdAt: b.createdAt,
    })),
    maspiDailyCloses: maspi.map((m) => ({
      id: m.id,
      date: m.day,
      close: m.value,
      createdAt: m.createdAt,
    })),
  }
}

/**
 * 계정 · 로그인 표의 새 줄. 줄 id 그대로 칸 이름만 바뀐다. 세션을 옮겨야 사용자가 다시 로그인하지 않는다.
 *
 * 키 표는 1.0.15 에 두지 않아 옮기지 않는다. 키로만 쓰던 넥슨 계정 줄은 사람과 함께 남는다. 옛 판매가 줄이 그 사람을
 * 가리키고, 1.0.15 앱은 그 계정을 메이플 ID 해시로 다시 찾는다. 로그인 시도는 10분짜리 줄이라 옮기지 않는다. 전환은 점검
 * 잠금 안에서 해서 진행 중인 로그인이 없다.
 */
async function accountRows(oldDb: OldDb) {
  const [users, accounts, maples, subs, refs, sessions] = await Promise.all([
    oldDb.select().from(oldSchema.users),
    oldDb.select().from(oldSchema.nexonAccounts),
    oldDb.select().from(oldSchema.nexonAccountMapleIds),
    oldDb.select().from(oldSchema.subAccounts),
    oldDb.select().from(oldSchema.referrals),
    oldDb.select().from(oldSchema.nexonSessions),
  ])
  return {
    users,
    nexonAccounts: accounts.map((a) => ({
      id: a.id,
      userId: a.userId,
      uidHash: a.nexonUid,
      referralCode: a.referralCode,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    mapleIds: maples.map((m) => ({
      id: m.id,
      nexonAccountId: m.nexonAccountId,
      hash: m.mapleId,
      createdAt: m.createdAt,
    })),
    subAccountRegistrations: subs.map((r) => ({
      id: r.id,
      loginNexonAccountId: r.loginAccountId,
      subNexonAccountId: r.subAccountId,
      createdAt: r.createdAt,
    })),
    referrals: refs.map((r) => ({
      id: r.id,
      referredNexonAccountId: r.referredAccountId,
      referrerNexonAccountId: r.referrerAccountId,
      createdAt: r.createdAt,
    })),
    nexonSessions: sessions.map((n) => ({
      id: n.id,
      hash: n.sessionHash,
      userId: n.userId,
      platform: n.platform,
      sealedAccessToken: n.accessSealed,
      accessExpiresAt: n.accessExpiresAt,
      sealedRefreshToken: n.refreshSealed,
      refreshExpiresAt: n.refreshExpiresAt,
      createdAt: n.createdAt,
      lastUsedAt: n.lastUsedAt,
    })),
  }
}

const CROP_WIDTH = /^(\d+(?:\.\d+)?)% auto$/
const CROP_POSITION = /^(-?\d+(?:\.\d+)?)% (-?\d+(?:\.\d+)?)%$/

/**
 * 크롭 · 공지 · FAQ 의 새 줄. 줄 id 는 그대로다. 크롭의 CSS 글자는 숫자 셋으로 나누고, 앱이 읽지 않는 파티 모달 띠 줄은
 * 옮기지 않는다. FAQ 답의 문단 블록은 빈 줄로 이은 글이 된다. 공지는 칸 이름만 바뀌고 넥슨 id 칸을 버린다.
 */
async function operationRows(oldDb: OldDb) {
  const [crops, notices, sheets, items] = await Promise.all([
    oldDb.select().from(oldSchema.imageCrops),
    oldDb.select().from(oldSchema.notices),
    oldDb.select().from(oldSchema.faqSheets),
    oldDb.select().from(oldSchema.faqItems),
  ])
  const imageCrops = crops.flatMap((c) => {
    if (c.kind === 'boss_portrait_modal') return []
    const width = CROP_WIDTH.exec(c.size)
    const position = CROP_POSITION.exec(c.position)
    if (width === null || position === null)
      throw new UnknownCropValue(`${c.kind} ${c.size} / ${c.position}`)
    return [
      {
        id: c.id,
        type: c.kind,
        assetId: c.assetId,
        widthPercent: Number(width[1]),
        positionXPercent: Number(position[1]),
        positionYPercent: Number(position[2]),
        updatedAt: c.updatedAt,
      },
    ]
  })
  return {
    imageCrops,
    notices: notices.map((n) => ({
      id: n.id,
      key: n.noticeKey,
      type: n.kind,
      title: n.title,
      body: n.body,
      blocks: n.blocks,
      markdown: n.markdown,
      link: n.link,
      publishedAt: n.publishedAt,
      startsAt: n.startsAt,
      endsAt: n.endsAt,
      scheduledAt: n.scheduledAt,
      sentAt: n.sentAt,
      pushTitle: n.pushTitle,
      pushBody: n.pushBody,
      fetchedAt: n.fetchedAt,
      detailFetchedAt: n.detailFetchedAt,
    })),
    faqSheets: sheets,
    faqItems: items.map((i) => ({
      id: i.id,
      sheetId: i.sheetId,
      sortOrder: i.sortOrder,
      question: i.question,
      answer: i.answer.map((block) => block.text).join('\n\n'),
    })),
  }
}

/** 게임 규칙 칸과 옛 규칙 줄의 key. 옛 표는 규칙마다 한 줄이었다. */
const GAME_RULE_KEYS = {
  weeklyBossSelectionLimit: 'weekly_boss_selection_limit',
  weeklyCrystalSaleLimit: 'weekly_crystal_sale_limit',
  defaultMaxPartySize: 'default_max_party_size',
  spendTariffPercent: 'spend_tariff_percent',
  rewardCoinPriceMeso: 'reward_coin_price_meso',
  mesoMarketFeePercent: 'meso_market_fee_percent',
  cubeAppraisalFreeMaxLevel: 'cube_appraisal_free_max_level',
  cubeAppraisalCoefficient: 'cube_appraisal_coefficient',
  starforceDestroyDefenceSurchargePercent: 'starforce_destroy_defence_surcharge_percent',
} as const

/** 옛 규칙 줄 아홉을 한 줄의 칸으로 모은다. 빠진 규칙이 있으면 멈춘다. 새 표의 칸은 비울 수 없다. */
async function gameRuleRow(oldDb: OldDb) {
  const rows = await oldDb.select().from(oldSchema.gameRules)
  const valueOf = (key: string): number => {
    const row = rows.find((r) => r.key === key)
    if (row === undefined) throw new MissingGameRule(key)
    return row.value
  }
  const updatedAt = new Date(Math.max(...rows.map((r) => r.updatedAt.getTime())))
  return {
    updatedAt,
    weeklyBossSelectionLimit: valueOf(GAME_RULE_KEYS.weeklyBossSelectionLimit),
    weeklyCrystalSaleLimit: valueOf(GAME_RULE_KEYS.weeklyCrystalSaleLimit),
    defaultMaxPartySize: valueOf(GAME_RULE_KEYS.defaultMaxPartySize),
    spendTariffPercent: valueOf(GAME_RULE_KEYS.spendTariffPercent),
    rewardCoinPriceMeso: valueOf(GAME_RULE_KEYS.rewardCoinPriceMeso),
    mesoMarketFeePercent: valueOf(GAME_RULE_KEYS.mesoMarketFeePercent),
    cubeAppraisalFreeMaxLevel: valueOf(GAME_RULE_KEYS.cubeAppraisalFreeMaxLevel),
    cubeAppraisalCoefficient: valueOf(GAME_RULE_KEYS.cubeAppraisalCoefficient),
    starforceDestroyDefenceSurchargePercent: valueOf(
      GAME_RULE_KEYS.starforceDestroyDefenceSurchargePercent,
    ),
  }
}

/** 칸의 갱신 시각 줄. 지금 응답에 있는 칸의 줄만 옮긴다. 옛 칸(dropItems · equipmentItems)은 items 칸으로 합쳐졌다. */
async function sectionUpdateRows(oldDb: OldDb) {
  const keys: readonly string[] = SECTION_KEYS
  return (await oldDb.select().from(oldSchema.gameDataSections))
    .filter((r) => keys.includes(r.key))
    .map((r) => ({ id: r.id, key: r.key, updatedAt: r.updatedAt }))
}

/**
 * 강화 비용 · MVP 등급 여섯 표의 새 줄. 줄 id 는 그대로다. 잠재 비용의 구간 시작과 스타포스 단계 표의 이름만 바뀐다. 옛
 * 마이그레이션 0043 이 새 DB 에도 슈페리얼 계열 · 장비 줄을 넣지만, 옮길 표를 먼저 비워 옛 DB 의 줄만 남는다.
 */
async function enhancementCostRows(oldDb: OldDb) {
  const [potential, soul, steps, series, items, grades] = await Promise.all([
    oldDb.select().from(oldSchema.potentialResetCosts),
    oldDb.select().from(oldSchema.soulPotentialResetCosts),
    oldDb.select().from(oldSchema.starforceSteps),
    oldDb.select().from(oldSchema.superiorSeries),
    oldDb.select().from(oldSchema.superiorItems),
    oldDb.select().from(oldSchema.mvpGrades),
  ])
  return {
    potentialResetCosts: potential.map((p) => ({
      id: p.id,
      type: p.type,
      minRequiredLevel: p.minLevel,
      grade: p.grade,
      costMeso: p.costMeso,
    })),
    soulPotentialResetCosts: soul,
    starforceCostSteps: steps,
    superiorSeries: series,
    superiorItems: items,
    mvpGrades: grades,
  }
}

/** 사냥터 표 셋의 새 줄. 줄 id 는 그대로이고 칸 이름만 바뀐다. */
async function huntingGroundRows(oldDb: OldDb) {
  const [regions, grounds, levels] = await Promise.all([
    oldDb.select().from(oldSchema.huntingRegions),
    oldDb.select().from(oldSchema.huntingGrounds),
    oldDb.select().from(oldSchema.huntingGroundLevels),
  ])
  return {
    huntingRegions: regions.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      forceType: r.forceType,
      iconAssetId: r.iconMapAssetId,
      sortOrder: r.sortOrder,
    })),
    huntingGrounds: grounds.map((g) => ({
      id: g.id,
      key: g.key,
      regionId: g.regionId,
      name: g.name,
      requiredForce: g.force,
      mobQuantity: g.mobs,
      sortOrder: g.sortOrder,
      isPopular: g.popular,
    })),
    huntingGroundLevels: levels.map((l) => ({
      id: l.id,
      groundId: l.groundId,
      mobLevel: l.level,
    })),
  }
}

/** 심볼 표 셋의 새 줄. 줄 id 는 그대로이고 칸 이름만 바뀐다. */
async function symbolRows(oldDb: OldDb) {
  const [groups, symbols, costs] = await Promise.all([
    oldDb.select().from(oldSchema.symbolGroups),
    oldDb.select().from(oldSchema.symbols),
    oldDb.select().from(oldSchema.symbolLevelCosts),
  ])
  return {
    symbolGroups: groups.map((g) => ({
      id: g.id,
      key: g.key,
      name: g.name,
      maxLevel: g.maxLevel,
      defaultFromLevel: g.defaultFrom,
      defaultToLevel: g.defaultTo,
      sortOrder: g.sortOrder,
    })),
    symbols: symbols.map((s) => ({
      id: s.id,
      key: s.key,
      groupId: s.groupId,
      name: s.name,
      requiredLevel: s.requiredLevel,
      iconAssetId: s.iconAssetId,
      sortOrder: s.sortOrder,
    })),
    symbolLevelCosts: costs.map((c) => ({
      id: c.id,
      symbolId: c.symbolId,
      fromLevel: c.level,
      costMeso: c.costMeso,
      validFrom: c.from,
      validUntil: c.until,
    })),
  }
}

/**
 * 가계부 기준 표 · 지출 목록 아홉의 새 줄. 줄 id 는 그대로다. 지출 타일의 그림은 두 칸 가운데 찬 칸을 적는다. 둘이 함께 찬
 * 줄은 옛 표의 CHECK 가 막았다. 항목의 줄인 이름은 앱이 읽지 않아 옮기지 않는다. 재화 `point` 는 `maple_point` 로 적는다.
 */
async function cashbookReferenceRows(oldDb: OldDb) {
  const [categories, itemKinds, loot, forms, groups, tiles, items, options, itemForms] =
    await Promise.all([
      oldDb.select().from(oldSchema.cashbookCategories),
      oldDb.select().from(oldSchema.cashbookItemKinds),
      oldDb.select().from(oldSchema.huntLootItems),
      oldDb.select().from(oldSchema.spendForms),
      oldDb.select().from(oldSchema.spendGroups),
      oldDb.select().from(oldSchema.spendTiles),
      oldDb.select().from(oldSchema.spendItems),
      oldDb.select().from(oldSchema.spendItemOptions),
      oldDb.select().from(oldSchema.spendItemForms),
    ])
  return {
    cashbookCategories: categories.map((c) => ({
      id: c.id,
      entryType: c.entryType,
      key: c.key,
      name: c.name,
      cardTitle: c.cardTitle,
      iconAssetId: c.iconAssetId,
      description: c.description,
      unit: c.unit,
      sortOrder: c.sortOrder,
    })),
    cashbookItemTypes: itemKinds.map((k) => ({
      id: k.id,
      key: k.key,
      name: k.name,
      unit: k.unit,
      hasTariff: k.hasTariff,
      sortOrder: k.sortOrder,
    })),
    huntLootItems: loot.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      type: l.kind,
      npcPriceMeso: l.npcPriceMeso,
      validFrom: l.from,
      validUntil: l.until,
      sortOrder: l.sortOrder,
    })),
    spendRewardTypes: forms.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      sortOrder: f.sortOrder,
    })),
    spendGroups: groups.map((g) => ({
      id: g.id,
      key: g.key,
      name: g.name,
      cashbookCategoryId: g.categoryId,
      cardTitle: g.cardTitle,
      isActive: g.active,
      sortOrder: g.sortOrder,
    })),
    spendTiles: tiles.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      iconAssetId: t.iconAssetId ?? t.iconMapAssetId,
    })),
    spendItems: items.map((i) => ({
      id: i.id,
      key: i.key,
      groupId: i.groupId,
      tileId: i.tileId,
      name: i.name,
      tier: i.tier,
      currency: i.currency === 'point' ? ('maple_point' as const) : i.currency,
      unitPrice: i.unitPrice,
      unit: i.unit,
      maxQuantity: i.maxQuantity,
      rewardCoinQuantity: i.rewardCoins,
      validFrom: i.from,
      validUntil: i.until,
      sortOrder: i.sortOrder,
    })),
    spendItemOptions: options.map((o) => ({
      id: o.id,
      itemId: o.itemId,
      axis: o.axis,
      value: o.value,
    })),
    spendItemRewardTypes: itemForms.map((f) => ({
      id: f.id,
      itemId: f.itemId,
      rewardTypeId: f.formId,
    })),
  }
}

/** 점수로 완료를 판정하는 컨텐츠. 점수가 0 보다 크면 완료다. */
const SCORE_CONTENTS = ['guild_underground_waterway', 'guild_flag_race', 'mu_lung_dojo']
/** 퀘스트 상태를 먼저 보고 진행 중이면 횟수를 읽는 컨텐츠. */
const BOTH_CONTENTS = ['weekly_quest_faithful_investigation_reward', 'monster_park_extreme']
/** 넥슨 type 이 quest 가 아니어도 횟수로 세는 컨텐츠. */
const COUNT_CONTENTS = ['guild_weekly_mission_points']

/**
 * 컨텐츠 표 둘의 새 줄. 줄 id 는 그대로다. 완료 조건은 지금 앱이 컨텐츠 key 와 분류로 가르던 것을 표에 적는다. 표에 적힌 key 가
 * 아니면 넥슨 type 으로 정해, 전환 전에 생긴 새 컨텐츠도 정해진다. 최대 횟수는 횟수로 세는 줄에만 남기고, 넥슨 오류를 덮던 값이
 * 있으면 그 값을 쓴다. 공유 줄의 짧은 이름 자리에는 공유 위젯의 글자를 적는다. 공유 줄의 지금 짧은 이름은 그리는 곳이 없다.
 */
async function contentRows(oldDb: OldDb) {
  const [categories, rows] = await Promise.all([
    oldDb.select().from(oldSchema.contentCategories),
    oldDb.select().from(oldSchema.contents),
  ])
  const categoryKey = new Map(categories.map((c) => [c.id, c.key]))
  const checkTypeOf = (
    c: (typeof rows)[number],
  ): (typeof schema.contentCheckTypeEnum.enumValues)[number] => {
    if (SCORE_CONTENTS.includes(c.key)) return 'score'
    if (BOTH_CONTENTS.includes(c.key)) return 'both'
    if (COUNT_CONTENTS.includes(c.key) || categoryKey.get(c.categoryId) === 'epic_dungeon')
      return 'count_only'
    return c.type === 'contents' ? 'count_only' : 'state_only'
  }
  return {
    contentCategories: categories.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      countTag: c.countTag,
      hidesCountTag: c.hideCountTag,
      weeklyMaxCount: c.weeklyLimit,
      sharedSortOrder: c.sharedOrder,
      sortOrder: c.sortOrder,
    })),
    contents: rows.map((c) => {
      const checkType = checkTypeOf(c)
      return {
        id: c.id,
        key: c.key,
        cycle: c.section,
        apiName: c.apiName,
        categoryId: c.categoryId,
        name: c.displayName,
        shortName: c.shareScope === 'character' ? c.shortName : (c.sharedShortName ?? c.shortName),
        backgroundMapAssetId: c.backgroundMapAssetId,
        backgroundPortraitAssetId: c.backgroundPortraitAssetId,
        regionIconAssetId: c.regionIconAssetId,
        countTag: c.countTag,
        type: c.type,
        checkType,
        maxCount: checkType === 'count_only' ? (c.maxCountOverride ?? c.maxCount) : null,
        requiredLevel: c.requiredLevel,
        validFrom: c.from,
        validUntil: c.until,
        shareScope: c.shareScope,
        sortOrder: c.sortOrder,
      }
    }),
  }
}

/**
 * 보스가 쓰는 기준 표 다섯의 새 줄. 줄 id 는 그대로다. 고정 보상의 개수는 글자 끝의 `개` 를 떼고 정수로 바꾼다. 상자 내용물
 * 가운데 같은 물건으로 따로 둔 원래 아이템을 가리키는 줄은 상자에서 나온 줄을 가리키게 바꾼다. 보스가 직접 떨구는 드롭 표의
 * 줄은 원래 아이템을 그대로 가리킨다.
 */
async function bossReferenceRows(oldDb: OldDb, boxedCopyOf: ReadonlyMap<string, string>) {
  const [rewards, boxes, contents, prices, periods] = await Promise.all([
    oldDb.select().from(oldSchema.bossDropRewards),
    oldDb.select().from(oldSchema.dropBoxes),
    oldDb.select().from(oldSchema.dropBoxContents),
    oldDb.select().from(oldSchema.bossCrystalPrices),
    oldDb.select().from(oldSchema.manualCompletionBosses),
  ])
  return {
    bossDifficultyRewards: rewards.map((r) => ({
      id: r.id,
      bossDifficultyId: r.bossDifficultyId,
      category: r.category,
      itemId: r.itemId,
      quantity: quantityOf(r.amount),
      validFrom: r.from,
      validUntil: r.until,
      sortOrder: r.sortOrder,
    })),
    dropBoxes: boxes.map((b) => ({
      id: b.id,
      itemId: b.itemId,
      ringLevelMin: b.levelMin,
      ringLevelMax: b.levelMax,
    })),
    dropBoxContents: contents.map((c) => ({
      id: c.id,
      boxId: c.boxId,
      itemId: boxedCopyOf.get(c.itemId) ?? c.itemId,
      sortOrder: c.sortOrder,
    })),
    bossCrystalPrices: prices.map((p) => ({
      id: p.id,
      bossDifficultyId: p.bossDifficultyId,
      priceMeso: p.priceMeso,
      validFrom: p.from,
      validUntil: p.until,
    })),
    bossManualCompletionPeriods: periods.map((p) => ({
      id: p.id,
      bossId: p.bossId,
      fromDate: p.fromDate,
      openedAt: p.openedAt,
      closedAt: p.closedAt,
    })),
  }
}

/** 옛 개수 글자 `160개` · `200` 을 정수로. 비었으면 null 이다. */
function quantityOf(amount: string | null): number | null {
  if (amount === null) return null
  const match = /^(\d+)개?$/.exec(amount)
  if (match?.[1] === undefined) throw new UnknownQuantity(amount)
  return Number(match[1])
}

/**
 * 헥사 매트릭스 표 다섯의 새 줄. 직업은 코어의 직업 글자로 만들고 전직업 줄을 더한다. 모든 직업에 같은 이름으로 있는 코어는
 * 전직업의 코어 한 줄로 합치고, 남는 줄의 id 는 직업 이름 차례로 첫 직업의 것이다. 종류는 지금 앱이 가르는 대로 이름 표에
 * 있으면 그 종류, 없으면 넥슨 타입의 기본 종류다. 차례는 같은 직업 · 같은 종류 안에서 옛 차례대로 0 부터 다시 매긴다.
 */
async function hexaRows(oldDb: OldDb) {
  const [kinds, costs, nameKinds, cores, stats] = await Promise.all([
    oldDb.select().from(oldSchema.hexaCoreKinds),
    oldDb.select().from(oldSchema.hexaCoreLevelCosts),
    oldDb.select().from(oldSchema.hexaCoreNameKinds),
    oldDb.select().from(oldSchema.hexaJobCores),
    oldDb.select().from(oldSchema.hexaStats),
  ])
  const jobNames = [...new Set(cores.map((c) => c.job))].sort()
  const jobs = [
    ...jobNames.map((name) => ({ id: randomUUID(), name, isAllJobs: false })),
    { id: randomUUID(), name: ALL_JOBS, isAllJobs: true },
  ]
  const jobIdOf = new Map(jobs.map((j) => [j.name, j.id]))
  const allJobsId = jobIdOf.get(ALL_JOBS) ?? ''

  const namedType = new Map(nameKinds.map((n) => [n.name, n.kindId]))
  const defaultType = new Map(kinds.filter((k) => k.isDefault).map((k) => [k.apiType, k.id]))
  const typeOf = (core: (typeof cores)[number]): string => {
    const typeId = namedType.get(core.name.trim()) ?? defaultType.get(core.apiType)
    if (typeId === undefined) throw new UnknownHexaCoreType(`${core.job} · ${core.name}`)
    return typeId
  }
  const jobsOfName = new Map<string, Set<string>>()
  for (const c of cores) jobsOfName.set(c.name, (jobsOfName.get(c.name) ?? new Set()).add(c.job))
  // 직업이 하나뿐이면 그 직업의 코어가 모두 공용으로 잡힌다.
  const isShared = (name: string) =>
    jobNames.length > 1 && jobsOfName.get(name)?.size === jobNames.length

  const kept: (typeof schema.hexaCores.$inferInsert & { oldOrder: number })[] = []
  const sharedRows = new Map<string, (typeof kept)[number]>()
  const byJob = [...cores].sort((x, y) =>
    x.job < y.job ? -1 : x.job > y.job ? 1 : x.sortOrder - y.sortOrder,
  )
  for (const c of byJob) {
    const row = {
      id: c.id,
      jobId: jobIdOf.get(c.job) ?? '',
      name: c.name,
      typeId: typeOf(c),
      iconAssetId: c.iconAssetId,
      sortOrder: 0,
      oldOrder: c.sortOrder,
    }
    if (!isShared(c.name)) {
      kept.push(row)
      continue
    }
    const first = sharedRows.get(c.name)
    if (first === undefined) {
      const shared = { ...row, jobId: allJobsId }
      sharedRows.set(c.name, shared)
      kept.push(shared)
    } else if (first.iconAssetId !== row.iconAssetId || first.typeId !== row.typeId) {
      throw new SharedCoreMismatch(c.name)
    }
  }
  const nextOrder = new Map<string, number>()
  const hexaCores = [...kept]
    .sort((x, y) => x.oldOrder - y.oldOrder)
    .map((row) => {
      const group = `${row.jobId}|${row.typeId}`
      const sortOrder = nextOrder.get(group) ?? 0
      nextOrder.set(group, sortOrder + 1)
      return {
        id: row.id,
        jobId: row.jobId,
        name: row.name,
        typeId: row.typeId,
        iconAssetId: row.iconAssetId,
        sortOrder,
      }
    })

  return {
    jobs,
    hexaCoreTypes: kinds.map((k) => ({
      id: k.id,
      key: k.key,
      name: k.name,
      apiType: k.apiType,
      isDefault: k.isDefault,
      maxLevel: k.maxLevel,
      iconAssetId: k.iconAssetId,
      sortOrder: k.sortOrder,
    })),
    hexaCores,
    hexaCoreLevelCosts: costs.map((c) => ({
      id: c.id,
      typeId: c.kindId,
      fromLevel: c.level,
      fragmentQuantity: c.fragments,
      solErdaQuantity: c.solErda,
    })),
    hexaStats: stats.map((st) => ({
      id: st.id,
      key: st.key,
      name: st.name,
      activationFragmentQuantity: st.activationFragments,
      sortOrder: st.sortOrder,
    })),
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
