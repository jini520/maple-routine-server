import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { contentCategories, contents } from '../../database/schema'
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
export const CONTENT_SECTIONS = ['daily', 'weekly'] as const
export type ContentSection = (typeof CONTENT_SECTIONS)[number]
export const CONTENT_TYPES = ['contents', 'quest'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]
export const SHARE_SCOPES = ['character', 'world', 'account'] as const
export type ShareScope = (typeof SHARE_SCOPES)[number]

export interface ContentCategoryView {
  key: ContentCategory
  name: string
  countTag: string | null
  hideCountTag: boolean
  weeklyLimit: number | null
  sharedOrder: number | null
}

export interface ContentView {
  key: string
  section: ContentSection
  apiName: string
  category: ContentCategory
  displayName: string
  shortName: string
  backgroundMap: string | null
  backgroundPortrait: string | null
  countTag: string | null
  type: ContentType
  maxCount: number
  requiredLevel: number | null
  from: string | null
  until: string | null
  shareScope: ShareScope
  sharedShortName: string | null
  onlyWhenScheduled: boolean
  trustRegistrationFlag: boolean
  cumulativeScore: boolean
  maxCountOverride: number | null
}

/** GET /v1/game-data 의 contents 칸. 갈래는 sort_order 차례, 컨텐츠는 일간 뒤 주간이고 섹션 안이 sort_order 차례다. */
export interface ContentsSection {
  updatedAt: string | null
  categories: ContentCategoryView[]
  contents: ContentView[]
}

export type ContentCategoryInput = Omit<ContentCategoryView, 'key'>
export type ContentInput = ContentView

export class ContentExists extends Error {}
/** 공백 · 정규화만 다른 API 이름이 이미 있다. message 가 그 줄의 key 다. */
export class ApiNameTaken extends Error {}
export class NoContentCategory extends Error {}

/** 앱이 API 이름에서 key 를 얻는 규칙과 같다. NFC 로 맞추고 공백을 모두 지운다. */
export function comparableApiName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '')
}

const CONTENT_COLUMNS = {
  key: contents.key,
  section: contents.section,
  apiName: contents.apiName,
  category: contentCategories.key,
  displayName: contents.displayName,
  shortName: contents.shortName,
  backgroundMap: contents.backgroundMap,
  backgroundPortrait: contents.backgroundPortrait,
  countTag: contents.countTag,
  type: contents.type,
  maxCount: contents.maxCount,
  requiredLevel: contents.requiredLevel,
  from: contents.from,
  until: contents.until,
  shareScope: contents.shareScope,
  sharedShortName: contents.sharedShortName,
  onlyWhenScheduled: contents.onlyWhenScheduled,
  trustRegistrationFlag: contents.trustRegistrationFlag,
  cumulativeScore: contents.cumulativeScore,
  maxCountOverride: contents.maxCountOverride,
}

/**
 * 갈래는 고치고 옮기기만 있다. ENUM 과 일대일이라 더하고 지우는 것은 마이그레이션이다. 컨텐츠는 더하고 고치고 옮기기만
 * 있다. 캐시 · 추적 목록 · 공유 원장이 key 를 들어 지우지 않고 until 로 닫는다.
 */
@Injectable()
export class ContentsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<ContentsSection> {
    const [categories, rows, updatedAt] = await Promise.all([
      this.db
        .select()
        .from(contentCategories)
        .orderBy(asc(contentCategories.sortOrder), asc(contentCategories.key)),
      this.db
        .select(CONTENT_COLUMNS)
        .from(contents)
        .innerJoin(contentCategories, eq(contents.categoryId, contentCategories.id))
        .orderBy(asc(contents.section), asc(contents.sortOrder), asc(contents.key)),
      sectionUpdatedAt(this.db, 'contents'),
    ])
    return {
      updatedAt,
      categories: categories.map((c) => ({
        key: c.key,
        name: c.name,
        countTag: c.countTag,
        hideCountTag: c.hideCountTag,
        weeklyLimit: c.weeklyLimit,
        sharedOrder: c.sharedOrder,
      })),
      contents: rows,
    }
  }

  /** 갈래의 글자 · 태그 · 한도 · 공유 차례를 갈아 끼운다. 모르면 false 다. */
  async updateCategory(key: ContentCategory, input: ContentCategoryInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(contentCategories)
        .set({
          name: input.name,
          countTag: input.countTag,
          hideCountTag: input.hideCountTag,
          weeklyLimit: input.weeklyLimit,
          sharedOrder: input.sharedOrder,
        })
        .where(eq(contentCategories.key, key))
        .returning({ id: contentCategories.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'contents')
      return true
    })
  }

  /** 갈래의 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
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
   * 컨텐츠를 섹션 맨 뒤에 더한다. 모르는 갈래는 NoContentCategory, 공백만 다른 API 이름은 ApiNameTaken, 같은 key 는
   * ContentExists 다.
   */
  async createContent(input: ContentInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const categoryId = await this.categoryId(tx, input.category)
      if (categoryId === null) throw new NoContentCategory(input.category)
      await this.checkApiName(tx, input.apiName, null)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${contents.sortOrder})` })
        .from(contents)
        .where(eq(contents.section, input.section))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(contents)
          .values({
            ...this.columns(input),
            key: input.key,
            section: input.section,
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

  /** 컨텐츠를 갈아 끼운다. key 와 섹션은 못 바꾼다. 모르면 false 다. 갈래 · API 이름 검사는 더할 때와 같다. */
  async updateContent(key: string, input: Omit<ContentInput, 'key' | 'section'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select({ id: contents.id }).from(contents).where(eq(contents.key, key))
      if (row === undefined) return false
      const categoryId = await this.categoryId(tx, input.category)
      if (categoryId === null) throw new NoContentCategory(input.category)
      await this.checkApiName(tx, input.apiName, row.id)
      await tx
        .update(contents)
        .set({ ...this.columns(input), categoryId })
        .where(eq(contents.id, row.id))
      await touchSection(tx, 'contents')
      return true
    })
  }

  /** 컨텐츠의 차례를 섹션 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveContent(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ section: contents.section })
        .from(contents)
        .where(eq(contents.key, key))
      if (row === undefined) return false
      const rows = await tx
        .select({ id: contents.id, key: contents.key, sortOrder: contents.sortOrder })
        .from(contents)
        .where(eq(contents.section, row.section))
        .orderBy(asc(contents.sortOrder), asc(contents.key))
      return this.swap(tx, contents, rows, key, direction)
    })
  }

  private columns(input: Omit<ContentInput, 'key' | 'section'>) {
    return {
      apiName: input.apiName,
      displayName: input.displayName,
      shortName: input.shortName,
      backgroundMap: input.backgroundMap,
      backgroundPortrait: input.backgroundPortrait,
      countTag: input.countTag,
      type: input.type,
      maxCount: input.maxCount,
      requiredLevel: input.requiredLevel,
      from: input.from,
      until: input.until,
      shareScope: input.shareScope,
      sharedShortName: input.sharedShortName,
      onlyWhenScheduled: input.onlyWhenScheduled,
      trustRegistrationFlag: input.trustRegistrationFlag,
      cumulativeScore: input.cumulativeScore,
      maxCountOverride: input.maxCountOverride,
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
