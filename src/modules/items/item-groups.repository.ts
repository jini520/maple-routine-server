import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, max, ne } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { itemGroups, items } from '../../database/schema'
import { type DbOrTx, touchSection } from '../game-data/sections'
import { ITEM_KINDS, type ItemKind } from './items'

/** 관리 화면의 분류 트리. 종류는 코드의 차례로 모두 서고, 묶음은 종류 안의 차례다. */
export interface ItemKindTree {
  key: ItemKind
  name: string
  groups: { key: string; name: string }[]
}

/** 묶음 고치기 본문. key 는 따로 받는다. 앱이 묶음 key 로 고르기 목록을 걸러 못 바꾸기 때문이다. */
export interface ItemGroupInput {
  kind: ItemKind
  name: string
}

/** 같은 key 의 묶음이 이미 있다. message 가 그 key 다. */
export class ItemGroupExists extends Error {}
/** 같은 종류에 이름이 같은 묶음이 있다. message 가 그 이름이다. */
export class ItemGroupNameTaken extends Error {}
/** 아이템이 든 묶음을 지우려 했다. message 가 그 key 다. */
export class ItemGroupInUse extends Error {}

/** 아이템 묶음 표. 아이템 화면의 트리가 더하고 고친다. */
@Injectable()
export class ItemGroupsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async tree(): Promise<ItemKindTree[]> {
    const rows = await this.db
      .select({ key: itemGroups.key, kind: itemGroups.kind, name: itemGroups.name })
      .from(itemGroups)
      .orderBy(asc(itemGroups.sortOrder), asc(itemGroups.key))
    return ITEM_KINDS.map((kind) => ({
      key: kind.key,
      name: kind.name,
      groups: rows.filter((r) => r.kind === kind.key).map(({ key, name }) => ({ key, name })),
    }))
  }

  /** 그 종류의 맨 뒤에 선다. 같은 key 는 ItemGroupExists, 같은 종류 안의 같은 이름은 ItemGroupNameTaken 이다. */
  async create(input: { key: string } & ItemGroupInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [same] = await tx
        .select({ id: itemGroups.id })
        .from(itemGroups)
        .where(eq(itemGroups.key, input.key))
      if (same !== undefined) throw new ItemGroupExists(input.key)
      await checkName(tx, input.key, input)
      await tx.insert(itemGroups).values({ ...input, sortOrder: await nextOrder(tx, input.kind) })
    })
  }

  /**
   * 이름 · 종류를 고친다. 다른 종류로 옮기면 그 종류의 맨 뒤에 서고, 묶음에 아이템이 있으면 그 아이템의 종류가 바뀌므로
   * items 칸의 시각을 민다. 모르는 key 는 false 다.
   */
  async update(key: string, input: ItemGroupInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: itemGroups.id, kind: itemGroups.kind })
        .from(itemGroups)
        .where(eq(itemGroups.key, key))
      if (current === undefined) return false
      await checkName(tx, key, input)
      const moved = current.kind !== input.kind
      await tx
        .update(itemGroups)
        .set({ ...input, ...(moved ? { sortOrder: await nextOrder(tx, input.kind) } : {}) })
        .where(eq(itemGroups.id, current.id))
      if (moved && (await hasItems(tx, key))) await touchSection(tx, 'items')
      return true
    })
  }

  /** 같은 종류 안의 이웃과 차례를 바꾼다. 끝이면 그대로이고, 모르는 key 는 false 다. */
  async move(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ kind: itemGroups.kind })
        .from(itemGroups)
        .where(eq(itemGroups.key, key))
      if (current === undefined) return false
      const rows = await tx
        .select({ id: itemGroups.id, key: itemGroups.key, sortOrder: itemGroups.sortOrder })
        .from(itemGroups)
        .where(eq(itemGroups.kind, current.kind))
        .orderBy(asc(itemGroups.sortOrder), asc(itemGroups.key))
      const at = rows.findIndex((r) => r.key === key)
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx
        .update(itemGroups)
        .set({ sortOrder: other.sortOrder })
        .where(eq(itemGroups.id, mine.id))
      await tx
        .update(itemGroups)
        .set({ sortOrder: mine.sortOrder })
        .where(eq(itemGroups.id, other.id))
      return true
    })
  }

  /** 빈 묶음만 지운다. 아이템이 든 묶음은 ItemGroupInUse 이고, 모르는 key 는 false 다. */
  async remove(key: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (await hasItems(tx, key)) throw new ItemGroupInUse(key)
      const deleted = await tx
        .delete(itemGroups)
        .where(eq(itemGroups.key, key))
        .returning({ id: itemGroups.id })
      return deleted.length > 0
    })
  }
}

async function checkName(db: DbOrTx, key: string, input: ItemGroupInput): Promise<void> {
  const [twin] = await db
    .select({ id: itemGroups.id })
    .from(itemGroups)
    .where(
      and(
        eq(itemGroups.kind, input.kind),
        eq(itemGroups.name, input.name),
        ne(itemGroups.key, key),
      ),
    )
  if (twin !== undefined) throw new ItemGroupNameTaken(input.name)
}

async function nextOrder(db: DbOrTx, kind: ItemKind): Promise<number> {
  const [row] = await db
    .select({ last: max(itemGroups.sortOrder) })
    .from(itemGroups)
    .where(eq(itemGroups.kind, kind))
  return (row?.last ?? 0) + 1
}

async function hasItems(db: DbOrTx, key: string): Promise<boolean> {
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.category, key))
    .limit(1)
  return row !== undefined
}
