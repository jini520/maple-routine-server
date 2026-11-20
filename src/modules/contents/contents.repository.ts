import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, contentCategories, contents } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 앱 CONTENT_CATEGORIES 의 key 집합 그대로. 글자 · 태그 · 차례는 표가 든다. */
export const CONTENT_CATEGORIES = [
  'monster_park',
  'daily_quest',
  'epic_dungeon',
  'maple_union',
  'arcane_river_quest',
  'weekly_quest',
  'mu_lung_dojo',
  'guild',
] as const
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number]
export const CONTENT_CYCLES = ['daily', 'weekly'] as const
export type ContentCycle = (typeof CONTENT_CYCLES)[number]
export const CONTENT_TYPES = ['contents', 'quest'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]
export const CONTENT_CHECK_TYPES = ['state_only', 'count_only', 'both', 'score'] as const
export type ContentCheckType = (typeof CONTENT_CHECK_TYPES)[number]
export const SHARE_SCOPES = ['character', 'world', 'account'] as const
export type ShareScope = (typeof SHARE_SCOPES)[number]

export interface ContentCategoryView {
  id: string
  key: ContentCategory
  name: string
  countTag: string | null
  hidesCountTag: boolean
  weeklyMaxCount: number | null
  sharedSortOrder: number | null
}

/** 컨텐츠 한 줄. 칸 이름은 표를 따르고 분류 · 그림은 줄 id 다. */
export interface ContentView {
  id: string
  key: string
  cycle: ContentCycle
  apiName: string
  categoryId: string
  name: string
  shortName: string
  countTag: string | null
  type: ContentType
  checkType: ContentCheckType
  maxCount: number | null
  requiredLevel: number | null
  validFrom: string | null
  validUntil: string | null
  shareScope: ShareScope
  backgroundMapAssetId: string | null
  backgroundPortraitAssetId: string | null
  regionIconAssetId: string | null
}

/** GET /v1/game-data 의 contents 칸. 분류는 sort_order 차례, 컨텐츠는 일간 뒤 주간이고 그 안이 sort_order 차례다. */
export interface ContentsSection {
  updatedAt: string | null
  contentCategories: ContentCategoryView[]
  contents: ContentView[]
}

/** 관리 화면의 컨텐츠. 분류의 key 를 함께 든다. */
export type ContentAdminRow = ContentView & { category: ContentCategory }

export type ContentCategoryInput = Omit<ContentCategoryView, 'id' | 'key'>
/** 분류는 key 로, 그림은 그림 줄 id 로 받는다. */
export type ContentInput = Omit<ContentAdminRow, 'id' | 'categoryId'>

export class ContentExists extends Error {}
/** 공백 · 정규화만 다른 API 이름이 이미 있다. message 가 그 줄의 key 다. */
export class ApiNameTaken extends Error {}
export class NoContentCategory extends Error {}

/** 앱이 API 이름에서 key 를 얻는 규칙과 같다. NFC 로 맞추고 공백을 모두 지운다. */
export function comparableApiName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '')
}

const CONTENT_COLUMNS = {
  id: contents.id,
  key: contents.key,
  cycle: contents.cycle,
  apiName: contents.apiName,
  categoryId: contents.categoryId,
  category: contentCategories.key,
  name: contents.name,
  shortName: contents.shortName,
  countTag: contents.countTag,
  type: contents.type,
  checkType: contents.checkType,
  maxCount: contents.maxCount,
  requiredLevel: contents.requiredLevel,
  validFrom: contents.validFrom,
  validUntil: contents.validUntil,
  shareScope: contents.shareScope,
  backgroundMapAssetId: contents.backgroundMapAssetId,
  backgroundPortraitAssetId: contents.backgroundPortraitAssetId,
  regionIconAssetId: contents.regionIconAssetId,
}

function viewOf(r: ContentAdminRow): ContentView {
  return {
    id: r.id,
    key: r.key,
    cycle: r.cycle,
    apiName: r.apiName,
    categoryId: r.categoryId,
    name: r.name,
    shortName: r.shortName,
    countTag: r.countTag,
    type: r.type,
    checkType: r.checkType,
    maxCount: r.maxCount,
    requiredLevel: r.requiredLevel,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    shareScope: r.shareScope,
    backgroundMapAssetId: r.backgroundMapAssetId,
    backgroundPortraitAssetId: r.backgroundPortraitAssetId,
    regionIconAssetId: r.regionIconAssetId,
  }
}

/**
 * 분류는 고치고 옮기기만 있다. ENUM 과 일대일이라 더하고 지우는 것은 마이그레이션이다. 컨텐츠는 더하고 고치고 옮기기만
 * 있다. 캐시 · 추적 목록 · 공유 원장이 key 를 들어 지우지 않고 until 로 닫는다.
 */
@Injectable()
export class ContentsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<ContentsSection> {
    const { categories, rows, updatedAt } = await this.read()
    return {
      updatedAt,
      contentCategories: categories,
      contents: rows.map(viewOf),
    }
  }

  async adminRows(): Promise<{
    updatedAt: string | null
    categories: ContentCategoryView[]
    contents: ContentAdminRow[]
  }> {
    const { categories, rows, updatedAt } = await this.read()
    return {
      updatedAt,
      categories,
      contents: rows.map((r) => ({ ...viewOf(r), category: r.category })),
    }
  }

  private async read() {
    const [categories, rows, updatedAt] = await Promise.all([
      this.db
        .select({
          id: contentCategories.id,
          key: contentCategories.key,
          name: contentCategories.name,
          countTag: contentCategories.countTag,
          hidesCountTag: contentCategories.hidesCountTag,
          weeklyMaxCount: contentCategories.weeklyMaxCount,
          sharedSortOrder: contentCategories.sharedSortOrder,
        })
        .from(contentCategories)
        .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.key)),
      this.db
        .select(CONTENT_COLUMNS)
        .from(contents)
        .innerJoin(contentCategories, eq(contents.categoryId, contentCategories.id))
        .orderBy(asc(contents.cycle), asc(contents.sortOrder), asc(contents.key)),
      sectionUpdatedAt(this.db, 'contents'),
    ])
    return { categories, rows, updatedAt }
  }

  /** 분류의 글자 · 태그 · 주간 최대 횟수 · 공유 차례를 갈아 끼운다. 모르면 false 다. */
  async updateCategory(key: ContentCategory, input: ContentCategoryInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(contentCategories)
        .set({
          name: input.name,
          countTag: input.countTag,
          hidesCountTag: input.hidesCountTag,
          weeklyMaxCount: input.weeklyMaxCount,
          sharedSortOrder: input.sharedSortOrder,
        })
        .where(eq(contentCategories.key, key))
        .returning({ id: contentCategories.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'contents')
      return true
    })
  }

  /** 분류의 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveCategory(key: ContentCategory, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: contentCategories.id,
          key: contentCategories.key,
          sortOrder: contentCategories.sortOrder,
        })
        .from(contentCategories)
        .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.key))
      return this.swap(tx, contentCategories, rows, key, direction)
    })
  }

  /**
   * 컨텐츠를 같은 주기의 맨 뒤에 더한다. 모르는 분류는 NoContentCategory, 공백만 다른 API 이름은 ApiNameTaken, 같은 key 는
   * ContentExists, 그림 표에 없는 그림은 AssetNotFound 다.
   */
  async createContent(input: ContentInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const categoryId = await this.categoryId(tx, input.category)
      if (categoryId === null) throw new NoContentCategory(input.category)
      await this.checkApiName(tx, input.apiName, null)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${contents.sortOrder})` })
        .from(contents)
        .where(eq(contents.cycle, input.cycle))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(contents)
          .values({
            ...(await this.columns(tx, input)),
            key: input.key,
            cycle: input.cycle,
            categoryId,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: contents.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ContentExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'contents')
      return row
    })
  }

  /** 컨텐츠를 갈아 끼운다. key 와 주기는 못 바꾼다. 모르면 false 다. 분류 · API 이름 · 그림 검사는 더할 때와 같다. */
  async updateContent(key: string, input: Omit<ContentInput, 'key' | 'cycle'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select({ id: contents.id }).from(contents).where(eq(contents.key, key))
      if (row === undefined) return false
      const categoryId = await this.categoryId(tx, input.category)
      if (categoryId === null) throw new NoContentCategory(input.category)
      await this.checkApiName(tx, input.apiName, row.id)
      await tx
        .update(contents)
        .set({ ...(await this.columns(tx, input)), categoryId })
        .where(eq(contents.id, row.id))
      await touchSection(tx, 'contents')
      return true
    })
  }

  /** 컨텐츠의 차례를 같은 주기 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveContent(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ cycle: contents.cycle })
        .from(contents)
        .where(eq(contents.key, key))
      if (row === undefined) return false
      const rows = await tx
        .select({ id: contents.id, key: contents.key, sortOrder: contents.sortOrder })
        .from(contents)
        .where(eq(contents.cycle, row.cycle))
        .orderBy(asc(contents.sortOrder), asc(contents.key))
      return this.swap(tx, contents, rows, key, direction)
    })
  }

  /** 입력을 표의 칸으로. 그림이 표에 없으면 AssetNotFound 다. */
  private async columns(db: DbOrTx, input: Omit<ContentInput, 'key' | 'cycle'>) {
    for (const id of [
      input.backgroundMapAssetId,
      input.backgroundPortraitAssetId,
      input.regionIconAssetId,
    ]) {
      if (id === null) continue
      const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, id))
      if (asset === undefined) throw new AssetNotFound(id)
    }
    return {
      apiName: input.apiName,
      name: input.name,
      shortName: input.shortName,
      backgroundMapAssetId: input.backgroundMapAssetId,
      backgroundPortraitAssetId: input.backgroundPortraitAssetId,
      regionIconAssetId: input.regionIconAssetId,
      countTag: input.countTag,
      type: input.type,
      checkType: input.checkType,
      maxCount: input.maxCount,
      requiredLevel: input.requiredLevel,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      shareScope: input.shareScope,
    }
  }

  private async categoryId(db: DbOrTx, key: ContentCategory): Promise<string | null> {
    const [row] = await db
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(eq(contentCategories.key, key))
    return row?.id ?? null
  }

  /** UNIQUE 는 원문에 걸려 있다. 앱이 보는 모양(NFC · 공백 제거)으로도 유일해야 key 를 하나로 얻는다. */
  private async checkApiName(db: DbOrTx, apiName: string, selfId: string | null): Promise<void> {
    const wanted = comparableApiName(apiName)
    const rows = await db
      .select({ id: contents.id, key: contents.key, apiName: contents.apiName })
      .from(contents)
    const clash = rows.find((r) => r.id !== selfId && comparableApiName(r.apiName) === wanted)
    if (clash !== undefined) throw new ApiNameTaken(clash.key)
  }

  private async swap(
    tx: DbOrTx,
    table: typeof contentCategories | typeof contents,
    rows: { id: string; key: string; sortOrder: number }[],
    key: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    const at = rows.findIndex((r) => r.key === key)
    if (at === -1) return false
    const mine = rows[at]
    const other = rows[direction === 'up' ? at - 1 : at + 1]
    if (mine === undefined || other === undefined) return true
    await tx.update(table).set({ sortOrder: other.sortOrder }).where(eq(table.id, mine.id))
    await tx.update(table).set({ sortOrder: mine.sortOrder }).where(eq(table.id, other.id))
    await touchSection(tx, 'contents')
    return true
  }
}
