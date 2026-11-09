import { describeDb, insertItems, openTestDb, type TestDb } from '../../database/test-db'
import { EquipmentItemsRepository } from './equipment-items.repository'

describeDb('EquipmentItemsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: EquipmentItemsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new EquipmentItemsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('강화 장비 역할의 아이템만 key 차례로 내고, 레벨이 없으면 null 이다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, items: [] })
    await insertItems(db, [
      { key: 'ascendant_pulse_ring', name: '어센던트펄스링', isEquipment: true },
      { key: 'absolab_ancient_bow', name: '앱솔랩스에인션트보우', level: 160, isEquipment: true },
      { key: 'spell_trace', name: '주문의 흔적', isDrop: true },
    ])
    expect((await repo.section()).items).toEqual([
      { key: 'absolab_ancient_bow', name: '앱솔랩스에인션트보우', level: 160 },
      { key: 'ascendant_pulse_ring', name: '어센던트펄스링', level: null },
    ])
  })
})
