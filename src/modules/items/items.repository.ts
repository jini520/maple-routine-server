import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { DB, type Db } from '../../database/database.module'
import {
  assets,
  huntLootItems,
  itemGroups,
  items,
  ringLevelItems,
  sameItemLinks,
} from '../../database/schema'
import { storedFileName } from '../assets/asset-paths'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'
import type { HuntLootKind } from '../hunt-loot/hunt-loot.repository'
import { type ItemKind, sameNameItem } from './items'

/** 관리 화면 아이템 줄. 그림은 미리보기 주소(`/assets/<file>`)를 만들 파일 이름까지 든다. */
export interface ItemAdminRow {
  key: string
  name: string
  /** 묶음 key. 관리 화면은 묶음을 key 로 다룬다. */
  groupKey: string | null
  isValuable: boolean
  requiredLevel: number | null
  isDrop: boolean
  isEquipment: boolean
  /** 사냥 전리품이면 그 분류. 분류 · NPC 가격 · 기간은 사냥 전리품 화면이 고친다. */
  huntLootKind: HuntLootKind | null
  icon: { id: string; fileName: string; extension: string; file: string } | null
  /** 원래 아이템을 따라 바뀌는 줄(반지 레벨 줄 · 같은 물건의 따로 둔 줄)이면 그 원래 아이템의 key. 직접 고치지 않는다. */
  followsKey: string | null
}

/** 더하기 · 고치기 본문. key 는 따로 받는다. 기록이 key 를 들어 못 바꾸기 때문이다. */
export interface ItemInput {
  name: string
  groupKey: string | null
  iconAssetId: string | null
  isValuable: boolean
  requiredLevel: number | null
  isDrop: boolean
  isEquipment: boolean
}

/** 게임 데이터 items 칸의 아이템 한 줄. 칸 이름은 표의 칸 이름을 따르고, 기록은 id 로 가리킨다. */
export interface ItemView {
  id: string
  key: string
  name: string
  groupId: string | null
  iconAssetId: string | null
  isValuable: boolean
  isDrop: boolean
  isEquipment: boolean
  requiredLevel: number | null
}

export interface ItemGroupView {
  id: string
  key: string
  type: ItemKind
  name: string
  sortOrder: number
}

/**
 * GET /v1/game-data 의 items 칸. 아이템 표 전부와 묶음 · 반지 레벨 · 같은 물건 연결을 함께 싣는다. 아이템을 고르는 목록은
 * 원래 줄만 쓰고, 상자를 빼고 종류를 가계부 아이템 종류로 옮기는 일은 앱이 한다.
 */
export interface ItemsSection {
  updatedAt: string | null
  items: ItemView[]
  groups: ItemGroupView[]
  ringLevelItems: { itemId: string; ringItemId: string; ringLevel: number }[]
  sameItemLinks: { itemId: string; originalItemId: string }[]
}

const KO = new Intl.Collator('ko')

/** 같은 key 의 아이템이 이미 있다. */
export class ItemExists extends Error {}
/** 비교 모양의 이름이 같은 아이템이 다른 key 로 있다. message 가 그 아이템의 key 다. */
export class ItemNameTaken extends Error {}
/** 묶음 표에 없는 묶음 key 다. message 가 그 값이다. */
export class InvalidItemGroup extends Error {}
/** 붙은 역할을 빼려 했다. message 가 그 칸(`isDrop` · `isEquipment`)이다. */
export class ItemRoleRemoved extends Error {}
/** 원래 아이템을 따라 바뀌는 줄을 직접 고치려 했다. message 가 그 원래 아이템의 key 다. */
export class FollowingItem extends Error {}

const ringItem = alias(items, 'ring_item')
const originalItem = alias(items, 'original_item')

/**
 * 관리 화면의 아이템 표. 드롭 아이템 · 강화 장비 · 사냥 전리품 · 반지 레벨 줄이 한 표를 나눠 쓴다. 줄을 지우지 않고, 역할은
 * 붙이기만 한다. 기록이 줄을 가리켜 역할을 빼면 앱에서 모르는 아이템이 되기 때문이다.
 */
@Injectable()
export class ItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 아이템은 이름 차례. 앱의 찾기는 맞은 자리가 같으면 받은 차례를 지켜 이 차례가 결과의 차례가 된다. DB 정렬은 로캘마다 달라
   * 여기서 한국어 차례로 줄 세운다.
   */
  async section(): Promise<ItemsSection> {
    const [itemRows, groups, ringLevels, links, updatedAt] = await Promise.all([
      this.db
        .select({
          id: items.id,
          key: items.key,
          name: items.name,
          groupId: items.groupId,
          iconAssetId: items.iconAssetId,
          isValuable: items.isValuable,
          isDrop: items.isDrop,
          isEquipment: items.isEquipment,
          requiredLevel: items.requiredLevel,
        })
        .from(items),
      this.db
        .select({
          id: itemGroups.id,
          key: itemGroups.key,
          type: itemGroups.type,
          name: itemGroups.name,
          sortOrder: itemGroups.sortOrder,
        })
        .from(itemGroups)
        .orderBy(asc(itemGroups.type), asc(itemGroups.sortOrder), asc(itemGroups.key)),
      this.db
        .select({
          itemId: ringLevelItems.itemId,
          ringItemId: ringLevelItems.ringItemId,
          ringLevel: ringLevelItems.ringLevel,
        })
        .from(ringLevelItems)
        .orderBy(asc(ringLevelItems.ringItemId), asc(ringLevelItems.ringLevel)),
      this.db
        .select({ itemId: sameItemLinks.itemId, originalItemId: sameItemLinks.originalItemId })
        .from(sameItemLinks)
        .orderBy(asc(sameItemLinks.originalItemId), asc(sameItemLinks.itemId)),
      sectionUpdatedAt(this.db, 'items'),
    ])
    itemRows.sort((a, b) => KO.compare(a.name, b.name) || KO.compare(a.key, b.key))
    return { updatedAt, items: itemRows, groups, ringLevelItems: ringLevels, sameItemLinks: links }
  }

  async adminRows(): Promise<ItemAdminRow[]> {
    const rows = await this.db
      .select({
        key: items.key,
        name: items.name,
        groupKey: itemGroups.key,
        isValuable: items.isValuable,
        requiredLevel: items.requiredLevel,
        isDrop: items.isDrop,
        isEquipment: items.isEquipment,
        huntLootKind: huntLootItems.kind,
        icon: {
          id: assets.id,
          fileName: assets.fileName,
          extension: assets.extension,
          sha256: assets.sha256,
        },
        ringKey: ringItem.key,
        originalKey: originalItem.key,
      })
      .from(items)
      .leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
      .leftJoin(assets, eq(assets.id, items.iconAssetId))
      .leftJoin(huntLootItems, eq(huntLootItems.itemId, items.id))
      .leftJoin(ringLevelItems, eq(ringLevelItems.itemId, items.id))
      .leftJoin(ringItem, eq(ringItem.id, ringLevelItems.ringItemId))
      .leftJoin(sameItemLinks, eq(sameItemLinks.itemId, items.id))
      .leftJoin(originalItem, eq(originalItem.id, sameItemLinks.originalItemId))
      .orderBy(asc(items.key))
    return rows.map(({ icon, ringKey, originalKey, ...r }) => ({
      ...r,
      icon:
        icon === null
          ? null
          : {
              id: icon.id,
              fileName: icon.fileName,
              extension: icon.extension,
              file: storedFileName(icon.sha256, icon.extension),
            },
      followsKey: ringKey ?? originalKey,
    }))
  }

  /**
   * 같은 key 는 ItemExists, 이름이 같은 다른 key 는 ItemNameTaken, 모르는 묶음은 InvalidItemGroup, 없는 그림은 AssetNotFound
   * 다.
   */
  async create(key: string, input: ItemInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [same] = await tx.select({ id: items.id }).from(items).where(eq(items.key, key))
      if (same !== undefined) throw new ItemExists(key)
      await tx.insert(items).values({ key, ...(await columnsOf(tx, key, input)) })
      await touchSection(tx, 'items')
    })
  }

  /**
   * 원래 아이템을 고치면 같은 저장에서 그 아이템을 따라 바뀌는 줄도 고친다. 같은 물건의 따로 둔 줄은 값을 모두 따르고, 반지
   * 레벨 줄은 그림 · 묶음 · 고가 여부를 따르며 이름이 `<반지 이름> lv.N` 이 된다. 모르는 key 는 false 다. 따라 바뀌는 줄을
   * 직접 고치면 FollowingItem, 역할을 빼면 ItemRoleRemoved 이고 나머지 실패는 create 와 같다.
   */
  async update(key: string, input: ItemInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: items.id,
          name: items.name,
          iconAssetId: items.iconAssetId,
          isDrop: items.isDrop,
          isEquipment: items.isEquipment,
          ringKey: ringItem.key,
          originalKey: originalItem.key,
        })
        .from(items)
        .leftJoin(ringLevelItems, eq(ringLevelItems.itemId, items.id))
        .leftJoin(ringItem, eq(ringItem.id, ringLevelItems.ringItemId))
        .leftJoin(sameItemLinks, eq(sameItemLinks.itemId, items.id))
        .leftJoin(originalItem, eq(originalItem.id, sameItemLinks.originalItemId))
        .where(eq(items.key, key))
      if (current === undefined) return false
      const follows = current.ringKey ?? current.originalKey
      if (follows !== null) throw new FollowingItem(follows)
      if (current.isDrop && !input.isDrop) throw new ItemRoleRemoved('isDrop')
      if (current.isEquipment && !input.isEquipment) throw new ItemRoleRemoved('isEquipment')
      const columns = await columnsOf(tx, key, input)
      const updatedAt = new Date()
      await tx
        .update(items)
        .set({ ...columns, updatedAt })
        .where(eq(items.id, current.id))
      const copies = await tx
        .select({ itemId: sameItemLinks.itemId })
        .from(sameItemLinks)
        .where(eq(sameItemLinks.originalItemId, current.id))
      for (const copy of copies)
        await tx
          .update(items)
          .set({ ...columns, updatedAt })
          .where(eq(items.id, copy.itemId))
      const levels = await tx
        .select({ itemId: ringLevelItems.itemId, ringLevel: ringLevelItems.ringLevel })
        .from(ringLevelItems)
        .where(eq(ringLevelItems.ringItemId, current.id))
      for (const level of levels)
        await tx
          .update(items)
          .set({
            name: `${columns.name} lv.${level.ringLevel}`,
            groupId: columns.groupId,
            iconAssetId: columns.iconAssetId,
            isValuable: columns.isValuable,
            updatedAt,
          })
          .where(eq(items.id, level.itemId))
      await touchSection(tx, 'items')
      // 사냥 전리품 칸은 아이템의 이름과 그림을 함께 낸다.
      if (current.name !== input.name || current.iconAssetId !== input.iconAssetId) {
        const [loot] = await tx
          .select({ id: huntLootItems.id })
          .from(huntLootItems)
          .where(eq(huntLootItems.itemId, current.id))
        if (loot !== undefined) await touchSection(tx, 'huntLoot')
      }
      return true
    })
  }
}

/** 본문을 검사하고 표의 칸으로 바꾼다. 묶음 key 를 묶음 줄 id 로 푼다. */
async function columnsOf(db: DbOrTx, key: string, input: ItemInput) {
  let groupId: string | null = null
  if (input.groupKey !== null) {
    const [group] = await db
      .select({ id: itemGroups.id })
      .from(itemGroups)
      .where(eq(itemGroups.key, input.groupKey))
    if (group === undefined) throw new InvalidItemGroup(input.groupKey)
    groupId = group.id
  }
  const twin = await sameNameItem(db, key, input.name)
  if (twin !== null) throw new ItemNameTaken(twin.key)
  if (input.iconAssetId !== null) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, input.iconAssetId))
    if (asset === undefined) throw new AssetNotFound(input.iconAssetId)
  }
  return {
    name: input.name,
    groupId,
    iconAssetId: input.iconAssetId,
    isValuable: input.isValuable,
    requiredLevel: input.requiredLevel,
    isDrop: input.isDrop,
    isEquipment: input.isEquipment,
  }
}
