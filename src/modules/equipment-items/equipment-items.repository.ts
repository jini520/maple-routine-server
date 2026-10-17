import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { dropItems, equipmentItems } from '../../database/schema'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

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
/** 공백 · 정규화만 다른 이름이 이미 있다. message 가 그 줄의 key 다. */
export class EquipmentNameTaken extends Error {}
/** 드롭 아이템 표에 같은 이름이 있는데 key 가 다르다. message 가 드롭 아이템의 key 다. */
export class DropItemKeyMismatch extends Error {}

/** 앱이 API target_item 에서 key 를 얻는 규칙과 같다. NFC 로 맞추고 공백을 모두 지운다. */
export function comparableEquipmentName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '')
}

/** 장비는 더하고 고치기만 있다. 기록이 key 를 들어 지우지 않는다. */
@Injectable()
export class EquipmentItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<EquipmentItemsSection> {
    const rows = await this.db
      .select({ key: equipmentItems.key, name: equipmentItems.name, level: equipmentItems.level })
      .from(equipmentItems)
      .orderBy(asc(equipmentItems.key))
    return { updatedAt: await sectionUpdatedAt(this.db, 'equipmentItems'), items: rows }
  }

  /**
   * 장비를 더한다. 같은 key 는 EquipmentItemExists, 공백만 다른 이름은 EquipmentNameTaken, 드롭 아이템 표의 같은 이름과
   * key 가 다르면 DropItemKeyMismatch 다.
   */
  async create(input: EquipmentItemInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      await this.checkName(tx, input.key, input.name, null)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx.insert(equipmentItems).values(input).returning({ id: equipmentItems.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new EquipmentItemExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'equipmentItems')
      return row
    })
  }

  /** 이름 · 레벨을 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 false 다. 이름 검사는 더할 때와 같다. */
  async update(key: string, input: Omit<EquipmentItemInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: equipmentItems.id })
        .from(equipmentItems)
        .where(eq(equipmentItems.key, key))
      if (row === undefined) return false
      await this.checkName(tx, key, input.name, row.id)
      await tx
        .update(equipmentItems)
        .set({ name: input.name, level: input.level })
        .where(eq(equipmentItems.id, row.id))
      await touchSection(tx, 'equipmentItems')
      return true
    })
  }

  /**
   * UNIQUE 는 원문에 걸려 있다. 앱이 보는 모양(NFC · 공백 제거)으로도 유일해야 key 를 하나로 얻는다. 드롭 아이템 표와 같은
   * 장비는 key 가 같아야 두 표가 한 물건을 두 key 로 부르지 않는다.
   */
  private async checkName(db: DbOrTx, key: string, name: string, selfId: string | null) {
    const wanted = comparableEquipmentName(name)
    const rows = await db
      .select({ id: equipmentItems.id, key: equipmentItems.key, name: equipmentItems.name })
      .from(equipmentItems)
    const clash = rows.find((r) => r.id !== selfId && comparableEquipmentName(r.name) === wanted)
    if (clash !== undefined) throw new EquipmentNameTaken(clash.key)
    const drops = await db.select({ key: dropItems.key, name: dropItems.name }).from(dropItems)
    const twin = drops.find((d) => comparableEquipmentName(d.name) === wanted)
    if (twin !== undefined && twin.key !== key) throw new DropItemKeyMismatch(twin.key)
  }
}
