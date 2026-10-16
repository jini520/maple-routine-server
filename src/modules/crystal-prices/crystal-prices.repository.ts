import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bossCrystalPrices, bossDifficulties, bosses } from '../../database/schema'
import type { DifficultyInput } from '../bosses/bosses.dto'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'
import { type BossCycle, isPeriodBoundary } from './period-boundary'

type Difficulty = DifficultyInput['difficulty']

export interface CrystalPriceView {
  boss: string
  difficulty: Difficulty
  priceMeso: number
  from: string | null
  until: string | null
}

/** GET /v1/game-data 의 crystalPrices 칸. 파티 인원 상한은 bosses 칸의 난이도 줄이 든다. */
export interface CrystalPricesSection {
  updatedAt: string | null
  prices: CrystalPriceView[]
}

/** 관리 화면의 한 조합. 보스 표의 난이도 줄 전부가 서고 가격이 없는 조합은 prices 가 빈다. */
export interface CrystalPriceAdminPair {
  boss: string
  bossName: string
  cycle: BossCycle
  difficulty: Difficulty
  maxPartySize: number | null
  prices: { id: string; priceMeso: number; from: string | null; until: string | null }[]
}

export class NoBossDifficulty extends Error {}
/** 시작이 그 보스의 기간 경계가 아니다. */
export class NotBoundary extends Error {}
/** 시작이 지금 가격의 시작보다 뒤가 아니다. 줄이 겹친다. */
export class NotAfterCurrent extends Error {}
/** 지금 가격 줄이 아니다. 지난 줄은 과거 기간이 읽어 못 지운다. */
export class NotLatest extends Error {}

@Injectable()
export class CrystalPricesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<CrystalPricesSection> {
    const rows = await this.db
      .select({
        boss: bosses.key,
        difficulty: bossDifficulties.difficulty,
        priceMeso: bossCrystalPrices.priceMeso,
        from: bossCrystalPrices.from,
        until: bossCrystalPrices.until,
      })
      .from(bossCrystalPrices)
      .innerJoin(bossDifficulties, eq(bossCrystalPrices.bossDifficultyId, bossDifficulties.id))
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .orderBy(
        asc(bosses.sortOrder),
        asc(bossDifficulties.difficulty),
        sql`${bossCrystalPrices.from} asc nulls first`,
      )
    return { updatedAt: await sectionUpdatedAt(this.db, 'crystalPrices'), prices: rows }
  }

  async pairs(): Promise<CrystalPriceAdminPair[]> {
    const pairs = await this.db
      .select({
        id: bossDifficulties.id,
        boss: bosses.key,
        bossName: bosses.name,
        cycle: bosses.cycle,
        difficulty: bossDifficulties.difficulty,
        maxPartySize: bossDifficulties.maxPartySize,
      })
      .from(bossDifficulties)
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .orderBy(asc(bosses.sortOrder), asc(bossDifficulties.difficulty))
    const prices = await this.db
      .select()
      .from(bossCrystalPrices)
      .orderBy(sql`${bossCrystalPrices.from} asc nulls first`)
    return pairs.map((p) => ({
      boss: p.boss,
      bossName: p.bossName,
      cycle: p.cycle,
      difficulty: p.difficulty,
      maxPartySize: p.maxPartySize,
      prices: prices
        .filter((r) => r.bossDifficultyId === p.id)
        .map((r) => ({ id: r.id, priceMeso: r.priceMeso, from: r.from, until: r.until })),
    }))
  }

  /**
   * 새 가격을 적는다. 지금 가격 줄이 있으면 그 줄의 until 을 새 시작으로 닫고 새 줄을 연다.
   *
   * 첫 줄은 from 이 없어도 된다(처음부터). 둘째부터는 시작이 있어야 하고, 그 보스의 기간 경계여야 하며, 지금 줄의
   * 시작보다 뒤여야 한다. 과거 기간이 옛 값을 계속 읽으므로 옛 줄은 안 건드린다.
   */
  async addPrice(
    boss: string,
    difficulty: Difficulty,
    input: { priceMeso: number; from: string | null },
  ): Promise<{ id: string }> {
    const pair = await this.pair(boss, difficulty)
    if (pair === null) throw new NoBossDifficulty(`${boss}/${difficulty}`)
    return this.db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(bossCrystalPrices)
        .where(
          and(eq(bossCrystalPrices.bossDifficultyId, pair.id), isNull(bossCrystalPrices.until)),
        )
      if (open !== undefined) {
        if (input.from === null) throw new NotAfterCurrent('지금 가격이 있어 시작이 있어야 한다')
        if (!isPeriodBoundary(input.from, pair.cycle)) throw new NotBoundary(input.from)
        if (open.from !== null && input.from <= open.from) throw new NotAfterCurrent(input.from)
        await tx
          .update(bossCrystalPrices)
          .set({ until: input.from })
          .where(eq(bossCrystalPrices.id, open.id))
      } else if (input.from !== null && !isPeriodBoundary(input.from, pair.cycle)) {
        throw new NotBoundary(input.from)
      }
      const [row] = await tx
        .insert(bossCrystalPrices)
        .values({
          bossDifficultyId: pair.id,
          priceMeso: input.priceMeso,
          from: input.from,
          until: null,
        })
        .returning({ id: bossCrystalPrices.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'crystalPrices')
      return row
    })
  }

  /** 지금 가격 줄을 거둔다. 바로 앞 줄이 다시 열린다. 없으면 false, 지난 줄이면 NotLatest 다. */
  async removeLatest(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(bossCrystalPrices).where(eq(bossCrystalPrices.id, id))
      if (row === undefined) return false
      if (row.until !== null) throw new NotLatest(id)
      await tx.delete(bossCrystalPrices).where(eq(bossCrystalPrices.id, id))
      if (row.from !== null) {
        await tx
          .update(bossCrystalPrices)
          .set({ until: null })
          .where(
            and(
              eq(bossCrystalPrices.bossDifficultyId, row.bossDifficultyId),
              eq(bossCrystalPrices.until, row.from),
            ),
          )
      }
      await touchSection(tx, 'crystalPrices')
      return true
    })
  }

  private async pair(
    boss: string,
    difficulty: Difficulty,
  ): Promise<{ id: string; cycle: BossCycle } | null> {
    const [row] = await this.db
      .select({ id: bossDifficulties.id, cycle: bosses.cycle })
      .from(bossDifficulties)
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .where(and(eq(bosses.key, boss), eq(bossDifficulties.difficulty, difficulty)))
    return row ?? null
  }
}
