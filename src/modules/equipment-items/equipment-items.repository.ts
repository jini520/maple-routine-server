import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { items } from '../../database/schema'
import { sectionUpdatedAt } from '../game-data/sections'

export interface EquipmentItemView {
  key: string
  name: string
  level: number | null
}

/** GET /v1/game-data 의 equipmentItems 칸. key 차례다. 앱은 key 와 이름으로 찾을 뿐 차례를 안 본다. */
export interface EquipmentItemsSection {
  updatedAt: string | null
  items: EquipmentItemView[]
}

/** 아이템 표에서 강화 장비(is_equipment)만 앱 칸으로 낸다. 고치기는 관리 화면의 아이템 화면이 한다. */
@Injectable()
export class EquipmentItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<EquipmentItemsSection> {
    const rows = await this.db
      .select({ key: items.key, name: items.name, level: items.level })
      .from(items)
      .where(eq(items.isEquipment, true))
      .orderBy(asc(items.key))
    return { updatedAt: await sectionUpdatedAt(this.db, 'equipmentItems'), items: rows }
  }
}
