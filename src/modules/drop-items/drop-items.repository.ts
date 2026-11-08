import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets, items } from '../../database/schema'
import { optionalRefValueOf, resolveOptionalAssetId } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'
import { sameNameItem } from '../items/items'

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

/** 같은 key 의 드롭 아이템이 이미 있다. */
export class DropItemExists extends Error {}
/** 비교 모양의 이름이 같은 아이템이 다른 key 로 있다. message 가 그 아이템의 key 다. */
export class DropItemNameTaken extends Error {}

/**
 * 아이템 표에서 드롭 아이템(is_drop)만 다룬다. 같은 key 의 아이템이 강화 장비나 사냥 전리품으로 이미 있으면 새 줄을 만들지
 * 않고 그 줄에 드롭을 얹는다. 한 물건이 두 줄이 되면 기록이 갈리기 때문이다.
 */
@Injectable()
export class DropItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** key 차례. 앱은 key 로만 찾아 차례가 없다. */
  async section(): Promise<DropItemsSection> {
    const rows = await this.rows()
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
    return { updatedAt: await sectionUpdatedAt(this.db, 'dropItems'), items: await this.rows() }
  }

  private async rows(): Promise<DropItemAdminView[]> {
    const rows = await this.db
      .select({
        key: items.key,
        name: items.name,
        iconPath: assets.path,
        valuable: items.valuable,
        worldBound: items.worldBound,
      })
      .from(items)
      .leftJoin(assets, eq(assets.id, items.iconAssetId))
      .where(eq(items.isDrop, true))
      .orderBy(asc(items.key))
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      iconFile: optionalRefValueOf('itemIcon', r.iconPath),
      valuable: r.valuable,
      worldBound: r.worldBound,
    }))
  }

  /** 같은 key 의 드롭 아이템은 DropItemExists, 이름이 같은 다른 key 의 아이템은 DropItemNameTaken 이다. */
  async create(input: DropItemInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [same] = await tx
        .select({ id: items.id, isDrop: items.isDrop })
        .from(items)
        .where(eq(items.key, input.key))
      if (same?.isDrop) throw new DropItemExists(input.key)
      const twin = await sameNameItem(tx, input.key, input.name)
      if (twin !== null) throw new DropItemNameTaken(twin.key)
      const columns = { ...(await columnsOf(tx, input)), isDrop: true }
      let id: string
      if (same === undefined) {
        const [row] = await tx.insert(items).values(columns).returning({ id: items.id })
        if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
        id = row.id
      } else {
        await tx
          .update(items)
          .set({ ...columns, updatedAt: new Date() })
          .where(eq(items.id, same.id))
        id = same.id
      }
      await touchSection(tx, 'dropItems')
      return { id }
    })
  }

  /**
   * 이름 · 그림 · 고가 · 월드 간 거래 불가를 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르는 key 면 false, 이름이 같은
   * 다른 key 의 아이템이 있으면 DropItemNameTaken 이다.
   */
  async update(key: string, input: Omit<DropItemInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const twin = await sameNameItem(tx, key, input.name)
      if (twin !== null) throw new DropItemNameTaken(twin.key)
      const rows = await tx
        .update(items)
        .set({ ...(await columnsOf(tx, input)), updatedAt: new Date() })
        .where(and(eq(items.key, key), eq(items.isDrop, true)))
        .returning({ id: items.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'dropItems')
      return true
    })
  }

  async findByKey(key: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.key, key), eq(items.isDrop, true)))
    return row ?? null
  }
}

/** 입력의 그림 파일 이름을 그림 id 로 푼 표의 칸. 그림이 표에 없으면 AssetNotFound 다. */
async function columnsOf<T extends { iconFile: string | null }>(db: DbOrTx, input: T) {
  const { iconFile, ...rest } = input
  return { ...rest, iconAssetId: await resolveOptionalAssetId(db, 'itemIcon', iconFile) }
}
