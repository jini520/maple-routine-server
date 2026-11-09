import { asc, eq } from 'drizzle-orm'

import { gameDataSections, huntLootItems, items } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  InvalidItemCategory,
  type ItemInput,
  ItemExists,
  ItemNameTaken,
  ItemRoleRemoved,
  ItemsRepository,
} from './items.repository'

const base: ItemInput = {
  name: '거대한 공포',
  category: 'dark_boss_set',
  iconAssetId: null,
  valuable: true,
  worldBound: false,
  level: 200,
  isDrop: true,
  isEquipment: true,
}

describeDb('ItemsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: ItemsRepository
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ItemsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, ['items/giant_terror.png', 'bosses/zakum.webp'])
  })
  afterAll(() => close())

  const touched = async () =>
    (await db.select({ key: gameDataSections.key }).from(gameDataSections)).map((r) => r.key).sort()

  it('아이템을 더하고 key 차례로 내며, 그림은 id · 경로 · 파일 이름으로 낸다. 맡은 역할의 칸만 시각을 민다', async () => {
    await repo.create('giant_terror', {
      ...base,
      iconAssetId: assetIds['items/giant_terror.png'] ?? null,
    })
    await repo.create('absolab_bow', {
      ...base,
      name: '앱솔랩스 에인션트 보우',
      category: null,
      valuable: false,
      level: 160,
      isDrop: false,
    })

    const rows = await repo.adminRows()
    expect(rows.map((r) => r.key)).toEqual(['absolab_bow', 'giant_terror'])
    expect(rows[1]).toEqual({
      key: 'giant_terror',
      name: '거대한 공포',
      category: 'dark_boss_set',
      valuable: true,
      worldBound: false,
      level: 200,
      isDrop: true,
      isEquipment: true,
      huntLootKind: null,
      icon: {
        id: assetIds['items/giant_terror.png'],
        path: 'items/giant_terror.png',
        file: `${'0'.repeat(64)}.png`,
      },
    })
    expect(rows[0]?.icon).toBeNull()
    expect(await touched()).toEqual(['dropItems', 'equipmentItems'])
  })

  it('같은 key 는 ItemExists, 이름이 같은 다른 key 는 ItemNameTaken, 모르는 분류는 InvalidItemCategory, 없는 그림은 AssetNotFound 다', async () => {
    await repo.create('giant_terror', base)
    await expect(repo.create('giant_terror', base)).rejects.toBeInstanceOf(ItemExists)
    await expect(repo.create('great_terror', { ...base, name: '거대한공포' })).rejects.toThrow(
      new ItemNameTaken('giant_terror'),
    )
    await expect(
      repo.create('x', { ...base, name: 'x', category: 'equipment' }),
    ).rejects.toBeInstanceOf(InvalidItemCategory)
    await expect(
      repo.create('y', { ...base, name: 'y', iconAssetId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect((await repo.adminRows()).map((r) => r.key)).toEqual(['giant_terror'])
  })

  // 드롭 표 · 드롭 가격 기록이 key 로 가리켜, 역할을 빼면 앱에서 그 기록이 모르는 아이템이 된다.
  it('고치기는 key 를 두고 갈아 끼우고, 역할은 붙이기만 한다. 빼려 하면 ItemRoleRemoved 이고 모르는 key 는 false 다', async () => {
    await repo.create('dreamy_belt', {
      ...base,
      name: '몽환의 벨트',
      isEquipment: false,
      level: null,
    })
    await db.delete(gameDataSections)

    expect(
      await repo.update('dreamy_belt', {
        ...base,
        name: '몽환의 벨트',
        category: 'dark_boss_set',
        iconAssetId: assetIds['items/giant_terror.png'] ?? null,
        level: 200,
        isEquipment: true,
      }),
    ).toBe(true)
    const [row] = await db
      .select({ isEquipment: items.isEquipment, level: items.level })
      .from(items)
      .where(eq(items.key, 'dreamy_belt'))
    expect(row).toEqual({ isEquipment: true, level: 200 })
    expect(await touched()).toEqual(['dropItems', 'equipmentItems'])

    await expect(
      repo.update('dreamy_belt', { ...base, name: '몽환의 벨트', isDrop: false }),
    ).rejects.toThrow(new ItemRoleRemoved('isDrop'))
    expect(await repo.update('nobody', base)).toBe(false)
  })

  it('분류만 바꾸면 앱이 받는 칸의 시각을 밀지 않는다. 분류는 앱에 안 실린다', async () => {
    await repo.create('giant_terror', base)
    await db.delete(gameDataSections)
    await repo.update('giant_terror', { ...base, category: 'boss_accessory_set' })
    expect(await touched()).toEqual([])
    expect((await repo.adminRows())[0]?.category).toBe('boss_accessory_set')
  })

  it('사냥 전리품 아이템은 분류를 함께 내고, 이름을 고치면 사냥 전리품 칸의 시각도 민다', async () => {
    await repo.create('reindeer_milk', {
      ...base,
      name: '순록의 우유',
      category: null,
      valuable: false,
      level: null,
      isDrop: false,
      isEquipment: false,
    })
    const [item] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.key, 'reindeer_milk'))
    await db
      .insert(huntLootItems)
      .values({ itemId: item?.id ?? '', kind: 'consumable', npcPriceMeso: 2750, sortOrder: 0 })
    await db.delete(gameDataSections)

    await repo.update('reindeer_milk', {
      ...base,
      name: '순록의 우유!',
      category: 'potion',
      valuable: false,
      level: null,
      isDrop: false,
      isEquipment: false,
    })
    expect(await touched()).toEqual(['huntLoot'])
    const rows = await db.select({ name: items.name }).from(items).orderBy(asc(items.key))
    expect(rows).toEqual([{ name: '순록의 우유!' }])
    expect((await repo.adminRows())[0]?.huntLootKind).toBe('consumable')
  })
})
