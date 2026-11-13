/**
 * 0041 이관을 진짜 Postgres 에서 본다. 0040 까지 올린 새 DB 에 아이템을 넣고 0041 을 적용한다.
 * 묶음을 코드의 상수 표에서 DB 표로 옮기는 이관이라, 운영의 아이템 줄이 든 묶음 key 가 모두 표에 있어야 FK 가 선다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0040_items_section'
const AFTER = '0041_item_groups'

/** 이관 전 서버 코드(`ITEM_CATEGORIES`)의 트리. 종류 · key · 이름이 이 차례로 표에 서야 한다. */
const CODE_TREE: [string, string, string][] = [
  ['equipment', 'rootabyss_weapon', '루타비스 무기'],
  ['equipment', 'rootabyss_armor', '루타비스 방어구'],
  ['equipment', 'absolab_weapon', '앱솔랩스 무기'],
  ['equipment', 'absolab_armor', '앱솔랩스 방어구'],
  ['equipment', 'arcane_weapon', '아케인셰이드 무기'],
  ['equipment', 'arcane_armor', '아케인셰이드 방어구'],
  ['equipment', 'eternel_armor', '에테르넬 방어구'],
  ['equipment', 'armor_weapon_set', '방어구와 무기 세트'],
  ['equipment', 'other_armor', '기타 방어구'],
  ['equipment', 'secondary_weapon', '보조무기'],
  ['equipment', 'genesis_weapon', '제네시스 무기'],
  ['equipment', 'destiny_weapon', '데스티니 무기'],
  ['equipment', 'mechanical_heart', '기계 심장'],
  ['accessory', 'ring', '반지'],
  ['accessory', 'pendant', '펜던트'],
  ['accessory', 'earring', '귀고리'],
  ['accessory', 'face_accessory', '얼굴 장식'],
  ['accessory', 'shoulder_accessory', '어깨 장식'],
  ['accessory', 'belt', '벨트'],
  ['accessory', 'badge', '뱃지'],
  ['accessory', 'dark_boss_set', '칠흑의 보스 세트'],
  ['accessory', 'dawn_boss_set', '여명의 보스 세트'],
  ['accessory', 'radiance_boss_set', '광휘의 보스 세트'],
  ['accessory', 'boss_accessory_set', '보스 장신구 세트'],
  ['accessory', 'special_skill_ring', '특수스킬반지'],
  ['consumable', 'boss_enhancement_material', '보스 강화 재료'],
  ['consumable', 'core_gemstone', '코어 젬스톤'],
  ['consumable', 'symbol_coupon', '심볼 교환권'],
  ['consumable', 'scroll', '주문서'],
  ['consumable', 'potion', '물약'],
  ['consumable', 'soul', '소울'],
  ['consumable', 'box', '상자'],
  ['consumable', 'hunt_loot', '사냥 전리품'],
  ['consumable', 'boss_loot', '보스 전리품'],
  ['etc', 'growth_material', '성장 재료'],
  ['etc', 'profession_material_tool', '전문기술 재료와 도구'],
  ['etc', 'etc_boss_loot', '보스 전리품'],
  ['cash', 'cash', '캐시'],
]

describeDb('0041 아이템 묶음 표', () => {
  const name = `mig_item_groups_${process.pid}_${Date.now()}`
  let admin: Pool
  let pool: Pool
  let db: NodePgDatabase
  let folders: Record<typeof BEFORE | typeof AFTER, string>
  let cleanup: () => void

  beforeAll(async () => {
    admin = new Pool({ connectionString: TEST_DATABASE_URL })
    ;({ folders, cleanup } = migrationFoldersUpTo([BEFORE, AFTER]))
  })
  beforeEach(async () => {
    await admin.query(`CREATE DATABASE ${name}`)
    const url = new URL(TEST_DATABASE_URL ?? '')
    url.pathname = `/${name}`
    pool = new Pool({ connectionString: url.toString() })
    db = drizzle(pool)
    await migrate(db, { migrationsFolder: folders[BEFORE] })
  })
  afterEach(async () => {
    await pool.end()
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
  })
  afterAll(async () => {
    cleanup()
    await admin.end()
  })

  it('코드 트리의 38묶음을 같은 차례로 넣고, 아이템의 묶음 key 는 그대로 이어진다', async () => {
    await pool.query(
      `INSERT INTO items (key, name, category) VALUES ('red_cube', '레드 큐브', 'cash'), ('reindeer_milk', '순록의 우유', NULL)`,
    )
    await migrate(db, { migrationsFolder: folders[AFTER] })
    const { rows } = await pool.query<{ kind: string; key: string; name: string }>(
      `SELECT kind, key, name FROM item_groups
       ORDER BY array_position(ARRAY['equipment','accessory','consumable','etc','cash'], kind), sort_order`,
    )
    expect(rows.map((r) => [r.kind, r.key, r.name])).toEqual(CODE_TREE)
    expect((await pool.query(`SELECT key, category FROM items ORDER BY key`)).rows).toEqual([
      { key: 'red_cube', category: 'cash' },
      { key: 'reindeer_milk', category: null },
    ])
  })

  it('표에 없는 묶음을 든 아이템이 있으면 멈춘다', async () => {
    await pool.query(`INSERT INTO items (key, name, category) VALUES ('ghost', '유령', 'nowhere')`)
    await expect(migrate(db, { migrationsFolder: folders[AFTER] })).rejects.toThrow()
  })
})
