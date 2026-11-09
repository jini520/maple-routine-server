import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets, items } from '../../database/schema'
import { optionalRefValueOf } from '../assets/asset-refs'
import { sectionUpdatedAt } from '../game-data/sections'

export interface DropItemView {
  key: string
  name: string
  /** 옛 앱이 읽는 그림 이름 */
  iconFile: string | null
  iconAssetId: string | null
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

/** 아이템 표에서 드롭 아이템(is_drop)만 앱 칸과 드롭 표 화면으로 낸다. 고치기는 관리 화면의 아이템 화면이 한다. */
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
        iconAssetId: r.iconAssetId,
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
        iconAssetId: items.iconAssetId,
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
      iconAssetId: r.iconAssetId,
      valuable: r.valuable,
      worldBound: r.worldBound,
    }))
  }

  async findByKey(key: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.key, key), eq(items.isDrop, true)))
    return row ?? null
  }
}
