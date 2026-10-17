import { dropItems } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  comparableEquipmentName,
  DropItemKeyMismatch,
  EquipmentItemExists,
  EquipmentItemsRepository,
  EquipmentNameTaken,
} from './equipment-items.repository'

describe('comparableEquipmentName', () => {
  it('NFC 로 맞추고 공백을 모두 지운다. API 는 띄어 주고 표는 붙여 쓴다', () => {
    expect(comparableEquipmentName('앱솔랩스 에인션트보우')).toBe('앱솔랩스에인션트보우')
    expect(comparableEquipmentName('어센던트펄스링'.normalize('NFD'))).toBe('어센던트펄스링')
  })
})

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

  const bow = { key: 'absolab_ancient_bow', name: '앱솔랩스에인션트보우', level: 160 }
  const ring = { key: 'ascendant_pulse_ring', name: '어센던트펄스링', level: 130 }

  it('key 차례로 내고, 같은 key 는 EquipmentItemExists · 공백만 다른 이름은 EquipmentNameTaken 이다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, items: [] })
    await repo.create(ring)
    await repo.create(bow)
    await expect(repo.create({ ...ring, name: '펄스링' })).rejects.toBeInstanceOf(
      EquipmentItemExists,
    )
    await expect(
      repo.create({ key: 'pulse_ring', name: '어센던트 펄스링', level: null }),
    ).rejects.toThrow(new EquipmentNameTaken('ascendant_pulse_ring'))

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.items).toEqual([bow, ring])
  })

  // 두 표가 한 물건을 두 key 로 부르면 기록이 갈린다. 앱 스펙이 지키던 규칙이다.
  it('드롭 아이템 표에 같은 이름이 있으면 key 가 같아야 한다', async () => {
    await db
      .insert(dropItems)
      .values({ key: 'berserked', name: '거대한 공포', iconFile: null, valuable: true })
    await expect(
      repo.create({ key: 'great_terror', name: '거대한공포', level: 200 }),
    ).rejects.toThrow(new DropItemKeyMismatch('berserked'))
    await repo.create({ key: 'berserked', name: '거대한공포', level: 200 })
    expect((await repo.section()).items.map((i) => i.key)).toEqual(['berserked'])
  })

  it('이름 · 레벨을 고친다. 자기 이름은 겹침이 아니고 레벨은 비울 수 있다. 모르는 key 는 false 다', async () => {
    await repo.create(bow)
    await repo.create(ring)
    expect(await repo.update('ascendant_pulse_ring', { name: '어센던트펄스링', level: null })).toBe(
      true,
    )
    await expect(
      repo.update('ascendant_pulse_ring', { name: '앱솔랩스 에인션트보우', level: 130 }),
    ).rejects.toBeInstanceOf(EquipmentNameTaken)
    expect(await repo.update('nobody', { name: 'x', level: null })).toBe(false)
    expect((await repo.section()).items).toEqual([bow, { ...ring, level: null }])
  })
})
