/**
 * 게임 데이터 표의 첫 채움. `node dist/cli/seed-game-data.js`
 *
 * `src/database/seed/<표>.json` 을 읽어 **비어 있는 표만** 채운다. 줄이 하나라도 있는 표는 건너뛴다.
 * 운영자가 관리 화면 폼으로 고친 값을 배포 때 씨앗이 되돌리면 안 되기 때문이다. 씨앗 파일은 앱 번들
 * JSON 과 같은 모양이고 `updatedAt` 은 있어도 버린다. 서버가 넣는 시각이 기준이다.
 *
 * 차례가 있다. 보스 → 드롭 아이템 → 드롭 표 · 상자 · 결정석 가격 → 월드 → 지출 · 심볼 → 컨텐츠 → 장비 · 강화 비용 · MVP 등급 → 사냥터 → 사냥 전리품.
 * 뒤의 것이 앞의 줄을 가리킨다.
 *
 * 마이그레이션처럼 컨테이너 안에서 돌린다. `docker compose run --rm server node dist/cli/seed-game-data.js`
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'
import { z } from 'zod'

import type { Db } from '../database/database.module'
import * as schema from '../database/schema'
import { BOSS_DIFFICULTIES, bossInput, rulesInput } from '../modules/bosses/bosses.dto'
import { BossesRepository } from '../modules/bosses/bosses.repository'
import {
  CONTENT_CATEGORIES,
  CONTENT_SECTIONS,
  CONTENT_TYPES,
  SHARE_SCOPES,
} from '../modules/contents/contents.repository'
import {
  ENHANCEMENT_RULE_KEYS,
  type EnhancementRuleField,
  POTENTIAL_GRADES,
  POTENTIAL_RESET_TYPES,
} from '../modules/enhancement-costs/enhancement-costs.repository'
import { FORCE_TYPES } from '../modules/hunting-grounds/hunting-grounds.repository'
import { MVP_GRADES } from '../modules/mvp-grades/mvp-grades.repository'
import { HUNT_LOOT_KINDS } from '../modules/hunt-loot/hunt-loot.repository'
import { type DbOrTx, touchSection } from '../modules/game-data/sections'
import { CASHBOOK_ENTRY_TYPES } from '../modules/cashbook-categories/cashbook-categories.repository'
import {
  SPEND_CURRENCIES,
  SPEND_FORMS,
  SPEND_RULE_KEYS,
  type SpendRuleField,
} from '../modules/spend-catalog/spend-catalog.repository'

const {
  bossCrystalPrices,
  bossDifficulties,
  bossDropRewards,
  bosses,
  cashbookCategories,
  cashbookItemKinds,
  contentCategories,
  contents,
  dropBoxContents,
  dropBoxes,
  dropItems,
  equipmentItems,
  gameRules,
  huntingGroundLevels,
  huntingGrounds,
  huntingRegions,
  huntLootItems,
  mvpGrades,
  potentialResetCosts,
  soulPotentialResetCosts,
  spendForms,
  spendGroups,
  spendItemForms,
  spendItemOptions,
  spendItems,
  spendTiles,
  starforceSteps,
  symbolGroups,
  symbolLevelCosts,
  symbols,
  worlds,
} = schema

/** 이미지에 그대로 실리는 씨앗 폴더. Dockerfile 이 `src/database/seed` 를 dist 옆에 복사한다. */
const SEED_FOLDER = join(__dirname, '..', '..', 'src', 'database', 'seed')

const bossesSeed = z.object({ rules: rulesInput, bosses: z.array(bossInput).min(1) })
export type BossesSeed = z.infer<typeof bossesSeed>

/** 보스 씨앗. 모양이 어긋나면 던진다. 모르는 칸은 버린다. */
export function parseBossesSeed(value: unknown): BossesSeed {
  return bossesSeed.parse(value)
}

const key = z.string().regex(/^[a-z][a-z0-9_]*$/)
const period = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
  .nullable()

const dropItemsSeed = z.object({
  items: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        iconFile: z.string().min(1).nullable(),
        valuable: z.boolean(),
      }),
    )
    .min(1),
})
export type DropItemsSeed = z.infer<typeof dropItemsSeed>
export function parseDropItemsSeed(value: unknown): DropItemsSeed {
  return dropItemsSeed.parse(value)
}

const bossDropsSeed = z.object({
  rewards: z
    .array(
      z.object({
        boss: key,
        difficulty: z.enum(BOSS_DIFFICULTIES),
        category: z.enum(['fixed', 'equipment', 'consumable']),
        item: key,
        amount: z.string().min(1).nullable(),
        from: period,
        until: period,
      }),
    )
    .min(1),
})
export type BossDropsSeed = z.infer<typeof bossDropsSeed>
export function parseBossDropsSeed(value: unknown): BossDropsSeed {
  return bossDropsSeed.parse(value)
}

const dropBoxesSeed = z.object({
  boxes: z
    .array(
      z
        .object({
          item: key,
          levelMin: z.number().int().min(1).nullable(),
          levelMax: z.number().int().min(1).nullable(),
          contents: z.array(key).min(1),
        })
        .refine(
          (b) =>
            (b.levelMin === null) === (b.levelMax === null) &&
            (b.levelMin === null || b.levelMin <= (b.levelMax ?? 0)),
          {
            message: '레벨 범위는 둘 다 있거나 둘 다 없고 min 이 max 를 안 넘는다',
          },
        ),
    )
    .min(1),
})
export type DropBoxesSeed = z.infer<typeof dropBoxesSeed>
export function parseDropBoxesSeed(value: unknown): DropBoxesSeed {
  return dropBoxesSeed.parse(value)
}

const crystalPricesSeed = z.object({
  defaultMaxPartySize: z.number().int().min(1).max(6),
  maxPartySizes: z.array(
    z.object({
      boss: key,
      difficulty: z.enum(BOSS_DIFFICULTIES),
      maxPartySize: z.number().int().min(1).max(6),
    }),
  ),
  prices: z
    .array(
      z.object({
        boss: key,
        difficulty: z.enum(BOSS_DIFFICULTIES),
        priceMeso: z.number().int().min(1),
        from: period,
        until: period,
      }),
    )
    .min(1),
})
export type CrystalPricesSeed = z.infer<typeof crystalPricesSeed>
export function parseCrystalPricesSeed(value: unknown): CrystalPricesSeed {
  return crystalPricesSeed.parse(value)
}

const worldsSeed = z.object({
  worlds: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        emblem: z.string().min(1).nullable(),
        challengers: z.boolean(),
        event: z.boolean(),
      }),
    )
    .min(1),
})
export type WorldsSeed = z.infer<typeof worldsSeed>
export function parseWorldsSeed(value: unknown): WorldsSeed {
  return worldsSeed.parse(value)
}

const cashbookCategoriesSeed = z.object({
  categories: z
    .array(
      z.object({
        entryType: z.enum(CASHBOOK_ENTRY_TYPES),
        key,
        name: z.string().min(1),
        cardTitle: z.string().min(1),
        iconFile: z.string().min(1),
        description: z.string(),
        unit: z.string().min(1).nullable(),
      }),
    )
    .min(1),
  itemKinds: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        unit: z.string().min(1).nullable(),
        hasTariff: z.boolean(),
      }),
    )
    .min(1),
})
export type CashbookCategoriesSeed = z.infer<typeof cashbookCategoriesSeed>
export function parseCashbookCategoriesSeed(value: unknown): CashbookCategoriesSeed {
  return cashbookCategoriesSeed.parse(value)
}

const spendCatalogSeed = z.object({
  rules: z.object({
    tariffPercent: z.number().int().min(0).max(100),
    rewardCoinPriceMeso: z.number().int().min(1),
  }),
  groups: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        category: key,
        cardTitle: z.string().min(1),
        active: z.boolean(),
      }),
    )
    .min(1),
  tiles: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        iconFile: z.string().min(1).nullable(),
        iconMap: z.string().min(1).nullable(),
      }),
    )
    .min(1),
  items: z
    .array(
      z.object({
        key,
        group: key,
        tile: key,
        name: z.string().min(1),
        shortName: z.string().min(1).nullable(),
        tier: z.string().min(1).nullable(),
        currency: z.enum(SPEND_CURRENCIES),
        unitPrice: z.number().int().min(0).nullable(),
        unit: z.string().min(1),
        maxQuantity: z.number().int().min(1).nullable(),
        rewardCoins: z.number().int().min(1).nullable(),
        from: period,
        until: period,
      }),
    )
    .min(1),
  itemOptions: z.array(z.object({ item: key, axis: z.string().min(1), value: z.string().min(1) })),
  itemForms: z.array(z.object({ item: key, form: z.enum(SPEND_FORMS) })),
  forms: z.array(z.object({ key: z.enum(SPEND_FORMS), name: z.string().min(1) })).min(1),
})
export type SpendCatalogSeed = z.infer<typeof spendCatalogSeed>
export function parseSpendCatalogSeed(value: unknown): SpendCatalogSeed {
  return spendCatalogSeed.parse(value)
}

const symbolCostsSeed = z.object({
  groups: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        maxLevel: z.number().int().min(2),
        defaultFrom: z.number().int().min(1),
        defaultTo: z.number().int().min(1),
      }),
    )
    .min(1),
  symbols: z
    .array(
      z.object({
        key,
        group: key,
        name: z.string().min(1),
        requiredLevel: z.number().int().min(1),
        iconFile: z.string().min(1),
      }),
    )
    .min(1),
  levelCosts: z
    .array(
      z.object({
        symbol: key,
        level: z.number().int().min(1),
        costMeso: z.number().int().min(1),
        from: period,
        until: period,
      }),
    )
    .min(1),
})
export type SymbolCostsSeed = z.infer<typeof symbolCostsSeed>
export function parseSymbolCostsSeed(value: unknown): SymbolCostsSeed {
  return symbolCostsSeed.parse(value)
}

const contentsSeed = z.object({
  categories: z
    .array(
      z.object({
        key: z.enum(CONTENT_CATEGORIES),
        name: z.string().min(1),
        countTag: z.string().min(1).nullable(),
        hideCountTag: z.boolean(),
        weeklyLimit: z.number().int().min(1).nullable(),
        sharedOrder: z.number().int().min(0).nullable(),
      }),
    )
    .min(1),
  contents: z
    .array(
      z.object({
        key,
        section: z.enum(CONTENT_SECTIONS),
        apiName: z.string().min(1),
        category: z.enum(CONTENT_CATEGORIES),
        displayName: z.string().min(1),
        shortName: z.string().min(1),
        backgroundMap: z.string().min(1).nullable(),
        backgroundPortrait: z.string().min(1).nullable(),
        countTag: z.string().min(1).nullable(),
        type: z.enum(CONTENT_TYPES),
        maxCount: z.number().int().min(0),
        requiredLevel: z.number().int().min(1).nullable(),
        from: period,
        until: period,
        shareScope: z.enum(SHARE_SCOPES),
        sharedShortName: z.string().min(1).nullable(),
        onlyWhenScheduled: z.boolean(),
        trustRegistrationFlag: z.boolean(),
        cumulativeScore: z.boolean(),
        maxCountOverride: z.number().int().min(1).nullable(),
      }),
    )
    .min(1),
})
export type ContentsSeed = z.infer<typeof contentsSeed>
export function parseContentsSeed(value: unknown): ContentsSeed {
  return contentsSeed.parse(value)
}

const equipmentItemsSeed = z.object({
  items: z
    .array(
      z.object({
        key,
        name: z.string().min(1),
        level: z.number().int().min(1).nullable(),
      }),
    )
    .min(1),
})
export type EquipmentItemsSeed = z.infer<typeof equipmentItemsSeed>
export function parseEquipmentItemsSeed(value: unknown): EquipmentItemsSeed {
  return equipmentItemsSeed.parse(value)
}

const enhancementCostsSeed = z.object({
  rules: z.object({
    cubeAppraisalFreeMaxLevel: z.number().int().min(0),
    cubeAppraisalCoefficient: z.number().int().min(0),
    starforceDestroyDefenceSurchargePercent: z.number().int().min(0),
  }),
  potentialResetCosts: z
    .array(
      z.object({
        type: z.enum(POTENTIAL_RESET_TYPES),
        minLevel: z.number().int().min(1),
        grade: z.enum(POTENTIAL_GRADES),
        costMeso: z.number().int().min(0),
      }),
    )
    .min(1),
  soulPotentialResetCosts: z
    .array(z.object({ grade: z.enum(POTENTIAL_GRADES), costMeso: z.number().int().min(0) }))
    .min(1),
  starforceSteps: z
    .array(
      z.object({
        fromStar: z.number().int().min(0),
        exponent: z.number().min(0),
        divisor: z.number().int().min(1),
      }),
    )
    .min(1),
})
export type EnhancementCostsSeed = z.infer<typeof enhancementCostsSeed>
export function parseEnhancementCostsSeed(value: unknown): EnhancementCostsSeed {
  return enhancementCostsSeed.parse(value)
}

const mvpGradesSeed = z.object({
  grades: z
    .array(
      z.object({
        key: z.enum(MVP_GRADES),
        name: z.string().min(1),
        auctionFeePercent: z.number().int().min(0).max(100),
        starforceDiscountPercent: z.number().int().min(0).max(100),
      }),
    )
    .min(1),
})
export type MvpGradesSeed = z.infer<typeof mvpGradesSeed>
export function parseMvpGradesSeed(value: unknown): MvpGradesSeed {
  return mvpGradesSeed.parse(value)
}

const huntingGroundsSeed = z.object({
  regions: z
    .array(z.object({ key, name: z.string().min(1), forceType: z.enum(FORCE_TYPES) }))
    .min(1),
  grounds: z
    .array(
      z.object({
        key,
        region: key,
        name: z.string().min(1),
        force: z.number().int().min(0),
        mobs: z.number().int().min(1),
      }),
    )
    .min(1),
  groundLevels: z.array(z.object({ ground: key, level: z.number().int().min(1) })).min(1),
})
export type HuntingGroundsSeed = z.infer<typeof huntingGroundsSeed>
export function parseHuntingGroundsSeed(value: unknown): HuntingGroundsSeed {
  return huntingGroundsSeed.parse(value)
}

const huntLootSeed = z.object({
  items: z
    .array(
      z
        .object({
          key,
          kind: z.enum(HUNT_LOOT_KINDS),
          name: z.string().min(1),
          iconFile: z.string().min(1),
          npcPriceMeso: z.number().int().min(1).nullable(),
          from: period,
          until: period,
        })
        .refine((i) => (i.kind === 'consumable') === (i.npcPriceMeso !== null), {
          message: 'NPC 가격은 소비에만 있고 소비에는 반드시 있다',
        }),
    )
    .min(1),
})
export type HuntLootSeed = z.infer<typeof huntLootSeed>
export function parseHuntLootSeed(value: unknown): HuntLootSeed {
  return huntLootSeed.parse(value)
}

export interface GameDataSeeds {
  bosses?: BossesSeed
  dropItems?: DropItemsSeed
  bossDrops?: BossDropsSeed
  dropBoxes?: DropBoxesSeed
  crystalPrices?: CrystalPricesSeed
  worlds?: WorldsSeed
  cashbookCategories?: CashbookCategoriesSeed
  spendCatalog?: SpendCatalogSeed
  symbolCosts?: SymbolCostsSeed
  contents?: ContentsSeed
  equipmentItems?: EquipmentItemsSeed
  enhancementCosts?: EnhancementCostsSeed
  mvpGrades?: MvpGradesSeed
  huntingGrounds?: HuntingGroundsSeed
  huntLoot?: HuntLootSeed
}

export type SeedOutcome = 'seeded' | 'skipped'

/** 씨앗이 있는 표마다 채웠는지 건너뛰었는지를 돌려준다. */
export async function seedGameData(
  db: Db,
  seeds: GameDataSeeds,
): Promise<Partial<Record<keyof GameDataSeeds, SeedOutcome>>> {
  const result: Partial<Record<keyof GameDataSeeds, SeedOutcome>> = {}
  if (seeds.bosses !== undefined) result.bosses = await seedBosses(db, seeds.bosses)
  if (seeds.dropItems !== undefined) result.dropItems = await seedDropItems(db, seeds.dropItems)
  if (seeds.bossDrops !== undefined) result.bossDrops = await seedBossDrops(db, seeds.bossDrops)
  if (seeds.dropBoxes !== undefined) result.dropBoxes = await seedDropBoxes(db, seeds.dropBoxes)
  if (seeds.crystalPrices !== undefined)
    result.crystalPrices = await seedCrystalPrices(db, seeds.crystalPrices)
  if (seeds.worlds !== undefined) result.worlds = await seedWorlds(db, seeds.worlds)
  if (seeds.cashbookCategories !== undefined)
    result.cashbookCategories = await seedCashbookCategories(db, seeds.cashbookCategories)
  if (seeds.spendCatalog !== undefined)
    result.spendCatalog = await seedSpendCatalog(db, seeds.spendCatalog)
  if (seeds.symbolCosts !== undefined)
    result.symbolCosts = await seedSymbolCosts(db, seeds.symbolCosts)
  if (seeds.contents !== undefined) result.contents = await seedContents(db, seeds.contents)
  if (seeds.equipmentItems !== undefined)
    result.equipmentItems = await seedEquipmentItems(db, seeds.equipmentItems)
  if (seeds.enhancementCosts !== undefined)
    result.enhancementCosts = await seedEnhancementCosts(db, seeds.enhancementCosts)
  if (seeds.mvpGrades !== undefined) result.mvpGrades = await seedMvpGrades(db, seeds.mvpGrades)
  if (seeds.huntingGrounds !== undefined)
    result.huntingGrounds = await seedHuntingGrounds(db, seeds.huntingGrounds)
  if (seeds.huntLoot !== undefined) result.huntLoot = await seedHuntLoot(db, seeds.huntLoot)
  return result
}

async function seedWorlds(db: Db, seed: WorldsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, worlds))) return 'skipped'
  await db.transaction(async (tx) => {
    await tx.insert(worlds).values(seed.worlds.map((w, sortOrder) => ({ ...w, sortOrder })))
    await touchSection(tx, 'worlds')
  })
  return 'seeded'
}

async function isEmpty(
  db: DbOrTx,
  table:
    | typeof dropItems
    | typeof bossDropRewards
    | typeof dropBoxes
    | typeof bossCrystalPrices
    | typeof worlds
    | typeof cashbookCategories
    | typeof cashbookItemKinds
    | typeof spendForms
    | typeof spendGroups
    | typeof spendTiles
    | typeof spendItems
    | typeof symbolGroups
    | typeof contentCategories
    | typeof equipmentItems
    | typeof potentialResetCosts
    | typeof soulPotentialResetCosts
    | typeof starforceSteps
    | typeof mvpGrades
    | typeof huntLootItems
    | typeof huntingRegions,
): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table)
  return (row?.n ?? 0) === 0
}

/** 보스 key · 난이도 → 난이도 줄 id. 씨앗이 가리키는 조합이 표에 없으면 던진다. */
async function pairIds(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: bossDifficulties.id, boss: bosses.key, difficulty: bossDifficulties.difficulty })
    .from(bossDifficulties)
    .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
  return new Map(rows.map((r) => [`${r.boss}/${r.difficulty}`, r.id]))
}

async function itemIds(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ id: dropItems.id, key: dropItems.key }).from(dropItems)
  return new Map(rows.map((r) => [r.key, r.id]))
}

function must<T>(map: Map<string, T>, key: string, what: string): T {
  const value = map.get(key)
  if (value === undefined) throw new Error(`씨앗이 가리키는 ${what}이 표에 없다: ${key}`)
  return value
}

async function seedDropItems(db: Db, seed: DropItemsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, dropItems))) return 'skipped'
  await db.transaction(async (tx) => {
    await tx.insert(dropItems).values(seed.items)
    await touchSection(tx, 'dropItems')
  })
  return 'seeded'
}

async function seedBossDrops(db: Db, seed: BossDropsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, bossDropRewards))) return 'skipped'
  const pairs = await pairIds(db)
  const items = await itemIds(db)
  const counters = new Map<string, number>()
  const rows = seed.rewards.map((r) => {
    const pair = must(pairs, `${r.boss}/${r.difficulty}`, '보스 난이도')
    const group = `${pair}/${r.category}`
    const sortOrder = counters.get(group) ?? 0
    counters.set(group, sortOrder + 1)
    return {
      bossDifficultyId: pair,
      category: r.category,
      itemId: must(items, r.item, '아이템'),
      amount: r.amount,
      from: r.from,
      until: r.until,
      sortOrder,
    }
  })
  await db.transaction(async (tx) => {
    await tx.insert(bossDropRewards).values(rows)
    await touchSection(tx, 'bossDrops')
  })
  return 'seeded'
}

async function seedDropBoxes(db: Db, seed: DropBoxesSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, dropBoxes))) return 'skipped'
  const items = await itemIds(db)
  await db.transaction(async (tx) => {
    for (const box of seed.boxes) {
      const [row] = await tx
        .insert(dropBoxes)
        .values({
          itemId: must(items, box.item, '아이템'),
          levelMin: box.levelMin,
          levelMax: box.levelMax,
        })
        .returning({ id: dropBoxes.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await tx.insert(dropBoxContents).values(
        box.contents.map((item, sortOrder) => ({
          boxId: row.id,
          itemId: must(items, item, '아이템'),
          sortOrder,
        })),
      )
    }
    await touchSection(tx, 'dropBoxes')
  })
  return 'seeded'
}

/**
 * 가격 줄은 비어 있을 때만 넣는다. 파티 인원 상한은 칸이라 NULL 인 줄만 채우고, 기본값 규칙은 없을 때만 넣는다.
 * 가격 표에 줄이 있어도 상한과 규칙은 본다. 둘은 다른 표의 칸이라서다.
 */
async function seedCrystalPrices(db: Db, seed: CrystalPricesSeed): Promise<SeedOutcome> {
  const pairs = await pairIds(db)
  await db.transaction(async (tx) => {
    for (const m of seed.maxPartySizes) {
      const pair = must(pairs, `${m.boss}/${m.difficulty}`, '보스 난이도')
      await tx
        .update(bossDifficulties)
        .set({ maxPartySize: m.maxPartySize })
        .where(and(eq(bossDifficulties.id, pair), isNull(bossDifficulties.maxPartySize)))
    }
    await tx
      .insert(gameRules)
      .values({
        key: 'default_max_party_size',
        value: seed.defaultMaxPartySize,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: gameRules.key })
  })
  if (!(await isEmpty(db, bossCrystalPrices))) return 'skipped'
  await db.transaction(async (tx) => {
    await tx.insert(bossCrystalPrices).values(
      seed.prices.map((p) => ({
        bossDifficultyId: must(pairs, `${p.boss}/${p.difficulty}`, '보스 난이도'),
        priceMeso: p.priceMeso,
        from: p.from,
        until: p.until,
      })),
    )
    await touchSection(tx, 'crystalPrices')
  })
  return 'seeded'
}

/** 갈래와 아이템 종류는 표마다 비어 있을 때만 채운다. 지출 목록의 묶음이 갈래를 가리켜 먼저 돈다. */
async function seedCashbookCategories(db: Db, seed: CashbookCategoriesSeed): Promise<SeedOutcome> {
  const [noCategories, noKinds] = await Promise.all([
    isEmpty(db, cashbookCategories),
    isEmpty(db, cashbookItemKinds),
  ])
  if (!noCategories && !noKinds) return 'skipped'
  await db.transaction(async (tx) => {
    if (noCategories) {
      const counters = new Map<string, number>()
      await tx.insert(cashbookCategories).values(
        seed.categories.map((c) => {
          const sortOrder = counters.get(c.entryType) ?? 0
          counters.set(c.entryType, sortOrder + 1)
          return { ...c, sortOrder }
        }),
      )
    }
    if (noKinds)
      await tx
        .insert(cashbookItemKinds)
        .values(seed.itemKinds.map((k, sortOrder) => ({ ...k, sortOrder })))
    await touchSection(tx, 'cashbookCategories')
  })
  return 'seeded'
}

/**
 * 규칙 둘은 없을 때만 넣고 늘 본다. 표 셋(묶음 · 타일 · 항목)은 전부 비어 있을 때만 채운다. 하나라도 줄이 있으면
 * 운영자가 손댄 것이라 건너뛴다.
 */
async function seedSpendCatalog(db: Db, seed: SpendCatalogSeed): Promise<SeedOutcome> {
  await db.transaction(async (tx) => {
    for (const field of Object.keys(SPEND_RULE_KEYS) as SpendRuleField[]) {
      await tx
        .insert(gameRules)
        .values({ key: SPEND_RULE_KEYS[field], value: seed.rules[field], updatedAt: new Date() })
        .onConflictDoNothing({ target: gameRules.key })
    }
  })
  const empties = await Promise.all([
    isEmpty(db, spendGroups),
    isEmpty(db, spendTiles),
    isEmpty(db, spendItems),
  ])
  if (!empties.every(Boolean)) return 'skipped'
  await db.transaction(async (tx) => {
    if (await isEmpty(tx, spendForms))
      await tx.insert(spendForms).values(seed.forms.map((f, sortOrder) => ({ ...f, sortOrder })))
    const formRows = await tx.select({ id: spendForms.id, key: spendForms.key }).from(spendForms)
    const formIds = new Map<string, string>(formRows.map((r) => [r.key, r.id]))
    const categoryRows = await tx
      .select({ id: cashbookCategories.id, key: cashbookCategories.key })
      .from(cashbookCategories)
      .where(eq(cashbookCategories.entryType, 'spend'))
    const categoryIds = new Map(categoryRows.map((r) => [r.key, r.id]))
    const groupRows = await tx
      .insert(spendGroups)
      .values(
        seed.groups.map((g, sortOrder) => ({
          key: g.key,
          name: g.name,
          categoryId: must(categoryIds, g.category, '지출 갈래 줄'),
          cardTitle: g.cardTitle,
          active: g.active,
          sortOrder,
        })),
      )
      .returning({ id: spendGroups.id, key: spendGroups.key })
    const tileRows = await tx
      .insert(spendTiles)
      .values(seed.tiles)
      .returning({ id: spendTiles.id, key: spendTiles.key })
    const groupIds = new Map(groupRows.map((r) => [r.key, r.id]))
    const tileIds = new Map(tileRows.map((r) => [r.key, r.id]))
    const counters = new Map<string, number>()
    const itemRows = await tx
      .insert(spendItems)
      .values(
        seed.items.map((i) => {
          const groupId = must(groupIds, i.group, '묶음')
          const sortOrder = counters.get(groupId) ?? 0
          counters.set(groupId, sortOrder + 1)
          return {
            key: i.key,
            groupId,
            tileId: must(tileIds, i.tile, '타일'),
            name: i.name,
            shortName: i.shortName,
            tier: i.tier,
            currency: i.currency,
            unitPrice: i.unitPrice,
            unit: i.unit,
            maxQuantity: i.maxQuantity,
            rewardCoins: i.rewardCoins,
            from: i.from,
            until: i.until,
            sortOrder,
          }
        }),
      )
      .returning({ id: spendItems.id, key: spendItems.key })
    const itemIds = new Map(itemRows.map((r) => [r.key, r.id]))
    if (seed.itemOptions.length > 0)
      await tx.insert(spendItemOptions).values(
        seed.itemOptions.map((o) => ({
          itemId: must(itemIds, o.item, '항목'),
          axis: o.axis,
          value: o.value,
        })),
      )
    if (seed.itemForms.length > 0)
      await tx.insert(spendItemForms).values(
        seed.itemForms.map((f) => ({
          itemId: must(itemIds, f.item, '항목'),
          formId: must(formIds, f.form, '형태 줄'),
        })),
      )
    await touchSection(tx, 'spendCatalog')
  })
  return 'seeded'
}

/** 묶음 표가 비어 있을 때만 셋을 채운다. */
async function seedSymbolCosts(db: Db, seed: SymbolCostsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, symbolGroups))) return 'skipped'
  await db.transaction(async (tx) => {
    const groupRows = await tx
      .insert(symbolGroups)
      .values(seed.groups.map((g, sortOrder) => ({ ...g, sortOrder })))
      .returning({ id: symbolGroups.id, key: symbolGroups.key })
    const groupIds = new Map(groupRows.map((r) => [r.key, r.id]))
    const counters = new Map<string, number>()
    const symbolRows = await tx
      .insert(symbols)
      .values(
        seed.symbols.map((s) => {
          const groupId = must(groupIds, s.group, '심볼 묶음')
          const sortOrder = counters.get(groupId) ?? 0
          counters.set(groupId, sortOrder + 1)
          return {
            key: s.key,
            groupId,
            name: s.name,
            requiredLevel: s.requiredLevel,
            iconFile: s.iconFile,
            sortOrder,
          }
        }),
      )
      .returning({ id: symbols.id, key: symbols.key })
    const symbolIds = new Map(symbolRows.map((r) => [r.key, r.id]))
    await tx.insert(symbolLevelCosts).values(
      seed.levelCosts.map((c) => ({
        symbolId: must(symbolIds, c.symbol, '심볼'),
        level: c.level,
        costMeso: c.costMeso,
        from: c.from,
        until: c.until,
      })),
    )
    await touchSection(tx, 'symbolCosts')
  })
  return 'seeded'
}

/**
 * 갈래 표가 비어 있을 때만 둘을 함께 채운다. 갈래 줄은 ENUM 과 일대일이라 씨앗이 여덟을 다 들어야 한다. 빠지면 그 갈래의
 * 컨텐츠를 관리 화면에서 영영 못 더하므로 채우지 않고 던진다.
 */
async function seedContents(db: Db, seed: ContentsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, contentCategories))) return 'skipped'
  const missing = CONTENT_CATEGORIES.filter((c) => !seed.categories.some((s) => s.key === c))
  if (missing.length > 0) throw new Error(`씨앗의 갈래가 ENUM 을 다 안 든다: ${missing.join(', ')}`)
  await db.transaction(async (tx) => {
    const categoryRows = await tx
      .insert(contentCategories)
      .values(seed.categories.map((c, sortOrder) => ({ ...c, sortOrder })))
      .returning({ id: contentCategories.id, key: contentCategories.key })
    const categoryIds = new Map(categoryRows.map((r) => [r.key, r.id]))
    const counters = new Map<string, number>()
    await tx.insert(contents).values(
      seed.contents.map(({ category, ...c }) => {
        const sortOrder = counters.get(c.section) ?? 0
        counters.set(c.section, sortOrder + 1)
        return { ...c, categoryId: must(categoryIds, category, '갈래'), sortOrder }
      }),
    )
    await touchSection(tx, 'contents')
  })
  return 'seeded'
}

async function seedEquipmentItems(db: Db, seed: EquipmentItemsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, equipmentItems))) return 'skipped'
  await db.transaction(async (tx) => {
    await tx.insert(equipmentItems).values(seed.items)
    await touchSection(tx, 'equipmentItems')
  })
  return 'seeded'
}

/** 규칙 셋은 없을 때만 넣고 늘 본다. 표 셋은 전부 비어 있을 때만 채운다. 잠재는 종류마다 min_level 1 이 있어야 한다. */
async function seedEnhancementCosts(db: Db, seed: EnhancementCostsSeed): Promise<SeedOutcome> {
  await db.transaction(async (tx) => {
    for (const field of Object.keys(ENHANCEMENT_RULE_KEYS) as EnhancementRuleField[]) {
      await tx
        .insert(gameRules)
        .values({
          key: ENHANCEMENT_RULE_KEYS[field],
          value: seed.rules[field],
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: gameRules.key })
    }
  })
  const empties = await Promise.all([
    isEmpty(db, potentialResetCosts),
    isEmpty(db, soulPotentialResetCosts),
    isEmpty(db, starforceSteps),
  ])
  if (!empties.every(Boolean)) return 'skipped'
  const noBase = POTENTIAL_RESET_TYPES.filter(
    (type) => !seed.potentialResetCosts.some((c) => c.type === type && c.minLevel === 1),
  )
  if (noBase.length > 0)
    throw new Error(`잠재 재설정 씨앗에 min_level 1 구간이 없다: ${noBase.join(', ')}`)
  await db.transaction(async (tx) => {
    await tx.insert(potentialResetCosts).values(seed.potentialResetCosts)
    await tx.insert(soulPotentialResetCosts).values(seed.soulPotentialResetCosts)
    await tx.insert(starforceSteps).values(seed.starforceSteps)
    await touchSection(tx, 'enhancementCosts')
  })
  return 'seeded'
}

/** 등급 표가 비어 있을 때만 채운다. 줄은 ENUM 과 일대일이라 씨앗이 일곱을 다 들어야 한다. */
async function seedMvpGrades(db: Db, seed: MvpGradesSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, mvpGrades))) return 'skipped'
  const missing = MVP_GRADES.filter((g) => !seed.grades.some((s) => s.key === g))
  if (missing.length > 0)
    throw new Error(`씨앗의 MVP 등급이 ENUM 을 다 안 든다: ${missing.join(', ')}`)
  await db.transaction(async (tx) => {
    await tx.insert(mvpGrades).values(seed.grades.map((g, sortOrder) => ({ ...g, sortOrder })))
    await touchSection(tx, 'mvpGrades')
  })
  return 'seeded'
}

/**
 * 지역 표가 비어 있을 때만 셋을 함께 채운다. 사냥터 key 는 지역 key 로 시작해야 하고 레벨이 없는 사냥터는 못 넣는다. 둘 다
 * 관리 화면의 쓰기 검사와 같은 규칙이라 씨앗도 지킨다.
 */
async function seedHuntingGrounds(db: Db, seed: HuntingGroundsSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, huntingRegions))) return 'skipped'
  const badKey = seed.grounds.find((g) => !g.key.startsWith(`${g.region}_`))
  if (badKey !== undefined)
    throw new Error(`사냥터 key 가 지역 key 로 시작하지 않는다: ${badKey.key}`)
  const withLevel = new Set(seed.groundLevels.map((l) => l.ground))
  const noLevel = seed.grounds.filter((g) => !withLevel.has(g.key))
  if (noLevel.length > 0)
    throw new Error(`레벨이 없는 사냥터가 있다: ${noLevel.map((g) => g.key).join(', ')}`)
  await db.transaction(async (tx) => {
    const regionRows = await tx
      .insert(huntingRegions)
      .values(seed.regions.map((r, sortOrder) => ({ ...r, sortOrder })))
      .returning({ id: huntingRegions.id, key: huntingRegions.key })
    const regionIds = new Map(regionRows.map((r) => [r.key, r.id]))
    const counters = new Map<string, number>()
    const groundRows = await tx
      .insert(huntingGrounds)
      .values(
        seed.grounds.map((g) => {
          const regionId = must(regionIds, g.region, '지역')
          const sortOrder = counters.get(regionId) ?? 0
          counters.set(regionId, sortOrder + 1)
          return { key: g.key, regionId, name: g.name, force: g.force, mobs: g.mobs, sortOrder }
        }),
      )
      .returning({ id: huntingGrounds.id, key: huntingGrounds.key })
    const groundIds = new Map(groundRows.map((r) => [r.key, r.id]))
    await tx.insert(huntingGroundLevels).values(
      seed.groundLevels.map((l) => ({
        groundId: must(groundIds, l.ground, '사냥터'),
        level: l.level,
      })),
    )
    await touchSection(tx, 'huntingGrounds')
  })
  return 'seeded'
}

async function seedHuntLoot(db: Db, seed: HuntLootSeed): Promise<SeedOutcome> {
  if (!(await isEmpty(db, huntLootItems))) return 'skipped'
  await db.transaction(async (tx) => {
    await tx.insert(huntLootItems).values(seed.items.map((i, sortOrder) => ({ ...i, sortOrder })))
    await touchSection(tx, 'huntLoot')
  })
  return 'seeded'
}

async function seedBosses(db: Db, seed: BossesSeed): Promise<SeedOutcome> {
  const repo = new BossesRepository(db)
  if ((await repo.options()).length > 0) return 'skipped'
  await repo.setRules(seed.rules)
  for (const boss of seed.bosses) await repo.createBoss(boss)
  return 'seeded'
}

function readSeed(name: string): unknown {
  return JSON.parse(readFileSync(join(SEED_FOLDER, `${name}.json`), 'utf8'))
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') throw new Error('DATABASE_URL 이 없다')
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5_000 })
  try {
    const db = drizzle(pool, { schema })
    const result = await seedGameData(db, {
      bosses: parseBossesSeed(readSeed('bosses')),
      dropItems: parseDropItemsSeed(readSeed('drop-items')),
      bossDrops: parseBossDropsSeed(readSeed('boss-drops')),
      dropBoxes: parseDropBoxesSeed(readSeed('drop-boxes')),
      crystalPrices: parseCrystalPricesSeed(readSeed('crystal-prices')),
      worlds: parseWorldsSeed(readSeed('worlds')),
      cashbookCategories: parseCashbookCategoriesSeed(readSeed('cashbook-categories')),
      spendCatalog: parseSpendCatalogSeed(readSeed('spend-catalog')),
      symbolCosts: parseSymbolCostsSeed(readSeed('symbol-costs')),
      contents: parseContentsSeed(readSeed('contents')),
      equipmentItems: parseEquipmentItemsSeed(readSeed('equipment-items')),
      enhancementCosts: parseEnhancementCostsSeed(readSeed('enhancement-costs')),
      mvpGrades: parseMvpGradesSeed(readSeed('mvp-grades')),
      huntingGrounds: parseHuntingGroundsSeed(readSeed('hunting-grounds')),
      huntLoot: parseHuntLootSeed(readSeed('hunt-loot')),
    })
    for (const [table, outcome] of Object.entries(result)) {
      console.log(`${table}: ${outcome === 'seeded' ? '채웠다' : '줄이 있어 건너뛰었다'}`)
    }
  } finally {
    await pool.end()
  }
}

if (
  process.argv[1]?.endsWith('seed-game-data.js') ||
  process.argv[1]?.endsWith('seed-game-data.ts')
) {
  main().catch((error: unknown) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
