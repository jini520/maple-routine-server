import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { worlds } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface WorldView {
  key: string
  name: string
  emblem: string | null
  challengers: boolean
  event: boolean
}

/** GET /v1/game-data 의 worlds 칸. 차례가 곧 앱의 월드 차례다. */
export interface WorldsSection {
  updatedAt: string | null
  worlds: WorldView[]
}

export type WorldInput = WorldView

export class WorldExists extends Error {}

/** 월드는 더하고 고치고 옮기기만 있다. 기록이 key 를 들어 지우지 않는다. */
@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<WorldsSection> {
    const rows = await this.db.select().from(worlds).orderBy(asc(worlds.sortOrder), asc(worlds.key))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'worlds'),
      worlds: rows.map((r) => ({
        key: r.key,
        name: r.name,
        emblem: r.emblem,
        challengers: r.challengers,
        event: r.event,
      })),
    }
  }

  /** 맨 뒤에 더한다. 같은 key 는 WorldExists 다. */
  async create(input: WorldInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${worlds.sortOrder})` })
        .from(worlds)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(worlds)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: worlds.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new WorldExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'worlds')
      return row
    })
  }

  /** 이름 · 엠블럼 · 챌린저스 · 이벤트를 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 false 다. */
  async update(key: string, input: Omit<WorldInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(worlds)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(worlds.key, key))
        .returning({ id: worlds.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'worlds')
      return true
    })
  }

  /** 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async move(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: worlds.id, key: worlds.key, sortOrder: worlds.sortOrder })
        .from(worlds)
        .orderBy(asc(worlds.sortOrder), asc(worlds.key))
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) return false
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx.update(worlds).set({ sortOrder: other.sortOrder }).where(eq(worlds.id, mine.id))
      await tx.update(worlds).set({ sortOrder: mine.sortOrder }).where(eq(worlds.id, other.id))
      await touchSection(tx, 'worlds')
      return true
    })
  }
}
