import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isCheckViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, huntLootItems, items } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'
import { sameNameItem } from '../items/items'

/** 사냥 전리품의 종류. 조각 · 소비 · 이벤트. */
export const HUNT_LOOT_TYPES = ['fragment', 'consumable', 'event'] as const
export type HuntLootType = (typeof HUNT_LOOT_TYPES)[number]

/** 앱이 받는 줄. 이름 · 그림은 items 칸의 아이템 줄에 있다. */
export interface HuntLootItemView {
  itemId: string
  type: HuntLootType
  npcPriceMeso: number | null
  validFrom: string | null
  validUntil: string | null
}

/** GET /v1/game-data 의 huntLoot 칸. 차례가 폼의 차례다. */
export interface HuntLootSection {
  updatedAt: string | null
  huntLootItems: HuntLootItemView[]
}

/** 관리 화면의 줄. 아이템 key · 이름 · 그림을 함께 든다. */
export interface HuntLootAdminRow {
  key: string
  type: HuntLootType
  name: string
  iconAssetId: string
  npcPriceMeso: number | null
  validFrom: string | null
  validUntil: string | null
}

export type HuntLootInput = HuntLootAdminRow
export type HuntLootUpdate = Omit<HuntLootAdminRow, 'key' | 'type'>

export class HuntLootExists extends Error {}
/** NPC 가격이 종류와 안 맞는다. 소비에만 있고 소비에는 반드시 있다. */
export class HuntLootPriceShape extends Error {}
/** 비교 모양의 이름이 같은 아이템이 다른 key 로 있다. message 가 그 아이템의 key 다. */
export class HuntLootNameTaken extends Error {}

/**
 * 더하고 고치고 옮기기만 있다. 기록이 아이템 줄을 가리켜 지우지 않고, 종류는 기록의 폼을 정해 못 바꾼다. key · 이름 · 그림은
 * 아이템 표에 두고 이 표는 분류 · NPC 가격 · 기간 · 차례를 든다. 같은 key 의 아이템이 이미 있으면 그 줄을 가리킨다.
 */
@Injectable()
export class HuntLootRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<HuntLootSection> {
    const [rows, updatedAt] = await Promise.all([
      this.rows(),
      sectionUpdatedAt(this.db, 'huntLoot'),
    ])
    return {
      updatedAt,
      huntLootItems: rows.map((r) => ({
        itemId: r.itemId,
        type: r.type,
        npcPriceMeso: r.npcPriceMeso,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
      })),
    }
  }

  async adminRows(): Promise<{ updatedAt: string | null; items: HuntLootAdminRow[] }> {
    const [rows, updatedAt] = await Promise.all([
      this.rows(),
      sectionUpdatedAt(this.db, 'huntLoot'),
    ])
    return {
      updatedAt,
      items: rows.map((r) => ({
        key: r.key,
        type: r.type,
        name: r.name,
        iconAssetId: r.iconAssetId ?? '',
        npcPriceMeso: r.npcPriceMeso,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
      })),
    }
  }

  private async rows() {
    return this.db
      .select({
        itemId: huntLootItems.itemId,
        key: items.key,
        type: huntLootItems.type,
        name: items.name,
        iconAssetId: items.iconAssetId,
        npcPriceMeso: huntLootItems.npcPriceMeso,
        validFrom: huntLootItems.validFrom,
        validUntil: huntLootItems.validUntil,
      })
      .from(huntLootItems)
      .innerJoin(items, eq(items.id, huntLootItems.itemId))
      .orderBy(asc(huntLootItems.sortOrder), asc(items.key))
  }

  /**
   * 맨 뒤에 더한다. 같은 key 의 전리품은 HuntLootExists, 가격이 종류와 안 맞으면 HuntLootPriceShape, 이름이 같은 다른 key 의
   * 아이템이 있으면 HuntLootNameTaken 이다.
   */
  async create(input: HuntLootInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const itemId = await this.putItem(tx, input.key, input)
      const [taken] = await tx
        .select({ id: huntLootItems.id })
        .from(huntLootItems)
        .where(eq(huntLootItems.itemId, itemId))
      if (taken !== undefined) throw new HuntLootExists(input.key)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${huntLootItems.sortOrder})` })
        .from(huntLootItems)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(huntLootItems)
          .values({
            itemId,
            type: input.type,
            npcPriceMeso: input.npcPriceMeso,
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: huntLootItems.id })
      } catch (error) {
        if (isCheckViolation(error)) throw new HuntLootPriceShape(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'huntLoot')
      return row
    })
  }

  /** 이름 · 그림 · NPC 가격 · 기간을 갈아 끼운다. 모르면 false 다. 가격이 종류와 안 맞으면 HuntLootPriceShape 다. */
  async update(key: string, input: HuntLootUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: huntLootItems.id, itemId: huntLootItems.itemId })
        .from(huntLootItems)
        .innerJoin(items, eq(items.id, huntLootItems.itemId))
        .where(eq(items.key, key))
      if (row === undefined) return false
      await this.putItem(tx, key, input)
      try {
        await tx
          .update(huntLootItems)
          .set({
            npcPriceMeso: input.npcPriceMeso,
            validFrom: input.validFrom,
            validUntil: input.validUntil,
          })
          .where(eq(huntLootItems.id, row.id))
      } catch (error) {
        if (isCheckViolation(error)) throw new HuntLootPriceShape(key)
        throw error
      }
      await touchSection(tx, 'huntLoot')
      return true
    })
  }

  /** 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async move(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: huntLootItems.id, key: items.key, sortOrder: huntLootItems.sortOrder })
        .from(huntLootItems)
        .innerJoin(items, eq(items.id, huntLootItems.itemId))
        .orderBy(asc(huntLootItems.sortOrder), asc(items.key))
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

  /**
   * 아이템 줄의 이름 · 그림을 적는다. 같은 key 의 아이템이 없으면 만든다. 그 줄의 id 를 돌려준다. 그림 표에 없는 그림은
   * AssetNotFound 다.
   */
  private async putItem(
    db: DbOrTx,
    key: string,
    input: { name: string; iconAssetId: string },
  ): Promise<string> {
    const twin = await sameNameItem(db, key, input.name)
    if (twin !== null) throw new HuntLootNameTaken(twin.key)
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, input.iconAssetId))
    if (asset === undefined) throw new AssetNotFound(input.iconAssetId)
    const columns = { name: input.name, iconAssetId: input.iconAssetId }
    // 아이템 줄이 바뀌므로 items 칸도 민다.
    await touchSection(db, 'items')
    const [same] = await db.select({ id: items.id }).from(items).where(eq(items.key, key))
    if (same !== undefined) {
      await db
        .update(items)
        .set({ ...columns, updatedAt: new Date() })
        .where(eq(items.id, same.id))
      return same.id
    }
    const [row] = await db
      .insert(items)
      .values({ key, ...columns })
      .returning({ id: items.id })
    if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
    return row.id
  }
}
