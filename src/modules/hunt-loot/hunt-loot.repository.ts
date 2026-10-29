import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isCheckViolation, isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { huntLootItems } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 앱 HuntLootKind 그대로. 조각 · 소비 · 이벤트. */
export const HUNT_LOOT_KINDS = ['fragment', 'consumable', 'event'] as const
export type HuntLootKind = (typeof HUNT_LOOT_KINDS)[number]

export interface HuntLootView {
  key: string
  kind: HuntLootKind
  name: string
  iconFile: string
  npcPriceMeso: number | null
  from: string | null
  until: string | null
}

/** GET /v1/game-data 의 huntLoot 칸. 차례가 폼의 차례다. */
export interface HuntLootSection {
  updatedAt: string | null
  items: HuntLootView[]
}

export type HuntLootInput = HuntLootView
export type HuntLootUpdate = Omit<HuntLootView, 'key' | 'kind'>

export class HuntLootExists extends Error {}
/** NPC 가격이 분류와 안 맞는다. 소비에만 있고 소비에는 반드시 있다. */
export class HuntLootPriceShape extends Error {}

/** 더하고 고치고 옮기기만 있다. 기록이 key 를 들어 지우지 않고, 분류는 기록의 폼을 정해 못 바꾼다. */
@Injectable()
export class HuntLootRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<HuntLootSection> {
    const [items, updatedAt] = await Promise.all([
      this.db
        .select({
          key: huntLootItems.key,
          kind: huntLootItems.kind,
          name: huntLootItems.name,
          iconFile: huntLootItems.iconFile,
          npcPriceMeso: huntLootItems.npcPriceMeso,
          from: huntLootItems.from,
          until: huntLootItems.until,
        })
        .from(huntLootItems)
        .orderBy(asc(huntLootItems.sortOrder), asc(huntLootItems.key)),
      sectionUpdatedAt(this.db, 'huntLoot'),
    ])
    return { updatedAt, items }
  }

  /** 맨 뒤에 더한다. 같은 key 는 HuntLootExists, 가격이 분류와 안 맞으면 HuntLootPriceShape 다. */
  async create(input: HuntLootInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${huntLootItems.sortOrder})` })
        .from(huntLootItems)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(huntLootItems)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: huntLootItems.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HuntLootExists(input.key)
        if (isCheckViolation(error)) throw new HuntLootPriceShape(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'huntLoot')
      return row
    })
  }

  /** 이름 · 그림 · NPC 가격 · 기간을 갈아 끼운다. 모르면 false 다. 가격이 분류와 안 맞으면 HuntLootPriceShape 다. */
  async update(key: string, input: HuntLootUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let rows: { id: string }[]
      try {
        rows = await tx
          .update(huntLootItems)
          .set({
            name: input.name,
            iconFile: input.iconFile,
            npcPriceMeso: input.npcPriceMeso,
            from: input.from,
            until: input.until,
          })
          .where(eq(huntLootItems.key, key))
          .returning({ id: huntLootItems.id })
      } catch (error) {
        if (isCheckViolation(error)) throw new HuntLootPriceShape(key)
        throw error
      }
      if (rows.length === 0) return false
      await touchSection(tx, 'huntLoot')
      return true
    })
  }

  /** 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async move(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: huntLootItems.id,
          key: huntLootItems.key,
          sortOrder: huntLootItems.sortOrder,
        })
        .from(huntLootItems)
        .orderBy(asc(huntLootItems.sortOrder), asc(huntLootItems.key))
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) return false
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx
        .update(huntLootItems)
        .set({ sortOrder: other.sortOrder })
        .where(eq(huntLootItems.id, mine.id))
      await tx
        .update(huntLootItems)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(huntLootItems.id, other.id))
      await touchSection(tx, 'huntLoot')
      return true
    })
  }
}
