import { spendRewardTypes } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import { CashbookCategoriesRepository } from '../cashbook-categories/cashbook-categories.repository'
import {
  NoSpendCategory,
  NoSpendGroup,
  NoSpendTile,
  SpendCatalogRepository,
  SpendGroupExists,
  SpendItemExists,
  type SpendItemInput,
  SpendItemShape,
  SpendTileExists,
} from './spend-catalog.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['items/magical.webp', 'items/x.webp', 'maps/icons/highMountain.png']

describeDb('SpendCatalogRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: SpendCatalogRepository
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new SpendCatalogRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
  })
  afterAll(() => close())

  const epic = {
    key: 'epic_dungeon_bonus_reward',
    name: '에픽던전 추가 리워드',
    category: 'content',
    cardTitle: '에픽던전',
    isActive: true,
  }
  const scroll = {
    key: 'scroll',
    name: '주문서',
    category: 'scroll',
    cardTitle: '주문서',
    isActive: true,
  }
  const highMountain = () => ({
    key: 'high_mountain',
    name: '하이마운틴',
    iconAssetId: assetIds['maps/icons/highMountain.png'] ?? null,
  })
  const magical = () => ({
    key: 'magical_scroll',
    name: '매지컬 주문서',
    iconAssetId: assetIds['items/magical.webp'] ?? null,
  })
  const item = (over: Partial<SpendItemInput>): SpendItemInput => ({
    key: 'high_mountain_1',
    group: 'epic_dungeon_bonus_reward',
    tile: 'high_mountain',
    name: '하이마운틴 1단계',
    tier: '1단계',
    currency: 'point',
    unitPrice: 7500,
    unit: '회',
    maxQuantity: 1,
    rewardCoinQuantity: 4,
    validFrom: null,
    validUntil: null,
    options: [],
    rewardTypes: ['exp', 'sol_erda'],
    ...over,
  })

  async function seedCategories(): Promise<void> {
    const categories = new CashbookCategoriesRepository(db)
    const base = { iconAssetId: assetIds['items/x.webp'] ?? '', description: '', unit: null }
    await categories.createCategory({
      ...base,
      entryType: 'spend',
      key: 'content',
      name: '컨텐츠',
      cardTitle: '컨텐츠',
    })
    await categories.createCategory({
      ...base,
      entryType: 'spend',
      key: 'scroll',
      name: '주문서',
      cardTitle: '주문서',
    })
    await categories.createCategory({
      ...base,
      entryType: 'income',
      key: 'hunting',
      name: '사냥',
      cardTitle: '사냥',
    })
    // 추가 리워드 종류는 앱 코드가 key 로 갈려 관리 화면에 더하기가 없다. 옮기기가 옛 DB 의 줄을 넣는다.
    await db.insert(spendRewardTypes).values([
      { key: 'exp', name: '경험치', sortOrder: 0 },
      { key: 'sol_erda', name: '솔 에르다', sortOrder: 1 },
    ])
  }

  async function seedTwoGroups(): Promise<void> {
    await seedCategories()
    await repo.createGroup(epic)
    await repo.createGroup(scroll)
    await repo.createTile(highMountain())
    await repo.createTile(magical())
  }

  it('빈 표는 칸 전부가 비고 규칙 셋이 null 이다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      spendRewardTypes: [],
      spendGroups: [],
      spendTiles: [],
      spendItems: [],
      spendItemOptions: [],
      spendItemRewardTypes: [],
    })
  })

  it('묶음 · 타일 · 항목을 더하고 더한 차례로 낸다. 같은 key 는 Exists 다', async () => {
    await seedTwoGroups()
    await expect(repo.createGroup(epic)).rejects.toBeInstanceOf(SpendGroupExists)
    await expect(repo.createTile(magical())).rejects.toBeInstanceOf(SpendTileExists)
    await expect(
      repo.createTile({
        ...magical(),
        key: 'x',
        iconAssetId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    await repo.createItem(item({}))
    await repo.createItem(
      item({ key: 'high_mountain_2', name: '하이마운틴 2단계', tier: '2단계', unitPrice: 15000 }),
    )
    await expect(repo.createItem(item({}))).rejects.toBeInstanceOf(SpendItemExists)
    await expect(repo.createItem(item({ key: 'x', group: 'nobody' }))).rejects.toBeInstanceOf(
      NoSpendGroup,
    )
    await expect(repo.createItem(item({ key: 'x', tile: 'nobody' }))).rejects.toBeInstanceOf(
      NoSpendTile,
    )

    const admin = await repo.adminRows()
    expect(admin.groups).toEqual([epic, scroll])
    // 타일의 그림은 아이템 그림이거나 지역 아이콘이고 한 칸에 든다
    expect(admin.tiles.map((t) => [t.key, t.iconAssetId])).toEqual([
      ['high_mountain', assetIds['maps/icons/highMountain.png']],
      ['magical_scroll', assetIds['items/magical.webp']],
    ])
    expect(admin.items.map((i) => [i.key, i.tier, i.rewardCoinQuantity])).toEqual([
      ['high_mountain_1', '1단계', 4],
      ['high_mountain_2', '2단계', 4],
    ])
    expect(admin.itemOptions).toEqual([])
    expect(admin.itemRewardTypes).toEqual([
      { item: 'high_mountain_1', rewardType: 'exp' },
      { item: 'high_mountain_1', rewardType: 'sol_erda' },
      { item: 'high_mountain_2', rewardType: 'exp' },
      { item: 'high_mountain_2', rewardType: 'sol_erda' },
    ])
  })

  // 앱은 기록이 가리키는 줄을 줄 id 로 찾는다. 묶음 · 타일 · 리워드 종류도 key 가 아니라 줄 id 로 잇는다.
  it('앱이 받는 칸은 표 이름의 배열에 줄 id 로 잇는다', async () => {
    await seedTwoGroups()
    await repo.createItem(item({}))

    const section = await repo.section()
    const group = section.spendGroups.find((g) => g.key === 'epic_dungeon_bonus_reward')
    const tile = section.spendTiles.find((t) => t.key === 'high_mountain')
    const exp = section.spendRewardTypes.find((t) => t.key === 'exp')
    expect(group).toMatchObject({ isActive: true, cardTitle: '에픽던전' })
    expect(typeof group?.cashbookCategoryId).toBe('string')
    expect(section.spendItems[0]).toMatchObject({
      key: 'high_mountain_1',
      groupId: group?.id,
      tileId: tile?.id,
      rewardCoinQuantity: 4,
      validFrom: null,
      validUntil: null,
    })
    expect(section.spendItemRewardTypes).toContainEqual({
      itemId: section.spendItems[0]?.id,
      rewardTypeId: exp?.id,
    })
  })

  it('축 값을 든 항목은 축으로 낸다. 모양이 어긋나면 SpendItemShape 다', async () => {
    await seedTwoGroups()
    const oneHanded = item({
      key: 'magical_one_handed_attack',
      group: 'scroll',
      tile: 'magical_scroll',
      name: '매지컬 한손무기 공격력',
      tier: null,
      currency: 'meso',
      unitPrice: 60_000_000,
      unit: '개',
      maxQuantity: null,
      rewardCoinQuantity: null,
      options: [
        { axis: '무기', value: '한손무기' },
        { axis: '능력치', value: '공격력' },
      ],
      rewardTypes: [],
    })
    await repo.createItem(oneHanded)

    // 단계와 축 값을 함께 든다.
    await expect(
      repo.createItem({ ...oneHanded, key: 'bad1', tier: '1단계' }),
    ).rejects.toBeInstanceOf(SpendItemShape)
    // 추가 리워드 종류 없이 주화를 든다.
    await expect(
      repo.createItem({ ...oneHanded, key: 'bad2', rewardCoinQuantity: 1 }),
    ).rejects.toBeInstanceOf(SpendItemShape)
    // 같은 타일인데 다른 묶음이다.
    await expect(
      repo.createItem({ ...oneHanded, key: 'bad3', group: 'epic_dungeon_bonus_reward' }),
    ).rejects.toBeInstanceOf(SpendItemShape)
    // 같은 타일인데 축 값이 아니라 단계를 든다.
    await expect(
      repo.createItem({ ...oneHanded, key: 'bad4', tier: '2단계', options: [] }),
    ).rejects.toBeInstanceOf(SpendItemShape)
    // 축 이름이 다르다.
    await expect(
      repo.createItem({
        ...oneHanded,
        key: 'bad5',
        options: [
          { axis: '무기', value: '두손무기' },
          { axis: '스탯', value: '힘' },
        ],
      }),
    ).rejects.toBeInstanceOf(SpendItemShape)
    // 같은 조합이다.
    await expect(repo.createItem({ ...oneHanded, key: 'bad6' })).rejects.toBeInstanceOf(
      SpendItemShape,
    )
    await repo.createItem({
      ...oneHanded,
      key: 'magical_two_handed_attack',
      options: [
        { axis: '무기', value: '두손무기' },
        { axis: '능력치', value: '공격력' },
      ],
    })

    const admin = await repo.adminRows()
    expect(admin.items.map((i) => i.key)).toEqual([
      'magical_one_handed_attack',
      'magical_two_handed_attack',
    ])
    expect(admin.itemOptions).toEqual([
      { item: 'magical_one_handed_attack', axis: '능력치', value: '공격력' },
      { item: 'magical_one_handed_attack', axis: '무기', value: '한손무기' },
      { item: 'magical_two_handed_attack', axis: '능력치', value: '공격력' },
      { item: 'magical_two_handed_attack', axis: '무기', value: '두손무기' },
    ])
  })

  it('항목을 갈아 끼우면 축 값과 추가 리워드 종류가 통째로 바뀌고, 차례를 옮기고, 묶음을 닫는다', async () => {
    await seedTwoGroups()
    await repo.createItem(item({}))
    await repo.createItem(item({ key: 'high_mountain_2', tier: '2단계' }))

    expect(
      await repo.updateItem('high_mountain_2', {
        ...item({
          tier: '2단계',
          unitPrice: 15000,
          rewardCoinQuantity: 8,
          rewardTypes: ['exp'],
        }),
      }),
    ).toBe(true)
    expect(await repo.updateItem('nobody', item({}))).toBe(false)
    expect(await repo.moveItem('high_mountain_2', 'up')).toBe(true)
    expect(await repo.moveItem('high_mountain_2', 'up')).toBe(true)
    expect(await repo.moveItem('nobody', 'up')).toBe(false)
    expect(
      await repo.updateGroup('scroll', {
        name: '주문서',
        category: 'scroll',
        cardTitle: '주문서',
        isActive: false,
      }),
    ).toBe(true)
    expect(
      await repo.updateGroup('nobody', {
        name: 'x',
        category: 'scroll',
        cardTitle: 'x',
        isActive: true,
      }),
    ).toBe(false)
    expect(await repo.moveGroup('scroll', 'up')).toBe(true)
    expect(
      await repo.updateTile('magical_scroll', {
        name: '매지컬',
        iconAssetId: assetIds['items/magical.webp'] ?? null,
      }),
    ).toBe(true)
    expect(await repo.updateTile('nobody', { name: 'x', iconAssetId: null })).toBe(false)

    const admin = await repo.adminRows()
    expect(admin.groups.map((g) => [g.key, g.isActive])).toEqual([
      ['scroll', false],
      ['epic_dungeon_bonus_reward', true],
    ])
    expect(admin.items.map((i) => [i.key, i.unitPrice, i.rewardCoinQuantity])).toEqual([
      ['high_mountain_2', 15000, 8],
      ['high_mountain_1', 7500, 4],
    ])
    expect(admin.itemRewardTypes.filter((f) => f.item === 'high_mountain_2')).toEqual([
      { item: 'high_mountain_2', rewardType: 'exp' },
    ])
    expect(admin.tiles.find((t) => t.key === 'magical_scroll')?.name).toBe('매지컬')
  })

  it('묶음은 지출 갈래만 가리키고, 카드 제목 · 추가 리워드 종류 이름을 낸다', async () => {
    await seedTwoGroups()
    await expect(
      repo.createGroup({ ...epic, key: 'hunt', category: 'hunting' }),
    ).rejects.toBeInstanceOf(NoSpendCategory)
    await expect(
      repo.updateGroup('scroll', { ...scroll, category: 'nobody' }),
    ).rejects.toBeInstanceOf(NoSpendCategory)
    expect(await repo.updateRewardType('exp', '경험치 보상')).toBe(true)

    const admin = await repo.adminRows()
    expect(admin.groups[0]).toEqual(epic)
    expect(admin.rewardTypes).toEqual([
      { key: 'exp', name: '경험치 보상' },
      { key: 'sol_erda', name: '솔 에르다' },
    ])
  })
})
