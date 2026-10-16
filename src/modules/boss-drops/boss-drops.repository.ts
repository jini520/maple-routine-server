import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'

import { isForeignKeyViolation, isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bossDropRewards, bosses, dropItems } from '../../database/schema'
import type { DifficultyInput } from '../bosses/bosses.dto'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

export type DropCategory = 'fixed' | 'equipment' | 'consumable'
export type Difficulty = DifficultyInput['difficulty']

/** 드롭 표 한 줄. 납작하다. 보스 · 난이도 · 갈래로 묶는 것은 앱이다. */
export interface BossDropRewardView {
  boss: string
  difficulty: Difficulty
  category: DropCategory
  item: string
  amount: string | null
  from: string | null
  until: string | null
}

/** GET /v1/game-data 의 bossDrops 칸. */
export interface BossDropsSection {
  updatedAt: string | null
  rewards: BossDropRewardView[]
}

/** 관리 화면이 보는 줄. id 로 고치고 지운다. */
export interface BossDropAdminRow extends BossDropRewardView {
  id: string
  itemName: string
  sortOrder: number
}

export interface BossDropInput {
  boss: string
  difficulty: Difficulty
  category: DropCategory
  item: string
  amount: string | null
  from: string | null
  until: string | null
}

export class NoBossDifficulty extends Error {}
export class NoDropItem extends Error {}
/** 같은 조합 · 갈래 · 아이템 · 시작의 줄이 이미 있다. */
export class RewardExists extends Error {}

@Injectable()
export class BossDropsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<BossDropsSection> {
    const rows = await this.joined()
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'bossDrops'),
      rewards: rows.map((r) => ({
        boss: r.boss,
        difficulty: r.difficulty,
        category: r.category,
        item: r.item,
        amount: r.amount,
        from: r.from,
        until: r.until,
      })),
    }
  }

  /** 한 조합의 줄. 갈래 ENUM 순, 그 안은 sort_order 순이다. */
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
      amount: r.amount,
      from: r.from,
      until: r.until,
      sortOrder: r.sortOrder,
    }))
  }

  /** 그 조합 · 갈래의 맨 뒤에 더한다. */
  async create(input: BossDropInput): Promise<{ id: string }> {
    const pair = await this.pairId(input.boss, input.difficulty)
    if (pair === null) throw new NoBossDifficulty(`${input.boss}/${input.difficulty}`)
    const item = await this.itemId(input.item)
    if (item === null) throw new NoDropItem(input.item)
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${bossDropRewards.sortOrder})` })
        .from(bossDropRewards)
        .where(
          and(
            eq(bossDropRewards.bossDifficultyId, pair),
            eq(bossDropRewards.category, input.category),
          ),
        )
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(bossDropRewards)
          .values({
            bossDifficultyId: pair,
            category: input.category,
            itemId: item,
            amount: input.amount,
            from: input.from,
            until: input.until,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: bossDropRewards.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RewardExists(input.item)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'bossDrops')
      return row
    })
  }

  /** 수량 · 기간을 갈아 끼운다. 없으면 false 다. 시작을 바꿔 같은 줄이 생기면 RewardExists 다. */
  async update(
    id: string,
    patch: { amount: string | null; from: string | null; until: string | null },
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let rows: { id: string }[]
      try {
        rows = await tx
          .update(bossDropRewards)
          .set(patch)
          .where(eq(bossDropRewards.id, id))
          .returning({ id: bossDropRewards.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RewardExists(id)
        throw error
      }
      if (rows.length === 0) return false
      await touchSection(tx, 'bossDrops')
      return true
    })
  }

  async remove(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(bossDropRewards)
        .where(eq(bossDropRewards.id, id))
        .returning({ id: bossDropRewards.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'bossDrops')
      return true
    })
  }

  /** 같은 조합 · 갈래 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 없으면 false 다. */
  async move(id: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx.select().from(bossDropRewards).where(eq(bossDropRewards.id, id))
      if (mine === undefined) return false
      const siblings = await tx
        .select({ id: bossDropRewards.id, sortOrder: bossDropRewards.sortOrder })
        .from(bossDropRewards)
        .where(
          and(
            eq(bossDropRewards.bossDifficultyId, mine.bossDifficultyId),
            eq(bossDropRewards.category, mine.category),
          ),
        )
        .orderBy(asc(bossDropRewards.sortOrder))
      const at = siblings.findIndex((r) => r.id === id)
      const other = siblings[direction === 'up' ? at - 1 : at + 1]
      if (other === undefined) return true
      await tx
        .update(bossDropRewards)
        .set({ sortOrder: other.sortOrder })
        .where(eq(bossDropRewards.id, mine.id))
      await tx
        .update(bossDropRewards)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(bossDropRewards.id, other.id))
      await touchSection(tx, 'bossDrops')
      return true
    })
  }

  /** 조합 · 갈래 · 줄 차례로. 보스는 sort_order, 난이도와 갈래는 ENUM 순이다. */
  private async joined(where?: ReturnType<typeof and>) {
    return this.db
      .select({
        id: bossDropRewards.id,
        boss: bosses.key,
        difficulty: bossDifficulties.difficulty,
        category: bossDropRewards.category,
        item: dropItems.key,
        itemName: dropItems.name,
        amount: bossDropRewards.amount,
        from: bossDropRewards.from,
        until: bossDropRewards.until,
        sortOrder: bossDropRewards.sortOrder,
      })
      .from(bossDropRewards)
      .innerJoin(bossDifficulties, eq(bossDropRewards.bossDifficultyId, bossDifficulties.id))
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .innerJoin(dropItems, eq(bossDropRewards.itemId, dropItems.id))
      .where(where)
      .orderBy(
        asc(bosses.sortOrder),
        asc(bossDifficulties.difficulty),
        asc(bossDropRewards.category),
        asc(bossDropRewards.sortOrder),
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
      .select({ id: dropItems.id })
      .from(dropItems)
      .where(eq(dropItems.key, key))
    return row?.id ?? null
  }
}

export { isForeignKeyViolation }
