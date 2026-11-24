import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'

import { isForeignKeyViolation, isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bossDifficultyRewards, bosses, items } from '../../database/schema'
import type { DifficultyInput } from '../bosses/bosses.dto'
import { assertSingleDropBox } from './drop-box-rules'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

export type DropCategory = 'fixed' | 'equipment' | 'consumable'
export type Difficulty = DifficultyInput['difficulty']

/** 드롭 표 한 줄. 납작하다. 보스 · 난이도 · 분류로 묶는 것은 앱이다. */
export interface BossDifficultyRewardView {
  bossDifficultyId: string
  category: DropCategory
  itemId: string
  quantity: number | null
  validFrom: string | null
  validUntil: string | null
}

/** GET /v1/game-data 의 bossDrops 칸. 배열의 차례가 드롭 시트의 타일 차례다. */
export interface BossDropsSection {
  updatedAt: string | null
  bossDifficultyRewards: BossDifficultyRewardView[]
}

/** 관리 화면이 보는 줄. 보스 · 난이도 · 아이템은 key 로 보이고 id 로 고치고 지운다. */
export interface BossDropAdminRow {
  id: string
  boss: string
  difficulty: Difficulty
  category: DropCategory
  item: string
  itemName: string
  quantity: number | null
  validFrom: string | null
  validUntil: string | null
  sortOrder: number
}

export interface BossDropInput {
  boss: string
  difficulty: Difficulty
  category: DropCategory
  item: string
  quantity: number | null
  validFrom: string | null
  validUntil: string | null
}

export class NoBossDifficulty extends Error {}
export class NoDropItem extends Error {}
/** 같은 조합 · 아이템 · 시작의 줄이 이미 있다. 분류가 달라도 같은 줄이다. */
export class RewardExists extends Error {}

@Injectable()
export class BossDropsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<BossDropsSection> {
    const rows = await this.joined()
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'bossDrops'),
      bossDifficultyRewards: rows.map((r) => ({
        bossDifficultyId: r.bossDifficultyId,
        category: r.category,
        itemId: r.itemId,
        quantity: r.quantity,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
      })),
    }
  }

  /** 한 조합의 줄. 분류 ENUM 순, 그 안은 sort_order 순이다. */
  async rows(boss: string, difficulty: Difficulty): Promise<BossDropAdminRow[]> {
    const rows = await this.joined(
      and(eq(bosses.key, boss), eq(bossDifficulties.difficulty, difficulty)),
    )
    return rows.map((r) => ({
      id: r.id,
      boss: r.boss,
      difficulty: r.difficulty,
      category: r.category,
      item: r.item,
      itemName: r.itemName,
      quantity: r.quantity,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      sortOrder: r.sortOrder,
    }))
  }

  /** 그 조합 · 분류의 맨 뒤에 더한다. 그 난이도의 상자가 하나로 정해지지 않으면 AmbiguousDropBox 이고 적지 않는다. */
  async create(input: BossDropInput): Promise<{ id: string }> {
    const pair = await this.pairId(input.boss, input.difficulty)
    if (pair === null) throw new NoBossDifficulty(`${input.boss}/${input.difficulty}`)
    const item = await this.itemId(input.item)
    if (item === null) throw new NoDropItem(input.item)
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${bossDifficultyRewards.sortOrder})` })
        .from(bossDifficultyRewards)
        .where(
          and(
            eq(bossDifficultyRewards.bossDifficultyId, pair),
            eq(bossDifficultyRewards.category, input.category),
          ),
        )
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(bossDifficultyRewards)
          .values({
            bossDifficultyId: pair,
            category: input.category,
            itemId: item,
            quantity: input.quantity,
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: bossDifficultyRewards.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RewardExists(input.item)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await assertSingleDropBox(tx, [pair])
      await touchSection(tx, 'bossDrops')
      return row
    })
  }

  /** 개수 · 기간을 갈아 끼운다. 없으면 false 다. 시작을 바꿔 같은 줄이 생기면 RewardExists 다. */
  async update(
    id: string,
    patch: { quantity: number | null; validFrom: string | null; validUntil: string | null },
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let rows: { id: string }[]
      try {
        rows = await tx
          .update(bossDifficultyRewards)
          .set(patch)
          .where(eq(bossDifficultyRewards.id, id))
          .returning({ id: bossDifficultyRewards.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RewardExists(id)
        throw error
      }
      if (rows.length === 0) return false
      await touchSection(tx, 'bossDrops')
      return true
    })
  }

  /** 같은 조합 · 분류 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 없으면 false 다. */
  async move(id: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx
        .select()
        .from(bossDifficultyRewards)
        .where(eq(bossDifficultyRewards.id, id))
      if (mine === undefined) return false
      const siblings = await tx
        .select({ id: bossDifficultyRewards.id, sortOrder: bossDifficultyRewards.sortOrder })
        .from(bossDifficultyRewards)
        .where(
          and(
            eq(bossDifficultyRewards.bossDifficultyId, mine.bossDifficultyId),
            eq(bossDifficultyRewards.category, mine.category),
          ),
        )
        .orderBy(asc(bossDifficultyRewards.sortOrder))
      const at = siblings.findIndex((r) => r.id === id)
      const other = siblings[direction === 'up' ? at - 1 : at + 1]
      if (other === undefined) return true
      await tx
        .update(bossDifficultyRewards)
        .set({ sortOrder: other.sortOrder })
        .where(eq(bossDifficultyRewards.id, mine.id))
      await tx
        .update(bossDifficultyRewards)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(bossDifficultyRewards.id, other.id))
      await touchSection(tx, 'bossDrops')
      return true
    })
  }

  /** 조합 · 분류 · 줄 차례로. 보스는 sort_order, 난이도와 분류는 ENUM 순이다. */
  private async joined(where?: ReturnType<typeof and>) {
    return this.db
      .select({
        id: bossDifficultyRewards.id,
        boss: bosses.key,
        difficulty: bossDifficulties.difficulty,
        bossDifficultyId: bossDifficultyRewards.bossDifficultyId,
        category: bossDifficultyRewards.category,
        itemId: bossDifficultyRewards.itemId,
        item: items.key,
        itemName: items.name,
        quantity: bossDifficultyRewards.quantity,
        validFrom: bossDifficultyRewards.validFrom,
        validUntil: bossDifficultyRewards.validUntil,
        sortOrder: bossDifficultyRewards.sortOrder,
      })
      .from(bossDifficultyRewards)
      .innerJoin(bossDifficulties, eq(bossDifficultyRewards.bossDifficultyId, bossDifficulties.id))
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .innerJoin(items, eq(bossDifficultyRewards.itemId, items.id))
      .where(where)
      .orderBy(
        asc(bosses.sortOrder),
        asc(bossDifficulties.difficulty),
        asc(bossDifficultyRewards.category),
        asc(bossDifficultyRewards.sortOrder),
      )
  }

  private async pairId(boss: string, difficulty: Difficulty): Promise<string | null> {
    const [row] = await this.db
      .select({ id: bossDifficulties.id })
      .from(bossDifficulties)
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .where(and(eq(bosses.key, boss), eq(bossDifficulties.difficulty, difficulty)))
    return row?.id ?? null
  }

  private async itemId(key: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.key, key), eq(items.isDrop, true)))
    return row?.id ?? null
  }
}

export { isForeignKeyViolation }
