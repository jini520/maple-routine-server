import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { mvpGrades } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 앱 MvpGradeKey 그대로. 낮은 등급부터. */
export const MVP_GRADES = ['normal', 'bronze', 'silver', 'gold', 'diamond', 'red', 'black'] as const
export type MvpGrade = (typeof MVP_GRADES)[number]

export interface MvpGradeView {
  key: MvpGrade
  name: string
  auctionFeePercent: number
  starforceDiscountPercent: number
}

/** GET /v1/game-data 의 mvpGrades 칸. 차례가 등급의 높낮이다. */
export interface MvpGradesSection {
  updatedAt: string | null
  grades: MvpGradeView[]
}

export type MvpGradeInput = Omit<MvpGradeView, 'key'>

/** 등급은 고치고 옮기기만 있다. ENUM 과 일대일이라 더하고 지우는 것은 마이그레이션이다. */
@Injectable()
export class MvpGradesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<MvpGradesSection> {
    const rows = await this.db
      .select()
      .from(mvpGrades)
      .orderBy(asc(mvpGrades.sortOrder), asc(mvpGrades.key))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'mvpGrades'),
      grades: rows.map((g) => ({
        key: g.key,
        name: g.name,
        auctionFeePercent: g.auctionFeePercent,
        starforceDiscountPercent: g.starforceDiscountPercent,
      })),
    }
  }

  /** 이름 · 퍼센트 둘을 갈아 끼운다. 모르면 false 다. */
  async update(key: MvpGrade, input: MvpGradeInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(mvpGrades)
        .set({
          name: input.name,
          auctionFeePercent: input.auctionFeePercent,
          starforceDiscountPercent: input.starforceDiscountPercent,
        })
        .where(eq(mvpGrades.key, key))
        .returning({ id: mvpGrades.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'mvpGrades')
      return true
    })
  }

  /** 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async move(key: MvpGrade, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: mvpGrades.id, key: mvpGrades.key, sortOrder: mvpGrades.sortOrder })
        .from(mvpGrades)
        .orderBy(asc(mvpGrades.sortOrder), asc(mvpGrades.key))
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) return false
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx
        .update(mvpGrades)
        .set({ sortOrder: other.sortOrder })
        .where(eq(mvpGrades.id, mine.id))
      await tx
        .update(mvpGrades)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(mvpGrades.id, other.id))
      await touchSection(tx, 'mvpGrades')
      return true
    })
  }
}
