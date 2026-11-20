import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, cashbookCategories, cashbookItemTypes } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export const CASHBOOK_ENTRY_TYPES = ['income', 'spend'] as const
export type CashbookEntryType = (typeof CASHBOOK_ENTRY_TYPES)[number]

export interface CashbookCategoryView {
  id: string
  entryType: CashbookEntryType
  key: string
  name: string
  cardTitle: string
  iconAssetId: string
  description: string
  unit: string | null
}

export interface CashbookItemTypeView {
  id: string
  key: string
  name: string
  unit: string | null
  hasTariff: boolean
}

/** GET /v1/game-data 의 cashbookCategories 칸. 분류는 수입 · 지출 순서이고 그 안은 차례대로다. */
export interface CashbookCategoriesSection {
  updatedAt: string | null
  cashbookCategories: CashbookCategoryView[]
  cashbookItemTypes: CashbookItemTypeView[]
}

export type CashbookCategoryInput = Omit<CashbookCategoryView, 'id'>
export type CashbookCategoryUpdate = Omit<CashbookCategoryInput, 'entryType' | 'key'>
export type CashbookItemTypeUpdate = Omit<CashbookItemTypeView, 'id' | 'key'>

export class CashbookCategoryExists extends Error {}

/**
 * 분류는 더하고 고치고 옮기기만 있다. 기록이 줄을 가리켜 지우지 않는다. 아이템 종류는 앱 코드가 key 로 수량 · 관세를
 * 가르므로 관리 화면에서는 고치기만 있다.
 */
@Injectable()
export class CashbookCategoriesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<CashbookCategoriesSection> {
    const [categories, itemTypes, updatedAt] = await Promise.all([
      this.db
        .select({
          id: cashbookCategories.id,
          entryType: cashbookCategories.entryType,
          key: cashbookCategories.key,
          name: cashbookCategories.name,
          cardTitle: cashbookCategories.cardTitle,
          iconAssetId: cashbookCategories.iconAssetId,
          description: cashbookCategories.description,
          unit: cashbookCategories.unit,
        })
        .from(cashbookCategories)
        .orderBy(
          asc(cashbookCategories.entryType),
          asc(cashbookCategories.sortOrder),
          asc(cashbookCategories.key),
        ),
      this.db
        .select({
          id: cashbookItemTypes.id,
          key: cashbookItemTypes.key,
          name: cashbookItemTypes.name,
          unit: cashbookItemTypes.unit,
          hasTariff: cashbookItemTypes.hasTariff,
        })
        .from(cashbookItemTypes)
        .orderBy(asc(cashbookItemTypes.sortOrder), asc(cashbookItemTypes.key)),
      sectionUpdatedAt(this.db, 'cashbookCategories'),
    ])
    return { updatedAt, cashbookCategories: categories, cashbookItemTypes: itemTypes }
  }

  /** 같은 수입 · 지출의 맨 뒤에 더한다. 같은 (entryType, key) 는 CashbookCategoryExists, 없는 그림은 AssetNotFound 다. */
  async createCategory(input: CashbookCategoryInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      await requireAsset(tx, input.iconAssetId)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${cashbookCategories.sortOrder})` })
        .from(cashbookCategories)
        .where(eq(cashbookCategories.entryType, input.entryType))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(cashbookCategories)
          .values({
            entryType: input.entryType,
            key: input.key,
            name: input.name,
            cardTitle: input.cardTitle,
            iconAssetId: input.iconAssetId,
            description: input.description,
            unit: input.unit,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: cashbookCategories.id })
      } catch (error) {
        if (isUniqueViolation(error))
          throw new CashbookCategoryExists(`${input.entryType}.${input.key}`)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'cashbookCategories')
      return row
    })
  }

  /** 이름 · 카드 제목 · 그림 · 설명 · 단위를 갈아 끼운다. 모르면 false 다. */
  async updateCategory(
    entryType: CashbookEntryType,
    key: string,
    input: CashbookCategoryUpdate,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await requireAsset(tx, input.iconAssetId)
      const rows = await tx
        .update(cashbookCategories)
        .set({
          name: input.name,
          cardTitle: input.cardTitle,
          iconAssetId: input.iconAssetId,
          description: input.description,
          unit: input.unit,
        })
        .where(and(eq(cashbookCategories.entryType, entryType), eq(cashbookCategories.key, key)))
        .returning({ id: cashbookCategories.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'cashbookCategories')
      return true
    })
  }

  /** 같은 수입 · 지출 안에서 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveCategory(
    entryType: CashbookEntryType,
    key: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: cashbookCategories.id,
          key: cashbookCategories.key,
          sortOrder: cashbookCategories.sortOrder,
        })
        .from(cashbookCategories)
        .where(eq(cashbookCategories.entryType, entryType))
        .orderBy(asc(cashbookCategories.sortOrder), asc(cashbookCategories.key))
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) return false
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx
        .update(cashbookCategories)
        .set({ sortOrder: other.sortOrder })
        .where(eq(cashbookCategories.id, mine.id))
      await tx
        .update(cashbookCategories)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(cashbookCategories.id, other.id))
      await touchSection(tx, 'cashbookCategories')
      return true
    })
  }

  /** 이름 · 단위 · 관세 여부를 갈아 끼운다. 모르면 false 다. */
  async updateItemType(key: string, input: CashbookItemTypeUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(cashbookItemTypes)
        .set({ name: input.name, unit: input.unit, hasTariff: input.hasTariff })
        .where(eq(cashbookItemTypes.key, key))
        .returning({ id: cashbookItemTypes.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'cashbookCategories')
      return true
    })
  }
}

/** 그림 표에 없는 그림 id 는 AssetNotFound 다. FK 오류로 두면 관리 화면에 500 이 난다. */
async function requireAsset(db: DbOrTx, id: string): Promise<void> {
  const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, id))
  if (asset === undefined) throw new AssetNotFound(id)
}
