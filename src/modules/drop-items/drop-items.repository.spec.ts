import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  ContentExists,
  DropBoxesRepository,
  DropBoxExists,
  NoDropItem,
} from './drop-boxes.repository'
import { DropItemExists, DropItemsRepository } from './drop-items.repository'

describeDb('DropItemsRepository · DropBoxesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let items: DropItemsRepository
  let boxes: DropBoxesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    items = new DropItemsRepository(db)
    boxes = new DropBoxesRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('아이템을 더하고 고치고 key 차례로 낸다. 같은 key 는 DropItemExists 다', async () => {
    expect(await items.section()).toEqual({ updatedAt: null, items: [] })
    await items.create({
      key: 'restraint_ring',
      name: '리스트레인트 링',
      iconFile: 'Restraint_Ring.png',
      valuable: false,
    })
    await items.create({
      key: 'green_boss_ring_box',
      name: '녹옥의 보스 반지 상자',
      iconFile: null,
      valuable: false,
    })
    await expect(
      items.create({ key: 'restraint_ring', name: 'x', iconFile: null, valuable: false }),
    ).rejects.toBeInstanceOf(DropItemExists)

    expect(
      await items.update('restraint_ring', {
        name: '리스트레인트 링',
        iconFile: 'Restraint_Ring.png',
        valuable: true,
      }),
    ).toBe(true)
    expect(await items.update('nobody', { name: 'x', iconFile: null, valuable: false })).toBe(false)

    const section = await items.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.items).toEqual([
      {
        key: 'green_boss_ring_box',
        name: '녹옥의 보스 반지 상자',
        iconFile: null,
        valuable: false,
      },
      {
        key: 'restraint_ring',
        name: '리스트레인트 링',
        iconFile: 'Restraint_Ring.png',
        valuable: true,
      },
    ])
  })

  it('상자는 아이템을 가리키고 내용물은 더한 차례로 서며 옮기고 뺄 수 있다', async () => {
    await items.create({
      key: 'green_boss_ring_box',
      name: '녹옥의 보스 반지 상자',
      iconFile: null,
      valuable: false,
    })
    await items.create({
      key: 'restraint_ring',
      name: '리스트레인트 링',
      iconFile: null,
      valuable: false,
    })
    await items.create({
      key: 'continuous_ring',
      name: '컨티뉴어스 링',
      iconFile: null,
      valuable: false,
    })

    await expect(boxes.create({ item: 'nobody', levelMin: 1, levelMax: 3 })).rejects.toBeInstanceOf(
      NoDropItem,
    )
    await boxes.create({ item: 'green_boss_ring_box', levelMin: 1, levelMax: 3 })
    await expect(
      boxes.create({ item: 'green_boss_ring_box', levelMin: 1, levelMax: 3 }),
    ).rejects.toBeInstanceOf(DropBoxExists)

    expect(await boxes.addContent('green_boss_ring_box', 'restraint_ring')).toBe(true)
    expect(await boxes.addContent('green_boss_ring_box', 'continuous_ring')).toBe(true)
    await expect(boxes.addContent('green_boss_ring_box', 'restraint_ring')).rejects.toBeInstanceOf(
      ContentExists,
    )
    await expect(boxes.addContent('green_boss_ring_box', 'nobody')).rejects.toBeInstanceOf(
      NoDropItem,
    )
    expect(await boxes.addContent('nobody', 'restraint_ring')).toBe(false)

    expect((await boxes.section()).boxes).toEqual([
      {
        item: 'green_boss_ring_box',
        levelMin: 1,
        levelMax: 3,
        contents: ['restraint_ring', 'continuous_ring'],
      },
    ])
    expect(await boxes.moveContent('green_boss_ring_box', 'continuous_ring', 'up')).toBe(true)
    expect((await boxes.section()).boxes[0]?.contents).toEqual([
      'continuous_ring',
      'restraint_ring',
    ])
    expect(await boxes.moveContent('green_boss_ring_box', 'continuous_ring', 'up')).toBe(true)
    expect((await boxes.section()).boxes[0]?.contents).toEqual([
      'continuous_ring',
      'restraint_ring',
    ])

    expect(await boxes.setLevels('green_boss_ring_box', { levelMin: null, levelMax: null })).toBe(
      true,
    )
    expect(await boxes.removeContent('green_boss_ring_box', 'restraint_ring')).toBe(true)
    expect(await boxes.removeContent('green_boss_ring_box', 'restraint_ring')).toBe(false)
    expect((await boxes.section()).boxes[0]).toEqual({
      item: 'green_boss_ring_box',
      levelMin: null,
      levelMax: null,
      contents: ['continuous_ring'],
    })
  })

  it('레벨 범위가 한쪽만 있으면 DB 가 거절한다', async () => {
    await items.create({
      key: 'green_boss_ring_box',
      name: '녹옥의 보스 반지 상자',
      iconFile: null,
      valuable: false,
    })
    await expect(
      boxes.create({ item: 'green_boss_ring_box', levelMin: 1, levelMax: null }),
    ).rejects.toThrow()
  })
})
