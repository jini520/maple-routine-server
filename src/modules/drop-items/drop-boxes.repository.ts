import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { dropBoxContents, dropBoxes, dropItems } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface DropBoxView {
  /** 상자 아이템 key. */
  item: string
  levelMin: number | null
  levelMax: number | null
  /** 내용물 아이템 key. 차례가 상자를 열면 서는 후보 차례다. */
  contents: string[]
}

/** GET /v1/game-data 의 dropBoxes 칸. */
export interface DropBoxesSection {
  updatedAt: string | null
  boxes: DropBoxView[]
}

export interface DropBoxInput {
  item: string
  levelMin: number | null
  levelMax: number | null
}

export class DropBoxExists extends Error {}
/** 가리키는 아이템이 표에 없다. */
export class NoDropItem extends Error {}
export class ContentExists extends Error {}

@Injectable()
export class DropBoxesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<DropBoxesSection> {
    const boxes = await this.db
      .select({
        id: dropBoxes.id,
        item: dropItems.key,
        levelMin: dropBoxes.levelMin,
        levelMax: dropBoxes.levelMax,
      })
      .from(dropBoxes)
      .innerJoin(dropItems, eq(dropBoxes.itemId, dropItems.id))
      .orderBy(asc(dropItems.key))
    const contents = await this.db
      .select({
        boxId: dropBoxContents.boxId,
        item: dropItems.key,
        sortOrder: dropBoxContents.sortOrder,
      })
      .from(dropBoxContents)
      .innerJoin(dropItems, eq(dropBoxContents.itemId, dropItems.id))
      .orderBy(asc(dropBoxContents.sortOrder))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'dropBoxes'),
      boxes: boxes.map((b) => ({
        item: b.item,
        levelMin: b.levelMin,
        levelMax: b.levelMax,
        contents: contents.filter((c) => c.boxId === b.id).map((c) => c.item),
      })),
    }
  }

  async create(input: DropBoxInput): Promise<{ id: string }> {
    const item = await this.itemId(input.item)
    if (item === null) throw new NoDropItem(input.item)
    return this.db.transaction(async (tx) => {
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(dropBoxes)
          .values({ itemId: item, levelMin: input.levelMin, levelMax: input.levelMax })
          .returning({ id: dropBoxes.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new DropBoxExists(input.item)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'dropBoxes')
      return row
    })
  }

  /** 레벨 범위를 갈아 끼운다. 모르는 상자면 false 다. */
  async setLevels(
    boxItem: string,
    levels: { levelMin: number | null; levelMax: number | null },
  ): Promise<boolean> {
    const box = await this.boxId(boxItem)
    if (box === null) return false
    await this.db.transaction(async (tx) => {
      await tx.update(dropBoxes).set(levels).where(eq(dropBoxes.id, box))
      await touchSection(tx, 'dropBoxes')
    })
    return true
  }

  /** 내용물을 맨 뒤에 더한다. 모르는 상자면 false, 모르는 아이템은 NoDropItem, 이미 있으면 ContentExists 다. */
  async addContent(boxItem: string, item: string): Promise<boolean> {
    const box = await this.boxId(boxItem)
    if (box === null) return false
    const itemId = await this.itemId(item)
    if (itemId === null) throw new NoDropItem(item)
    await this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${dropBoxContents.sortOrder})` })
        .from(dropBoxContents)
        .where(eq(dropBoxContents.boxId, box))
      try {
        await tx
          .insert(dropBoxContents)
          .values({ boxId: box, itemId, sortOrder: (last?.max ?? -1) + 1 })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ContentExists(item)
        throw error
      }
      await touchSection(tx, 'dropBoxes')
    })
    return true
  }

  /** 내용물을 뺀다. 없으면 false 다. */
  async removeContent(boxItem: string, item: string): Promise<boolean> {
    const found = await this.content(boxItem, item)
    if (found === null) return false
    await this.db.transaction(async (tx) => {
      await tx.delete(dropBoxContents).where(eq(dropBoxContents.id, found.id))
      await touchSection(tx, 'dropBoxes')
    })
    return true
  }

  /** 내용물의 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 없으면 false 다. */
  async moveContent(boxItem: string, item: string, direction: 'up' | 'down'): Promise<boolean> {
    const found = await this.content(boxItem, item)
    if (found === null) return false
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: dropBoxContents.id, sortOrder: dropBoxContents.sortOrder })
        .from(dropBoxContents)
        .where(eq(dropBoxContents.boxId, found.boxId))
        .orderBy(asc(dropBoxContents.sortOrder))
      const at = rows.findIndex((r) => r.id === found.id)
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (other === undefined) return
      const mine = rows[at]
      if (mine === undefined) return
      await tx
        .update(dropBoxContents)
        .set({ sortOrder: other.sortOrder })
        .where(eq(dropBoxContents.id, mine.id))
      await tx
        .update(dropBoxContents)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(dropBoxContents.id, other.id))
      await touchSection(tx, 'dropBoxes')
    })
    return true
  }

  private async itemId(key: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: dropItems.id })
      .from(dropItems)
      .where(eq(dropItems.key, key))
    return row?.id ?? null
  }

  private async boxId(boxItem: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: dropBoxes.id })
      .from(dropBoxes)
      .innerJoin(dropItems, eq(dropBoxes.itemId, dropItems.id))
      .where(eq(dropItems.key, boxItem))
    return row?.id ?? null
  }

  private async content(
    boxItem: string,
    item: string,
  ): Promise<{ id: string; boxId: string } | null> {
    const box = await this.boxId(boxItem)
    const itemId = await this.itemId(item)
    if (box === null || itemId === null) return null
    const [row] = await this.db
      .select({ id: dropBoxContents.id, boxId: dropBoxContents.boxId })
      .from(dropBoxContents)
      .where(and(eq(dropBoxContents.boxId, box), eq(dropBoxContents.itemId, itemId)))
    return row ?? null
  }
}
