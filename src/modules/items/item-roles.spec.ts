import { asc } from 'drizzle-orm'

import { items } from '../../database/schema'
import {
  describeDb,
  insertAssets,
  insertItems,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { DropItemsRepository } from '../drop-items/drop-items.repository'
import { EquipmentItemsRepository } from '../equipment-items/equipment-items.repository'
import { HuntLootNameTaken, HuntLootRepository } from '../hunt-loot/hunt-loot.repository'
import { type ItemInput, ItemNameTaken, ItemsRepository } from './items.repository'

/** 드롭 아이템 · 강화 장비 · 사냥 전리품이 아이템 표 하나를 나눠 쓰는 규칙(앱 저장소 ADR-187 결정 1). */
describeDb('아이템 표의 역할', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: ItemsRepository
  let drops: DropItemsRepository
  let equipment: EquipmentItemsRepository
  let loot: HuntLootRepository
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ItemsRepository(db)
    drops = new DropItemsRepository(db)
    equipment = new EquipmentItemsRepository(db)
    loot = new HuntLootRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, ['items/sol_erda_fragment.webp'])
  })
  afterAll(() => close())

  const terror: ItemInput = {
    name: '거대한 공포',
    category: null,
    iconAssetId: null,
    valuable: true,
    worldBound: false,
    level: 200,
    isDrop: false,
    isEquipment: true,
  }

  it('강화 장비로만 있던 아이템에 드롭을 붙이면 그 줄 하나가 두 칸에 서고, 칸마다 자기 역할의 아이템만 선다', async () => {
    await repo.create('giant_terror', terror)
    await repo.create('absolab_bow', {
      ...terror,
      name: '앱솔랩스 슈팅보우',
      valuable: false,
      level: 160,
    })
    await repo.update('giant_terror', { ...terror, isDrop: true })

    expect(
      await db
        .select({ key: items.key, isDrop: items.isDrop, isEquipment: items.isEquipment })
        .from(items)
        .orderBy(asc(items.key)),
    ).toEqual([
      { key: 'absolab_bow', isDrop: false, isEquipment: true },
      { key: 'giant_terror', isDrop: true, isEquipment: true },
    ])
    expect((await drops.section()).items.map((i) => i.key)).toEqual(['giant_terror'])
    expect((await equipment.section()).items.map((i) => i.key)).toEqual([
      'absolab_bow',
      'giant_terror',
    ])
  })

  it('이름이 같은(NFC · 공백 제거) 다른 key 의 아이템이 있으면 아이템 화면 · 사냥 전리품 모두 거절한다', async () => {
    await repo.create('giant_terror', terror)
    await expect(
      repo.create('great_terror', { ...terror, name: '거대한공포' }),
    ).rejects.toBeInstanceOf(ItemNameTaken)
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

  it('사냥 전리품은 같은 key 의 아이템 줄을 가리킨다. 드롭 아이템과 같은 줄이면 드롭 칸에도 그 그림이 선다', async () => {
    await insertItems(db, [{ key: 'sol_erda_fragment', name: '솔 에르다 조각', isDrop: true }])
    await loot.create({
      key: 'sol_erda_fragment',
      kind: 'fragment',
      name: '솔 에르다 조각',
      iconFile: 'sol_erda_fragment.webp',
      npcPriceMeso: null,
      from: null,
      until: null,
    })
    expect(await db.select({ key: items.key }).from(items)).toEqual([{ key: 'sol_erda_fragment' }])
    expect((await drops.section()).items).toEqual([
      {
        key: 'sol_erda_fragment',
        name: '솔 에르다 조각',
        iconFile: 'sol_erda_fragment.webp',
        iconAssetId: assetIds['items/sol_erda_fragment.webp'],
        valuable: false,
      },
    ])
  })
})
