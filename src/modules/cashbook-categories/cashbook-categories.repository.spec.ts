import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  CashbookCategoriesRepository,
  type CashbookCategoryInput,
  CashbookCategoryExists,
} from './cashbook-categories.repository'

describeDb('CashbookCategoriesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: CashbookCategoriesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new CashbookCategoriesRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  const category = (over: Partial<CashbookCategoryInput>): CashbookCategoryInput => ({
    entryType: 'spend',
    key: 'content',
    name: '컨텐츠',
    cardTitle: '컨텐츠',
    iconFile: 'monster_park_ticket.webp',
    description: '몬파·에픽던전·퀵패스',
    unit: null,
    ...over,
  })

  it('같은 key 라도 수입과 지출은 따로 더하고, 같은 쪽에서 겹치면 Exists 다', async () => {
    await repo.createCategory(category({ key: 'etc', name: '기타' }))
    await repo.createCategory(category({ entryType: 'income', key: 'etc', name: '기타' }))
    await expect(repo.createCategory(category({ key: 'etc' }))).rejects.toBeInstanceOf(
      CashbookCategoryExists,
    )

    const section = await repo.section()
    expect(section.categories.map((c) => [c.entryType, c.key])).toEqual([
      ['income', 'etc'],
      ['spend', 'etc'],
    ])
  })

  it('차례는 수입 · 지출 안에서만 매기고 옮긴다', async () => {
    await repo.createCategory(category({ key: 'content' }))
    await repo.createCategory(category({ entryType: 'income', key: 'hunting', unit: '소재' }))
    await repo.createCategory(category({ key: 'buff' }))
    await repo.createCategory(category({ entryType: 'income', key: 'item_sale' }))

    expect(await repo.moveCategory('spend', 'buff', 'up')).toBe(true)
    expect(await repo.moveCategory('income', 'hunting', 'up')).toBe(true)
    expect(await repo.moveCategory('income', 'nobody', 'up')).toBe(false)

    const keys = (await repo.section()).categories.map((c) => `${c.entryType}.${c.key}`)
    expect(keys).toEqual(['income.hunting', 'income.item_sale', 'spend.buff', 'spend.content'])
  })

  it('갈래를 고치면 key 는 그대로이고 칸의 시각이 움직인다', async () => {
    await repo.createCategory(category({ entryType: 'income', key: 'hunting', name: '사냥' }))
    const before = (await repo.section()).updatedAt

    expect(
      await repo.updateCategory('income', 'hunting', {
        name: '사냥 수익',
        cardTitle: '사냥',
        iconFile: 'wealth.webp',
        description: '메소 · 조각',
        unit: '소재',
      }),
    ).toBe(true)
    expect(await repo.updateCategory('spend', 'hunting', category({}))).toBe(false)

    const section = await repo.section()
    expect(section.categories).toEqual([
      {
        entryType: 'income',
        key: 'hunting',
        name: '사냥 수익',
        cardTitle: '사냥',
        iconFile: 'wealth.webp',
        description: '메소 · 조각',
        unit: '소재',
      },
    ])
    expect(section.updatedAt).not.toBe(before)
  })

  it('아이템 종류는 고치기만 있고 차례대로 낸다', async () => {
    await repo.createItemKind({ key: 'equipment', name: '장비', unit: null, hasTariff: true })
    await repo.createItemKind({ key: 'consumable', name: '소비', unit: '개', hasTariff: false })

    expect(
      await repo.updateItemKind('consumable', { name: '소비', unit: '묶음', hasTariff: false }),
    ).toBe(true)
    expect(await repo.updateItemKind('nobody', { name: 'x', unit: null, hasTariff: false })).toBe(
      false,
    )

    expect((await repo.section()).itemKinds).toEqual([
      { key: 'equipment', name: '장비', unit: null, hasTariff: true },
      { key: 'consumable', name: '소비', unit: '묶음', hasTariff: false },
    ])
  })
})
