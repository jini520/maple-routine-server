/**
 * 게임 데이터 표의 첫 채움. `node dist/cli/seed-game-data.js`
 *
 * `src/database/seed/<표>.json` 을 읽어 **비어 있는 표만** 채운다. 줄이 하나라도 있는 표는 건너뛴다.
 * 운영자가 관리 화면 폼으로 고친 값을 배포 때 씨앗이 되돌리면 안 되기 때문이다. 씨앗 파일은 앱 번들
 * JSON 과 같은 모양이고 `updatedAt` 은 있어도 버린다. 서버가 넣는 시각이 기준이다.
 *
 * 차례가 있다. 보스 → 드롭 아이템 → 드롭 표 · 상자 · 결정석 가격. 뒤의 것이 앞의 줄을 가리킨다.
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
import { touchSection } from '../modules/game-data/sections'

const {
  bossCrystalPrices,
  bossDifficulties,
  bossDropRewards,
  bosses,
  dropBoxContents,
  dropBoxes,
  dropItems,
  gameRules,
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

export interface GameDataSeeds {
  bosses?: BossesSeed
  dropItems?: DropItemsSeed
  bossDrops?: BossDropsSeed
  dropBoxes?: DropBoxesSeed
  crystalPrices?: CrystalPricesSeed
  worlds?: WorldsSeed
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
  db: Db,
  table:
    | typeof dropItems
    | typeof bossDropRewards
    | typeof dropBoxes
    | typeof bossCrystalPrices
    | typeof worlds,
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
