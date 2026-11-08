import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { items } from '../../database/schema'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'
import { comparableItemName, sameNameItem } from '../items/items'

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

export type EquipmentItemInput = EquipmentItemView

export class EquipmentItemExists extends Error {}
/** 공백 · 정규화만 다른 이름의 장비가 이미 있다. message 가 그 줄의 key 다. */
export class EquipmentNameTaken extends Error {}
/** 장비가 아닌 아이템(드롭 아이템 등)에 같은 이름이 있는데 key 가 다르다. message 가 그 아이템의 key 다. */
export class DropItemKeyMismatch extends Error {}

/** 앱이 API target_item 에서 key 를 얻는 규칙과 같다. NFC 로 맞추고 공백을 모두 지운다. */
export const comparableEquipmentName = comparableItemName

/**
 * 아이템 표에서 강화 장비(is_equipment)만 다룬다. 더하고 고치기만 있다. 기록이 key 를 들어 지우지 않는다. 같은 key 의
 * 아이템이 드롭 아이템으로 이미 있으면 새 줄을 만들지 않고 그 줄에 장비를 얹는다.
 */
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

  /**
   * 장비를 더한다. 같은 key 의 장비는 EquipmentItemExists, 공백만 다른 이름의 다른 장비는 EquipmentNameTaken, 장비가 아닌
   * 아이템에 같은 이름이 다른 key 로 있으면 DropItemKeyMismatch 다. 같은 key 의 드롭 아이템이 있으면 그 줄에 레벨과 장비를
   * 얹고 이름은 그 줄의 것을 둔다. 드롭 아이템의 띄어 쓴 이름이 게임 표기라서다.
   */
  async create(input: EquipmentItemInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [same] = await tx
        .select({ id: items.id, isEquipment: items.isEquipment })
        .from(items)
        .where(eq(items.key, input.key))
      if (same?.isEquipment) throw new EquipmentItemExists(input.key)
      await this.checkName(tx, input.key, input.name)
      let id: string
      if (same === undefined) {
        const [row] = await tx
          .insert(items)
          .values({ key: input.key, name: input.name, level: input.level, isEquipment: true })
          .returning({ id: items.id })
        if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
        id = row.id
      } else {
        await tx
          .update(items)
          .set({ level: input.level, isEquipment: true, updatedAt: new Date() })
          .where(eq(items.id, same.id))
        id = same.id
      }
      await touchSection(tx, 'equipmentItems')
      return { id }
    })
  }

  /** 이름 · 레벨을 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 false 다. 이름 검사는 더할 때와 같다. */
  async update(key: string, input: Omit<EquipmentItemInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: items.id, isDrop: items.isDrop })
        .from(items)
        .where(and(eq(items.key, key), eq(items.isEquipment, true)))
      if (row === undefined) return false
      await this.checkName(tx, key, input.name)
      await tx
        .update(items)
        .set({ name: input.name, level: input.level, updatedAt: new Date() })
        .where(eq(items.id, row.id))
      await touchSection(tx, 'equipmentItems')
      // 드롭 아이템을 겸하면 드롭 칸의 이름도 바뀐다.
      if (row.isDrop) await touchSection(tx, 'dropItems')
      return true
    })
  }

  /**
   * UNIQUE 는 key 에만 있다. 앱이 보는 모양(NFC · 공백 제거)으로도 이름이 표 전체에서 유일해야 한 물건이 한 key 로 선다.
   */
  private async checkName(db: DbOrTx, key: string, name: string): Promise<void> {
    const twin = await sameNameItem(db, key, name)
    if (twin === null) return
    if (twin.isEquipment) throw new EquipmentNameTaken(twin.key)
    throw new DropItemKeyMismatch(twin.key)
  }
}
