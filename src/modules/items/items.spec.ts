import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { items } from '../../database/schema'
import { sameNameItem } from './items'

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
