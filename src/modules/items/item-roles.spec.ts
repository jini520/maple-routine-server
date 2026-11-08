import { asc } from 'drizzle-orm'

import { items } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { DropItemNameTaken, DropItemsRepository } from '../drop-items/drop-items.repository'
import { EquipmentItemsRepository } from '../equipment-items/equipment-items.repository'
import { HuntLootNameTaken, HuntLootRepository } from '../hunt-loot/hunt-loot.repository'

/** 드롭 아이템 · 강화 장비 · 사냥 전리품이 아이템 표 하나를 나눠 쓰는 규칙(앱 저장소 ADR-187 결정 1). */
describeDb('아이템 표의 역할', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let drops: DropItemsRepository
  let equipment: EquipmentItemsRepository
  let loot: HuntLootRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    drops = new DropItemsRepository(db)
    equipment = new EquipmentItemsRepository(db)
    loot = new HuntLootRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    await insertAssets(db, ['items/dark_boss_ring.png', 'items/sol_erda_fragment.webp'])
  })
  afterAll(() => close())

  const rowsOf = () =>
    db
      .select({
        key: items.key,
        name: items.name,
        isDrop: items.isDrop,
        isEquipment: items.isEquipment,
        level: items.level,
      })
      .from(items)
      .orderBy(asc(items.key))

  it('장비로만 있던 key 를 드롭 아이템으로 더하면 그 줄에 드롭을 얹고, 칸마다 자기 역할의 아이템만 선다', async () => {
    await equipment.create({ key: 'giant_terror', name: '거대한공포', level: 200 })
    await equipment.create({ key: 'absolab_bow', name: '앱솔랩스슈팅보우', level: 160 })
    await drops.create({
      key: 'giant_terror',
      name: '거대한 공포',
      iconFile: 'dark_boss_ring.png',
      valuable: true,
    })

    expect(await rowsOf()).toEqual([
      {
        key: 'absolab_bow',
        name: '앱솔랩스슈팅보우',
        isDrop: false,
        isEquipment: true,
        level: 160,
      },
      { key: 'giant_terror', name: '거대한 공포', isDrop: true, isEquipment: true, level: 200 },
    ])
    expect((await drops.section()).items.map((i) => i.key)).toEqual(['giant_terror'])
    expect((await equipment.section()).items.map((i) => i.key)).toEqual([
      'absolab_bow',
      'giant_terror',
    ])
  })

  it('드롭 아이템 key 를 장비로 더하면 레벨만 얹고 이름은 드롭 아이템의 띄어 쓴 것을 둔다', async () => {
    await drops.create({ key: 'giant_terror', name: '거대한 공포', iconFile: null, valuable: true })
    await equipment.create({ key: 'giant_terror', name: '거대한공포', level: 200 })
    expect(await rowsOf()).toEqual([
      { key: 'giant_terror', name: '거대한 공포', isDrop: true, isEquipment: true, level: 200 },
    ])
  })

  it('이름이 같은(NFC · 공백 제거) 다른 key 의 아이템이 있으면 드롭 아이템 · 사냥 전리품도 거절한다', async () => {
    await equipment.create({ key: 'giant_terror', name: '거대한공포', level: 200 })
    await expect(
      drops.create({ key: 'great_terror', name: '거대한 공포', iconFile: null, valuable: false }),
    ).rejects.toBeInstanceOf(DropItemNameTaken)
    await expect(
      loot.create({
        key: 'terror_loot',
        kind: 'event',
        name: '거대한 공포',
        iconFile: 'sol_erda_fragment.webp',
        npcPriceMeso: null,
        from: null,
        until: null,
      }),
    ).rejects.toBeInstanceOf(HuntLootNameTaken)
  })

  it('사냥 전리품은 같은 key 의 아이템 줄을 가리키고, 이름 · 그림을 고치면 그 줄이 바뀐다', async () => {
    await drops.create({
      key: 'sol_erda_fragment',
      name: '솔 에르다 조각',
      iconFile: null,
      valuable: false,
    })
    await loot.create({
      key: 'sol_erda_fragment',
      kind: 'fragment',
      name: '솔 에르다 조각',
      iconFile: 'sol_erda_fragment.webp',
      npcPriceMeso: null,
      from: null,
      until: null,
    })
    expect((await rowsOf()).map((r) => r.key)).toEqual(['sol_erda_fragment'])
    expect((await drops.section()).items).toEqual([
      {
        key: 'sol_erda_fragment',
        name: '솔 에르다 조각',
        iconFile: 'sol_erda_fragment.webp',
        valuable: false,
      },
    ])
  })
})
