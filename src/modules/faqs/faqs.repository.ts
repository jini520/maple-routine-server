import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { faqItems, faqSheets } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 묶음 key 의 모양. 소문자 · 숫자 · 붙임표다. 표의 CHECK 와 같다. */
export const FAQ_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/

export interface FaqSheetView {
  key: string
  title: string
}

export interface FaqItemView {
  sheet: string
  question: string
  /** 답 글. 문단은 빈 줄로 나눈다. */
  answer: string
}

/** GET /v1/game-data 의 faqs 칸. 배열 이름은 표 이름이고 문항은 묶음을 줄 id 로 가리킨다. 문항이 없는 묶음도 낸다. */
export interface FaqsSection {
  updatedAt: string | null
  faqSheets: (FaqSheetView & { id: string })[]
  faqItems: { sheetId: string; question: string; answer: string }[]
}

/** 관리 화면의 줄. 묶음은 key 로 잇고, 문항은 key 가 없어 id 로 고르고 지운다. */
export interface FaqsAdminRows {
  updatedAt: string | null
  sheets: FaqSheetView[]
  items: (FaqItemView & { id: string })[]
}

export type FaqSheetUpdate = Omit<FaqSheetView, 'key'>
export type FaqItemInput = Omit<FaqItemView, 'sheet'>

export class FaqSheetExists extends Error {}
export class NoFaqSheet extends Error {}

/** FAQ 묶음과 문항. 묶음의 key 는 앱 코드가 들어 못 바꾸고, 묶음을 지우면 문항도 지워진다. */
@Injectable()
export class FaqsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<FaqsSection> {
    const [sheets, items, updatedAt] = await this.rows()
    return {
      updatedAt,
      faqSheets: sheets.map((s) => ({ id: s.id, key: s.key, title: s.title })),
      faqItems: items.map((i) => ({ sheetId: i.sheetId, question: i.question, answer: i.answer })),
    }
  }

  async adminRows(): Promise<FaqsAdminRows> {
    const [sheets, items, updatedAt] = await this.rows()
    return {
      updatedAt,
      sheets: sheets.map((s) => ({ key: s.key, title: s.title })),
      items: items.map((i) => ({
        id: i.id,
        sheet: i.sheet,
        question: i.question,
        answer: i.answer,
      })),
    }
  }

  /** 묶음 차례 · 문항 차례로. */
  private rows() {
    return Promise.all([
      this.db
        .select({ id: faqSheets.id, key: faqSheets.key, title: faqSheets.title })
        .from(faqSheets)
        .orderBy(asc(faqSheets.sortOrder), asc(faqSheets.key)),
      this.db
        .select({
          id: faqItems.id,
          sheetId: faqItems.sheetId,
          sheet: faqSheets.key,
          question: faqItems.question,
          answer: faqItems.answer,
        })
        .from(faqItems)
        .innerJoin(faqSheets, eq(faqItems.sheetId, faqSheets.id))
        .orderBy(
          asc(faqSheets.sortOrder),
          asc(faqSheets.key),
          asc(faqItems.sortOrder),
          asc(faqItems.id),
        ),
      sectionUpdatedAt(this.db, 'faqs'),
    ])
  }

  /** 묶음을 맨 뒤에 더한다. 같은 key 는 FaqSheetExists 다. */
  async createSheet(input: FaqSheetView): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${faqSheets.sortOrder})` })
        .from(faqSheets)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(faqSheets)
          .values({ key: input.key, title: input.title, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: faqSheets.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new FaqSheetExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'faqs')
      return row
    })
  }

  /** 제목을 갈아 끼운다. 모르면 false 다. */
  async updateSheet(key: string, input: FaqSheetUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(faqSheets)
        .set({ title: input.title })
        .where(eq(faqSheets.key, key))
        .returning({ id: faqSheets.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'faqs')
      return true
    })
  }

  /** 묶음과 그 문항을 지운다. 모르면 false 다. */
  async removeSheet(key: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(faqSheets)
        .where(eq(faqSheets.key, key))
        .returning({ id: faqSheets.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'faqs')
      return true
    })
  }

  /** 묶음 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveSheet(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: faqSheets.id, key: faqSheets.key, sortOrder: faqSheets.sortOrder })
        .from(faqSheets)
        .orderBy(asc(faqSheets.sortOrder), asc(faqSheets.key))
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) return false
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx
        .update(faqSheets)
        .set({ sortOrder: other.sortOrder })
        .where(eq(faqSheets.id, mine.id))
      await tx
        .update(faqSheets)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(faqSheets.id, other.id))
      await touchSection(tx, 'faqs')
      return true
    })
  }

  /** 문항을 묶음 맨 뒤에 더한다. 모르는 묶음은 NoFaqSheet 다. */
  async createItem(sheet: string, input: FaqItemInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ id: faqSheets.id })
        .from(faqSheets)
        .where(eq(faqSheets.key, sheet))
      if (owner === undefined) throw new NoFaqSheet(sheet)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${faqItems.sortOrder})` })
        .from(faqItems)
        .where(eq(faqItems.sheetId, owner.id))
      const [row] = await tx
        .insert(faqItems)
        .values({
          sheetId: owner.id,
          sortOrder: (last?.max ?? -1) + 1,
          question: input.question,
          answer: input.answer,
        })
        .returning({ id: faqItems.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'faqs')
      return row
    })
  }

  /** 질문과 답을 갈아 끼운다. 묶음은 못 바꾼다. 모르면 false 다. */
  async updateItem(id: string, input: FaqItemInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(faqItems)
        .set({ question: input.question, answer: input.answer })
        .where(eq(faqItems.id, id))
        .returning({ id: faqItems.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'faqs')
      return true
    })
  }

  async removeItem(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(faqItems)
        .where(eq(faqItems.id, id))
        .returning({ id: faqItems.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'faqs')
      return true
    })
  }

  /** 묶음 안 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveItem(id: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx
        .select({ sheetId: faqItems.sheetId })
        .from(faqItems)
        .where(eq(faqItems.id, id))
      if (mine === undefined) return false
      const rows = await tx
        .select({ id: faqItems.id, sortOrder: faqItems.sortOrder })
        .from(faqItems)
        .where(eq(faqItems.sheetId, mine.sheetId))
        .orderBy(asc(faqItems.sortOrder), asc(faqItems.id))
      const at = rows.findIndex((r) => r.id === id)
      const me = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (me === undefined || other === undefined) return true
      await tx.update(faqItems).set({ sortOrder: other.sortOrder }).where(eq(faqItems.id, me.id))
      await tx.update(faqItems).set({ sortOrder: me.sortOrder }).where(eq(faqItems.id, other.id))
      await touchSection(tx, 'faqs')
      return true
    })
  }
}
