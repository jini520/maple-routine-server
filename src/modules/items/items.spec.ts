import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { items } from '../../database/schema'
import { ITEM_CATEGORIES, isItemCategory, sameNameItem } from './items'

describe('ITEM_CATEGORIES', () => {
  it('묶음 key 는 종류를 건너서도 겹치지 않는다. 아이템 줄은 묶음 key 하나만 들어 겹치면 종류를 못 가린다', () => {
    const keys = ITEM_CATEGORIES.flatMap((kind) => kind.groups.map((g) => g.key))
    expect(new Set(keys).size).toBe(keys.length)
    expect(isItemCategory(keys[0] ?? '')).toBe(true)
    expect(isItemCategory('equipment')).toBe(false)
  })
})

describeDb('sameNameItem', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('NFC · 공백 제거 뒤 이름이 같은 다른 key 의 아이템을 찾고, 자기 key 는 건너뛴다', async () => {
    await db.insert(items).values([
      { key: 'giant_terror', name: '거대한 공포', isDrop: true, isEquipment: true },
      { key: 'reindeer_milk', name: '순록의 우유' },
    ])
    expect(await sameNameItem(db, 'great_terror', '거대한공포'.normalize('NFD'))).toEqual({
      key: 'giant_terror',
      isEquipment: true,
    })
    expect(await sameNameItem(db, 'giant_terror', '거대한  공포')).toBeNull()
    expect(await sameNameItem(db, 'new_item', '새 아이템')).toBeNull()
  })
})
