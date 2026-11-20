import { eq } from 'drizzle-orm'

import {
  gameDataSections,
  huntLootItems,
  items,
  ringLevelItems,
  sameItemLinks,
} from '../../database/schema'
import {
  describeDb,
  insertAssets,
  itemGroupId,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  FollowingItem,
  InvalidItemGroup,
  type ItemInput,
  ItemExists,
  ItemNameTaken,
  ItemRoleRemoved,
  ItemsRepository,
} from './items.repository'

const base: ItemInput = {
  name: '거대한 공포',
  groupKey: 'dark_boss_set',
  iconAssetId: null,
  isValuable: true,
  requiredLevel: 200,
  isDrop: true,
  isEquipment: true,
}

const ring: ItemInput = {
  name: '리스트레인트 링',
  groupKey: 'special_skill_ring',
  iconAssetId: null,
  isValuable: false,
  requiredLevel: null,
  isDrop: true,
  isEquipment: false,
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
    assetIds = await insertAssets(db, ['items/giant_terror.png', 'items/rings/restraint.png'])
  })
  afterAll(() => close())

  const touched = async () =>
    (await db.select({ key: gameDataSections.key }).from(gameDataSections)).map((r) => r.key).sort()
  const idOf = async (key: string) =>
    (await db.select({ id: items.id }).from(items).where(eq(items.key, key)))[0]?.id ?? ''

  /** 반지 하나와 그 레벨 줄 둘, 같은 물건으로 이은 연마석 둘. 옮기기가 만드는 모양이다. */
  async function linkedRows(): Promise<void> {
    await repo.create('restraint_ring', ring)
    await repo.create('life_whetstone', {
      ...ring,
      name: '생명의 연마석',
      groupKey: 'boss_loot',
      isValuable: true,
    })
    const [lv1, lv2, boxed] = await db
      .insert(items)
      .values([
        { key: 'restraint_ring_lv1', name: '리스트레인트 링 lv.1', isDrop: true },
        { key: 'restraint_ring_lv2', name: '리스트레인트 링 lv.2', isDrop: true },
        { key: 'life_whetstone_from_box', name: '생명의 연마석', isDrop: true, isValuable: true },
      ])
      .returning({ id: items.id })
    await db.insert(ringLevelItems).values([
      { itemId: lv1?.id ?? '', ringItemId: await idOf('restraint_ring'), ringLevel: 1 },
      { itemId: lv2?.id ?? '', ringItemId: await idOf('restraint_ring'), ringLevel: 2 },
    ])
    await db
      .insert(sameItemLinks)
      .values({ itemId: boxed?.id ?? '', originalItemId: await idOf('life_whetstone') })
  }

  it('아이템을 더하면 관리 줄은 key 차례로 묶음 key 와 그림을 들고, items 칸의 시각을 민다', async () => {
    await repo.create('giant_terror', {
      ...base,
      iconAssetId: assetIds['items/giant_terror.png'] ?? null,
    })
    await repo.create('absolab_bow', { ...base, name: '앱솔랩스 슈팅보우', groupKey: null })

    const rows = await repo.adminRows()
    expect(rows.map((r) => r.key)).toEqual(['absolab_bow', 'giant_terror'])
    expect(rows[1]).toEqual({
      key: 'giant_terror',
      name: '거대한 공포',
      groupKey: 'dark_boss_set',
      isValuable: true,
      requiredLevel: 200,
      isDrop: true,
      isEquipment: true,
      huntLootKind: null,
      icon: {
        id: assetIds['items/giant_terror.png'],
        fileName: 'giant_terror',
        extension: 'png',
        file: `${'0'.repeat(64)}.png`,
      },
      followsKey: null,
    })
    expect(await touched()).toEqual(['items'])
  })

  it('같은 key 는 ItemExists, 이름이 같은 다른 key 는 ItemNameTaken, 모르는 묶음은 InvalidItemGroup, 없는 그림은 AssetNotFound 다', async () => {
    await repo.create('giant_terror', base)
    await expect(repo.create('giant_terror', base)).rejects.toBeInstanceOf(ItemExists)
    await expect(
      repo.create('great_terror', { ...base, name: '거대한공포' }),
    ).rejects.toBeInstanceOf(ItemNameTaken)
    await expect(
      repo.create('x', { ...base, name: 'x', groupKey: 'nobody' }),
    ).rejects.toBeInstanceOf(InvalidItemGroup)
    await expect(
      repo.create('y', { ...base, name: 'y', iconAssetId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(AssetNotFound)
  })

  it('고치기는 key 를 두고 갈아 끼우고, 역할은 붙이기만 한다. 빼려 하면 ItemRoleRemoved 이고 모르는 key 는 false 다', async () => {
    await repo.create('giant_terror', base)
    expect(
      await repo.update('giant_terror', { ...base, name: '거대한 공포!', groupKey: null }),
    ).toBe(true)
    await expect(repo.update('giant_terror', { ...base, isDrop: false })).rejects.toBeInstanceOf(
      ItemRoleRemoved,
    )
    expect(await repo.update('nobody', base)).toBe(false)
    const [row] = await db.select().from(items).where(eq(items.key, 'giant_terror'))
    expect(row).toMatchObject({ name: '거대한 공포!', groupId: null, isDrop: true })
  })

  it('items 칸은 아이템 전부를 이름 차례로 칸 이름 그대로 내고, 묶음 · 반지 레벨 · 같은 물건 연결을 함께 낸다', async () => {
    await linkedRows()
    await repo.create('giant_terror', base)

    const section = await repo.section()
    expect(section.items.map((i) => i.key)).toEqual([
      'giant_terror',
      'restraint_ring',
      'restraint_ring_lv1',
      'restraint_ring_lv2',
      'life_whetstone',
      'life_whetstone_from_box',
    ])
    expect(section.items[0]).toEqual({
      id: await idOf('giant_terror'),
      key: 'giant_terror',
      name: '거대한 공포',
      groupId: await itemGroupId(db, 'dark_boss_set'),
      iconAssetId: null,
      isValuable: true,
      isDrop: true,
      isEquipment: true,
      requiredLevel: 200,
    })
    expect(section.groups.find((g) => g.key === 'dark_boss_set')).toMatchObject({
      id: await itemGroupId(db, 'dark_boss_set'),
      type: 'accessory',
    })
    expect(section.ringLevelItems).toEqual(
      expect.arrayContaining([
        {
          itemId: await idOf('restraint_ring_lv2'),
          ringItemId: await idOf('restraint_ring'),
          ringLevel: 2,
        },
      ]),
    )
    expect(section.sameItemLinks).toEqual([
      {
        itemId: await idOf('life_whetstone_from_box'),
        originalItemId: await idOf('life_whetstone'),
      },
    ])
  })

  // 읽는 쪽이 연결을 따라가지 않고 그 줄의 값을 그대로 쓰므로 원래 줄과 어긋나면 안 된다.
  it('원래 아이템을 고치면 같은 물건 줄은 값을 모두 따르고, 반지 레벨 줄은 그림 · 묶음 · 고가 여부와 lv 이름을 따른다', async () => {
    await linkedRows()
    const icon = assetIds['items/rings/restraint.png'] ?? null

    await repo.update('restraint_ring', {
      ...ring,
      name: '리스트레인트링',
      iconAssetId: icon,
      isValuable: true,
    })
    await repo.update('life_whetstone', {
      ...ring,
      name: '생명의 연마석!',
      groupKey: 'boss_loot',
      iconAssetId: icon,
      isValuable: false,
    })

    const row = async (key: string) => (await db.select().from(items).where(eq(items.key, key)))[0]
    expect(await row('restraint_ring_lv2')).toMatchObject({
      name: '리스트레인트링 lv.2',
      groupId: await itemGroupId(db, 'special_skill_ring'),
      iconAssetId: icon,
      isValuable: true,
      isEquipment: false,
    })
    expect(await row('life_whetstone_from_box')).toMatchObject({
      name: '생명의 연마석!',
      groupId: await itemGroupId(db, 'boss_loot'),
      iconAssetId: icon,
      isValuable: false,
    })
  })

  it('따라 바뀌는 줄은 관리 줄이 원래 아이템 key 를 들고, 직접 고치면 FollowingItem 이다', async () => {
    await linkedRows()

    const rows = new Map((await repo.adminRows()).map((r) => [r.key, r.followsKey]))
    expect(rows.get('restraint_ring_lv1')).toBe('restraint_ring')
    expect(rows.get('life_whetstone_from_box')).toBe('life_whetstone')
    expect(rows.get('restraint_ring')).toBeNull()
    await expect(repo.update('restraint_ring_lv1', ring)).rejects.toEqual(
      new FollowingItem('restraint_ring'),
    )
    await expect(
      repo.update('life_whetstone_from_box', { ...ring, name: '생명의 연마석' }),
    ).rejects.toBeInstanceOf(FollowingItem)
  })

  it('이름 겹침 검사는 같은 물건으로 이은 줄을 빼고 본다. 다른 key 의 새 아이템은 여전히 거절한다', async () => {
    await linkedRows()

    expect(
      await repo.update('life_whetstone', {
        ...ring,
        name: '생명의 연마석',
        groupKey: 'boss_loot',
        isValuable: true,
      }),
    ).toBe(true)
    await expect(
      repo.create('another_whetstone', { ...ring, name: '생명의 연마석' }),
    ).rejects.toBeInstanceOf(ItemNameTaken)
  })

  it('사냥 전리품 아이템의 이름을 고치면 사냥 전리품 칸의 시각도 민다', async () => {
    await repo.create('reindeer_milk', {
      ...base,
      name: '순록의 우유',
      groupKey: null,
      isEquipment: false,
    })
    await db
      .insert(huntLootItems)
      .values({
        itemId: await idOf('reindeer_milk'),
        kind: 'consumable',
        npcPriceMeso: 2750,
        sortOrder: 0,
      })
    await db.delete(gameDataSections)

    await repo.update('reindeer_milk', {
      ...base,
      name: '순록의 우유!',
      groupKey: null,
      isEquipment: false,
    })
    expect(await touched()).toEqual(['huntLoot', 'items'])
  })
})
