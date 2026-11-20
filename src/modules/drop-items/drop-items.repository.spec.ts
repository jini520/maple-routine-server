import * as schema from '../../database/schema'
import {
  describeDb,
  insertAssets,
  insertItems,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import {
  ContentExists,
  DropBoxesRepository,
  DropBoxExists,
  NoDropItem,
} from './drop-boxes.repository'
import { DropItemsRepository } from './drop-items.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['items/Restraint_Ring.png']

describeDb('DropItemsRepository · DropBoxesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let items: DropItemsRepository
  let assetIds: Record<string, string>
  let boxes: DropBoxesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    items = new DropItemsRepository(db)
    boxes = new DropBoxesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
  })
  afterAll(() => close())

  // 드롭 표와 상자의 내용물은 원래 반지를 가리킨다. 레벨 줄을 고르면 상자에서 레벨을 찾지 못한다.
  it('드롭 아이템만 key 차례로 내고, 반지 레벨 줄은 고르는 목록에서 뺀다', async () => {
    expect(await items.adminSection()).toEqual({ updatedAt: null, items: [] })
    await insertItems(db, [
      {
        key: 'restraint_ring',
        name: '리스트레인트 링',
        iconAssetId: assetIds['items/Restraint_Ring.png'],
        isValuable: true,
        isDrop: true,
      },
      { key: 'restraint_ring_lv4', name: '리스트레인트 링 lv.4', isValuable: true, isDrop: true },
      { key: 'life_whetstone', name: '생명의 연마석', isDrop: true },
      { key: 'absolab_bow', name: '앱솔랩스 슈팅보우', requiredLevel: 160, isEquipment: true },
    ])
    const id = new Map(
      (await db.select({ id: schema.items.id, key: schema.items.key }).from(schema.items)).map(
        (r) => [r.key, r.id],
      ),
    )
    await db.insert(schema.ringLevelItems).values({
      itemId: id.get('restraint_ring_lv4') ?? '',
      ringItemId: id.get('restraint_ring') ?? '',
      ringLevel: 4,
    })

    expect((await items.adminSection()).items).toEqual([
      { key: 'life_whetstone', name: '생명의 연마석', iconAssetId: null, isValuable: false },
      {
        key: 'restraint_ring',
        name: '리스트레인트 링',
        iconAssetId: assetIds['items/Restraint_Ring.png'],
        isValuable: true,
      },
    ])
  })

  it('상자는 아이템을 가리키고 내용물은 더한 차례로 서며 옮기고 뺄 수 있다', async () => {
    await insertItems(db, [
      { key: 'green_boss_ring_box', name: '녹옥의 보스 반지 상자', isDrop: true },
      { key: 'restraint_ring', name: '리스트레인트 링', isDrop: true },
      { key: 'continuous_ring', name: '컨티뉴어스 링', isDrop: true },
    ])

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
    await insertItems(db, [
      { key: 'green_boss_ring_box', name: '녹옥의 보스 반지 상자', isDrop: true },
    ])
    await expect(
      boxes.create({ item: 'green_boss_ring_box', levelMin: 1, levelMax: null }),
    ).rejects.toThrow()
  })
})
