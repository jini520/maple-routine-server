import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { dropItems } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface DropItemView {
  key: string
  name: string
  iconFile: string | null
  valuable: boolean
}

/** GET /v1/game-data 의 dropItems 칸. */
export interface DropItemsSection {
  updatedAt: string | null
  items: DropItemView[]
}

/** 관리 화면이 보는 아이템. 월드 간 거래 불가는 시세만 쓰고 앱에 안 싣는다. */
export interface DropItemAdminView extends DropItemView {
  worldBound: boolean
}

/** worldBound 를 안 주면 새 아이템은 장비(false)이고, 고칠 때는 그대로 둔다. */
export interface DropItemInput {
  key: string
  name: string
  iconFile: string | null
  valuable: boolean
  worldBound?: boolean
}

/** 같은 key 의 아이템이 이미 있다. */
export class DropItemExists extends Error {}

@Injectable()
export class DropItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** key 차례. 앱은 key 로만 찾아 차례가 없다. */
  async section(): Promise<DropItemsSection> {
    const rows = await this.db.select().from(dropItems).orderBy(asc(dropItems.key))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'dropItems'),
      items: rows.map((r) => ({
        key: r.key,
        name: r.name,
        iconFile: r.iconFile,
        valuable: r.valuable,
      })),
    }
  }

  /** 관리 화면의 표. section 에 월드 간 거래 불가를 더한 것이다. */
  async adminSection(): Promise<{ updatedAt: string | null; items: DropItemAdminView[] }> {
    const rows = await this.db.select().from(dropItems).orderBy(asc(dropItems.key))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'dropItems'),
      items: rows.map((r) => ({
        key: r.key,
        name: r.name,
        iconFile: r.iconFile,
        valuable: r.valuable,
        worldBound: r.worldBound,
      })),
    }
  }

  async create(input: DropItemInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      let row: { id: string } | undefined
      try {
        ;[row] = await tx.insert(dropItems).values(input).returning({ id: dropItems.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new DropItemExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'dropItems')
      return row
    })
  }

  /** 이름 · 그림 · 고가 · 월드 간 거래 불가를 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르는 key 면 false 다. */
  async update(key: string, input: Omit<DropItemInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(dropItems)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(dropItems.key, key))
        .returning({ id: dropItems.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'dropItems')
      return true
    })
  }

  async findByKey(key: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: dropItems.id })
      .from(dropItems)
      .where(eq(dropItems.key, key))
    return row ?? null
  }
}
