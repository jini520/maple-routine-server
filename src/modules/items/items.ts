import { items } from '../../database/schema'
import type { DbOrTx } from '../game-data/sections'

/**
 * 아이템 분류 트리. 첫 단은 종류, 둘째 단은 묶음이고 아이템 줄은 묶음 key 하나를 든다(앱 저장소 ADR-187 결정 2). 장신구는
 * 게임 인벤토리 탭이 아니라 관리 화면에서 장비와 갈라 보려고 둔 종류다.
 * 관리 화면에서 더하거나 바꾸지 않는다. 바꾸려면 이 표를 고쳐 서버를 배포한다. DB 칸은 글자라 묶음을 더해도 이관이 없다.
 */
export const ITEM_CATEGORIES = [
  {
    key: 'equipment',
    name: '장비',
    groups: [
      { key: 'rootabyss_weapon', name: '루타비스 무기' },
      { key: 'rootabyss_armor', name: '루타비스 방어구' },
      { key: 'absolab_weapon', name: '앱솔랩스 무기' },
      { key: 'absolab_armor', name: '앱솔랩스 방어구' },
      { key: 'arcane_weapon', name: '아케인셰이드 무기' },
      { key: 'arcane_armor', name: '아케인셰이드 방어구' },
      { key: 'eternel_armor', name: '에테르넬 방어구' },
      { key: 'armor_weapon_set', name: '방어구와 무기 세트' },
      { key: 'other_armor', name: '기타 방어구' },
      { key: 'secondary_weapon', name: '보조무기' },
      { key: 'genesis_weapon', name: '제네시스 무기' },
      { key: 'destiny_weapon', name: '데스티니 무기' },
      { key: 'mechanical_heart', name: '기계 심장' },
    ],
  },
  {
    key: 'accessory',
    name: '장신구',
    groups: [
      { key: 'ring', name: '반지' },
      { key: 'pendant', name: '펜던트' },
      { key: 'earring', name: '귀고리' },
      { key: 'face_accessory', name: '얼굴 장식' },
      { key: 'shoulder_accessory', name: '어깨 장식' },
      { key: 'belt', name: '벨트' },
      { key: 'badge', name: '뱃지' },
      { key: 'dark_boss_set', name: '칠흑의 보스 세트' },
      { key: 'dawn_boss_set', name: '여명의 보스 세트' },
      { key: 'radiance_boss_set', name: '광휘의 보스 세트' },
      { key: 'boss_accessory_set', name: '보스 장신구 세트' },
      { key: 'special_skill_ring', name: '특수스킬반지' },
    ],
  },
  {
    key: 'consumable',
    name: '소비',
    groups: [
      { key: 'boss_enhancement_material', name: '보스 강화 재료' },
      { key: 'core_gemstone_symbol_coupon', name: '코어 젬스톤과 심볼 교환권' },
      { key: 'cube_scroll_flame', name: '큐브와 주문서와 불꽃' },
      { key: 'potion_elixir_coupon', name: '물약과 비약과 쿠폰' },
      { key: 'soul', name: '소울' },
      { key: 'box', name: '상자' },
      { key: 'hunt_loot', name: '사냥 전리품' },
      { key: 'boss_loot', name: '보스 전리품' },
    ],
  },
  {
    key: 'etc',
    name: '기타',
    groups: [
      { key: 'growth_material', name: '성장 재료' },
      { key: 'profession_material_tool', name: '전문기술 재료와 도구' },
    ],
  },
  { key: 'cash', name: '캐시', groups: [{ key: 'cash', name: '캐시' }] },
] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]['groups'][number]['key']

const CATEGORY_KEYS: ReadonlySet<string> = new Set(
  ITEM_CATEGORIES.flatMap((kind) => kind.groups.map((g) => g.key)),
)

export function isItemCategory(value: string): value is ItemCategory {
  return CATEGORY_KEYS.has(value)
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
