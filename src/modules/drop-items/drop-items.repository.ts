import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { items, ringLevelItems } from '../../database/schema'
import { sectionUpdatedAt } from '../game-data/sections'

/** 관리 화면의 드롭 표 · 상자 화면이 고르는 드롭 아이템 한 줄. */
export interface DropItemAdminView {
  key: string
  name: string
  iconAssetId: string | null
  isValuable: boolean
}

/**
 * 아이템 표에서 드롭 아이템(is_drop)을 드롭 표 · 상자 화면에 낸다. 고치기는 관리 화면의 아이템 화면이 한다. 앱에는 게임
 * 데이터의 items 칸이 아이템을 모두 낸다.
 */
@Injectable()
export class DropItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * key 차례. 반지 레벨 줄은 뺀다. 드롭 표와 상자의 내용물은 원래 반지를 가리키고, 레벨 줄은 기록만 가리키기 때문이다.
   */
  async adminSection(): Promise<{ updatedAt: string | null; items: DropItemAdminView[] }> {
    const rows = await this.db
      .select({
        key: items.key,
        name: items.name,
        iconAssetId: items.iconAssetId,
        isValuable: items.isValuable,
      })
      .from(items)
      .leftJoin(ringLevelItems, eq(ringLevelItems.itemId, items.id))
      .where(and(eq(items.isDrop, true), isNull(ringLevelItems.id)))
      .orderBy(asc(items.key))
    return { updatedAt: await sectionUpdatedAt(this.db, 'items'), items: rows }
  }

  async findByKey(key: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.key, key), eq(items.isDrop, true)))
    return row ?? null
  }
}
