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
}

/** 옛 DB 와 새 DB 를 바꿔 넣었다. 그대로 돌리면 옛 DB 를 비운다. */
export class SwappedDatabases extends Error {}

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
  }
}

/**
 * 가계부 기준 표 · 지출 목록 아홉의 새 줄. 줄 id 는 그대로다. 지출 타일의 그림은 두 칸 가운데 찬 칸을 적는다. 둘이 함께 찬
 * 줄은 옛 표의 CHECK 가 막았다. 항목의 줄인 이름은 앱이 읽지 않아 옮기지 않는다.
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
      currency: i.currency,
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
