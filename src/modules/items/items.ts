import { items } from '../../database/schema'
import type { DbOrTx } from '../game-data/sections'

/**
 * 아이템 분류의 첫 단인 종류. 둘째 단인 묶음은 DB 표(`item_groups`)에 두고 관리 화면에서 더한다. 종류는 앱이 가계부 아이템
 * 종류를 정하는 key 라 코드에 둔다. 앱이 모르는 종류가 생기지 않게 하려는 것이다. 장신구는 관리 화면에서 장비와 갈라 보려고 둔
 * 종류이고, 앱은 장비로 옮긴다.
 */
export const ITEM_KINDS = [
  { key: 'equipment', name: '장비' },
  { key: 'accessory', name: '장신구' },
  { key: 'consumable', name: '소비' },
  { key: 'etc', name: '기타' },
  { key: 'cash', name: '캐시' },
] as const

export type ItemKind = (typeof ITEM_KINDS)[number]['key']

export const ITEM_KIND_KEYS = ITEM_KINDS.map((k) => k.key) as [ItemKind, ...ItemKind[]]

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KIND_KEYS as readonly string[]).includes(value)
}

/** 앱이 넥슨 이름에서 key 를 얻는 규칙과 같다. NFC 로 맞추고 공백을 모두 지운다. */
export function comparableItemName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '')
}

/**
 * key 가 다른 아이템 중 비교 모양의 이름이 같은 것. 없으면 null 이다. 한 물건이 두 key 로 서면 기록이 갈리므로 쓰기 전에
 * 부른다. 표가 수백 줄이라 이름을 모두 읽어 비교한다.
 */
export async function sameNameItem(
  db: DbOrTx,
  key: string,
  name: string,
): Promise<{ key: string; isEquipment: boolean } | null> {
  const wanted = comparableItemName(name)
  const rows = await db
    .select({ key: items.key, name: items.name, isEquipment: items.isEquipment })
    .from(items)
  const hit = rows.find((r) => r.key !== key && comparableItemName(r.name) === wanted)
  return hit === undefined ? null : { key: hit.key, isEquipment: hit.isEquipment }
}
