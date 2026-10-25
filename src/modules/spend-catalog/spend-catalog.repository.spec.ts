import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { BossesRepository } from '../bosses/bosses.repository'
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

describeDb('SpendCatalogRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: SpendCatalogRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new SpendCatalogRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  const empty = {
    updatedAt: null,
    rules: { tariffPercent: null, rewardCoinPriceMeso: null },
    groups: [],
    tiles: [],
    items: [],
    itemOptions: [],
    itemForms: [],
    forms: [],
  }
  const epic = {
    key: 'epic_dungeon_bonus_reward',
    name: '에픽던전 추가 리워드',
    category: 'content',
    cardTitle: '에픽던전',
    active: true,
  }
  const scroll = {
    key: 'scroll',
    name: '주문서',
    category: 'scroll',
    cardTitle: '주문서',
    active: true,
  }
  const highMountain = {
    key: 'high_mountain',
    name: '하이마운틴',
    iconFile: null,
    iconMap: 'highMountain',
  }
  const magical = {
    key: 'magical_scroll',
    name: '매지컬 주문서',
    iconFile: 'magical.webp',
    iconMap: null,
  }
  const item = (over: Partial<SpendItemInput>): SpendItemInput => ({
    key: 'high_mountain_1',
    group: 'epic_dungeon_bonus_reward',
    tile: 'high_mountain',
    name: '하이마운틴 1단계',
    shortName: null,
    tier: '1단계',
    currency: 'point',
    unitPrice: 7500,
    unit: '회',
    maxQuantity: 1,
    rewardCoins: 4,
    from: null,
    until: null,
    options: [],
    forms: ['exp', 'sol_erda'],
    ...over,
  })

  async function seedCategories(): Promise<void> {
    const categories = new CashbookCategoriesRepository(db)
    const base = { iconFile: 'x.webp', description: '', unit: null }
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
    await repo.createForm({ key: 'exp', name: '경험치' })
    await repo.createForm({ key: 'sol_erda', name: '솔 에르다' })
  }

  async function seedTwoGroups(): Promise<void> {
    await seedCategories()
    await repo.createGroup(epic)
    await repo.createGroup(scroll)
    await repo.createTile(highMountain)
    await repo.createTile(magical)
  }

  it('빈 표는 칸 전부가 비고 규칙 둘이 null 이다', async () => {
    expect(await repo.section()).toEqual(empty)
  })

  it('규칙 둘을 적으면 칸이 들고 보스 표의 updatedAt 은 안 움직인다', async () => {
    await repo.setRules({ tariffPercent: 10, rewardCoinPriceMeso: 40_000_000 })

    const section = await repo.section()
    expect(section.rules).toEqual({ tariffPercent: 10, rewardCoinPriceMeso: 40_000_000 })
    expect(section.updatedAt).not.toBeNull()
    expect((await new BossesRepository(db).catalog()).updatedAt).toBeNull()
  })

  it('묶음 · 타일 · 항목을 더하고 더한 차례로 낸다. 같은 key 는 Exists 다', async () => {
    await seedTwoGroups()
    await expect(repo.createGroup(epic)).rejects.toBeInstanceOf(SpendGroupExists)
    await expect(repo.createTile(magical)).rejects.toBeInstanceOf(SpendTileExists)
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

    const section = await repo.section()
    expect(section.groups).toEqual([epic, scroll])
    expect(section.tiles.map((t) => t.key)).toEqual(['high_mountain', 'magical_scroll'])
    expect(section.items.map((i) => [i.key, i.tier, i.rewardCoins])).toEqual([
      ['high_mountain_1', '1단계', 4],
      ['high_mountain_2', '2단계', 4],
    ])
    expect(section.itemOptions).toEqual([])
    expect(section.itemForms).toEqual([
      { item: 'high_mountain_1', form: 'exp' },
      { item: 'high_mountain_1', form: 'sol_erda' },
      { item: 'high_mountain_2', form: 'exp' },
      { item: 'high_mountain_2', form: 'sol_erda' },
    ])
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
      rewardCoins: null,
      options: [
        { axis: '무기', value: '한손무기' },
        { axis: '능력치', value: '공격력' },
      ],
      forms: [],
    })
    await repo.createItem(oneHanded)

    // 단계와 축 값을 함께 든다.
    await expect(
      repo.createItem({ ...oneHanded, key: 'bad1', tier: '1단계' }),
    ).rejects.toBeInstanceOf(SpendItemShape)
    // 형태 없이 주화를 든다.
    await expect(
      repo.createItem({ ...oneHanded, key: 'bad2', rewardCoins: 1 }),
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

    const section = await repo.section()
    expect(section.items.map((i) => i.key)).toEqual([
      'magical_one_handed_attack',
      'magical_two_handed_attack',
    ])
    expect(section.itemOptions).toEqual([
      { item: 'magical_one_handed_attack', axis: '능력치', value: '공격력' },
      { item: 'magical_one_handed_attack', axis: '무기', value: '한손무기' },
      { item: 'magical_two_handed_attack', axis: '능력치', value: '공격력' },
      { item: 'magical_two_handed_attack', axis: '무기', value: '두손무기' },
    ])
  })

  it('항목을 갈아 끼우면 축 값과 형태가 통째로 바뀌고, 차례를 옮기고, 묶음을 닫는다', async () => {
    await seedTwoGroups()
    await repo.createItem(item({}))
    await repo.createItem(item({ key: 'high_mountain_2', tier: '2단계' }))

    expect(
      await repo.updateItem('high_mountain_2', {
        ...item({ tier: '2단계', unitPrice: 15000, rewardCoins: 8, forms: ['exp'] }),
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
        active: false,
      }),
    ).toBe(true)
    expect(
      await repo.updateGroup('nobody', {
        name: 'x',
        category: 'scroll',
        cardTitle: 'x',
        active: true,
      }),
    ).toBe(false)
    expect(await repo.moveGroup('scroll', 'up')).toBe(true)
    expect(
      await repo.updateTile('magical_scroll', {
        name: '매지컬',
        iconFile: 'magical.webp',
        iconMap: null,
      }),
    ).toBe(true)
    expect(await repo.updateTile('nobody', { name: 'x', iconFile: null, iconMap: null })).toBe(
      false,
    )

    const section = await repo.section()
    expect(section.groups.map((g) => [g.key, g.active])).toEqual([
      ['scroll', false],
      ['epic_dungeon_bonus_reward', true],
    ])
    expect(section.items.map((i) => [i.key, i.unitPrice, i.rewardCoins])).toEqual([
      ['high_mountain_2', 15000, 8],
      ['high_mountain_1', 7500, 4],
    ])
    expect(section.itemForms.filter((f) => f.item === 'high_mountain_2')).toEqual([
      { item: 'high_mountain_2', form: 'exp' },
    ])
    expect(section.tiles.find((t) => t.key === 'magical_scroll')?.name).toBe('매지컬')
  })

  it('묶음은 지출 갈래만 가리키고, 카드 제목 · 줄인 이름 · 형태 이름을 낸다', async () => {
    await seedTwoGroups()
    await expect(
      repo.createGroup({ ...epic, key: 'hunt', category: 'hunting' }),
    ).rejects.toBeInstanceOf(NoSpendCategory)
    await expect(
      repo.updateGroup('scroll', { ...scroll, category: 'nobody' }),
    ).rejects.toBeInstanceOf(NoSpendCategory)
    await repo.createItem(item({ name: '블루베리 농장 입장권', shortName: '블루베리 농장' }))
    expect(await repo.updateForm('exp', '경험치 보상')).toBe(true)

    const section = await repo.section()
    expect(section.groups[0]).toEqual(epic)
    expect(section.items.map((i) => [i.name, i.shortName])).toEqual([
      ['블루베리 농장 입장권', '블루베리 농장'],
    ])
    expect(section.forms).toEqual([
      { key: 'exp', name: '경험치 보상' },
      { key: 'sol_erda', name: '솔 에르다' },
    ])
  })
})
