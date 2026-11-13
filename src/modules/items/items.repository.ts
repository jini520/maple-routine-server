import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, isNotNull } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets, huntLootItems, items } from '../../database/schema'
import { parseAssetPath, storedFileName } from '../assets/asset-paths'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, type SectionKey, sectionUpdatedAt, touchSection } from '../game-data/sections'
import type { HuntLootKind } from '../hunt-loot/hunt-loot.repository'
import { isItemCategory, type ItemKind, kindOfCategory, sameNameItem } from './items'

/** 관리 화면 아이템 줄. 그림은 미리보기 주소(`/assets/<file>`)를 만들 파일 이름까지 든다. */
export interface ItemAdminRow {
  key: string
  name: string
  category: string | null
  valuable: boolean
  worldBound: boolean
  level: number | null
  isDrop: boolean
  isEquipment: boolean
  /** 사냥 전리품이면 그 분류. 분류 · NPC 가격 · 기간은 사냥 전리품 화면이 고친다. */
  huntLootKind: HuntLootKind | null
  icon: { id: string; path: string; file: string } | null
}

/** 더하기 · 고치기 본문. key 는 따로 받는다. 기록이 key 를 들어 못 바꾸기 때문이다. */
export interface ItemInput {
  name: string
  category: string | null
  iconAssetId: string | null
  valuable: boolean
  worldBound: boolean
  level: number | null
  isDrop: boolean
  isEquipment: boolean
}

/** GET /v1/game-data 의 items 칸 줄. 종류는 분류 트리의 첫 단이다. */
export interface ItemView {
  key: string
  name: string
  kind: ItemKind
  category: string
  iconAssetId: string | null
}

/**
 * 분류가 있는 아이템 전부. 앱의 아이템 고르기가 여기서 고른다. 상자를 빼고 종류를 가계부 아이템 종류로 옮기는 일은 앱이
 * 한다. 고르기 규칙이 바뀌어도 서버 배포 없이 앱만 고치면 되게 하려는 것이다.
 */
export interface ItemsSection {
  updatedAt: string | null
  items: ItemView[]
}

const KO = new Intl.Collator('ko')

/** 같은 key 의 아이템이 이미 있다. */
export class ItemExists extends Error {}
/** 비교 모양의 이름이 같은 아이템이 다른 key 로 있다. message 가 그 아이템의 key 다. */
export class ItemNameTaken extends Error {}
/** 분류 트리에 없는 묶음 key 다. message 가 그 값이다. */
export class InvalidItemCategory extends Error {}
/** 붙은 역할을 빼려 했다. message 가 그 칸(`isDrop` · `isEquipment`)이다. */
export class ItemRoleRemoved extends Error {}

/**
 * 관리 화면의 아이템 표. 드롭 아이템 · 강화 장비 · 사냥 전리품이 한 줄을 나눠 쓴다(앱 저장소 ADR-187 결정 1). 줄을 지우지
 * 않고, 역할은 붙이기만 한다. 드롭 표 · 드롭 가격 기록이 key 로 가리켜 역할을 빼면 앱에서 모르는 아이템이 되기 때문이다.
 */
@Injectable()
export class ItemsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 이름 차례. 앱의 찾기는 맞은 자리가 같으면 받은 차례를 지켜 이 차례가 결과의 차례가 된다. DB 정렬은 로캘마다 달라
   * 여기서 한국어 차례로 줄 세운다.
   */
  async section(): Promise<ItemsSection> {
    const rows = await this.db
      .select({
        key: items.key,
        name: items.name,
        category: items.category,
        iconAssetId: items.iconAssetId,
      })
      .from(items)
      .where(isNotNull(items.category))
    const views = rows.flatMap(({ category, ...r }) => {
      const kind = category === null ? null : kindOfCategory(category)
      return kind === null || category === null ? [] : [{ ...r, kind, category }]
    })
    views.sort((a, b) => KO.compare(a.name, b.name) || KO.compare(a.key, b.key))
    return { updatedAt: await sectionUpdatedAt(this.db, 'items'), items: views }
  }

  async adminRows(): Promise<ItemAdminRow[]> {
    const rows = await this.db
      .select({
        key: items.key,
        name: items.name,
        category: items.category,
        valuable: items.valuable,
        worldBound: items.worldBound,
        level: items.level,
        isDrop: items.isDrop,
        isEquipment: items.isEquipment,
        huntLootKind: huntLootItems.kind,
        iconId: assets.id,
        iconPath: assets.path,
        iconSha: assets.sha256,
      })
      .from(items)
      .leftJoin(assets, eq(assets.id, items.iconAssetId))
      .leftJoin(huntLootItems, eq(huntLootItems.itemId, items.id))
      .orderBy(asc(items.key))
    return rows.map(({ iconId, iconPath, iconSha, ...r }) => ({
      ...r,
      icon:
        iconId === null || iconPath === null || iconSha === null
          ? null
          : {
              id: iconId,
              path: iconPath,
              file: storedFileName(iconSha, parseAssetPath(iconPath)?.ext ?? 'png'),
            },
    }))
  }

  /** 같은 key 는 ItemExists, 이름이 같은 다른 key 는 ItemNameTaken, 모르는 분류는 InvalidItemCategory, 없는 그림은 AssetNotFound 다. */
  async create(key: string, input: ItemInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [same] = await tx.select({ id: items.id }).from(items).where(eq(items.key, key))
      if (same !== undefined) throw new ItemExists(key)
      await check(tx, key, input)
      await tx.insert(items).values({ key, ...input })
      await touchAll(tx, [
        ...sectionsOf(input, false),
        ...(input.category === null ? [] : (['items'] as const)),
      ])
    })
  }

  /** 모르는 key 는 false 다. 역할을 빼면 ItemRoleRemoved 이고 나머지 실패는 create 와 같다. */
  async update(key: string, input: ItemInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: items.id,
          name: items.name,
          category: items.category,
          iconAssetId: items.iconAssetId,
          valuable: items.valuable,
          level: items.level,
          isDrop: items.isDrop,
          isEquipment: items.isEquipment,
        })
        .from(items)
        .where(eq(items.key, key))
      if (current === undefined) return false
      if (current.isDrop && !input.isDrop) throw new ItemRoleRemoved('isDrop')
      if (current.isEquipment && !input.isEquipment) throw new ItemRoleRemoved('isEquipment')
      await check(tx, key, input)
      await tx
        .update(items)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(items.id, current.id))
      // 칸마다 실리는 값이 다르다. 바뀐 값이 실린 칸의 시각만 민다. 월드 간 거래 불가는 어느 칸에도 안 실린다.
      const roleVisible =
        current.name !== input.name ||
        current.iconAssetId !== input.iconAssetId ||
        current.valuable !== input.valuable ||
        current.level !== input.level ||
        current.isDrop !== input.isDrop ||
        current.isEquipment !== input.isEquipment
      // 분류를 떼면 items 칸에서 빠지므로 그때도 민다.
      const catalogVisible =
        (current.category !== null || input.category !== null) &&
        (current.name !== input.name ||
          current.iconAssetId !== input.iconAssetId ||
          current.category !== input.category)
      if (roleVisible) {
        const [loot] = await tx
          .select({ id: huntLootItems.id })
          .from(huntLootItems)
          .where(eq(huntLootItems.itemId, current.id))
        await touchAll(tx, sectionsOf(input, loot !== undefined))
      }
      if (catalogVisible) await touchSection(tx, 'items')
      return true
    })
  }
}

async function check(db: DbOrTx, key: string, input: ItemInput): Promise<void> {
  if (input.category !== null && !isItemCategory(input.category))
    throw new InvalidItemCategory(input.category)
  const twin = await sameNameItem(db, key, input.name)
  if (twin !== null) throw new ItemNameTaken(twin.key)
  if (input.iconAssetId !== null) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, input.iconAssetId))
    if (asset === undefined) throw new AssetNotFound(input.iconAssetId)
  }
}

/** 그 아이템이 실리는 앱 칸. */
function sectionsOf(input: ItemInput, isHuntLoot: boolean): SectionKey[] {
  return [
    ...(input.isDrop ? (['dropItems'] as const) : []),
    ...(input.isEquipment ? (['equipmentItems'] as const) : []),
    ...(isHuntLoot ? (['huntLoot'] as const) : []),
  ]
}

async function touchAll(db: DbOrTx, keys: readonly SectionKey[]): Promise<void> {
  for (const key of keys) await touchSection(db, key)
}
