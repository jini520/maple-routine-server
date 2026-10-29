import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  HuntLootExists,
  HuntLootPriceShape,
  HuntLootRepository,
  type HuntLootInput,
} from './hunt-loot.repository'

const milk: HuntLootInput = {
  key: 'reindeer_milk',
  kind: 'consumable',
  name: '순록의 우유',
  iconFile: 'reindeer_milk.png',
  npcPriceMeso: 2750,
  from: null,
  until: null,
}
const fragment: HuntLootInput = {
  key: 'sol_erda_fragment',
  kind: 'fragment',
  name: '솔 에르다 조각',
  iconFile: 'sol_erda_fragment.webp',
  npcPriceMeso: null,
  from: null,
  until: null,
}
const magnifier: HuntLootInput = {
  key: 'suspicious_magnifier',
  kind: 'event',
  name: '수상한 돋보기',
  iconFile: 'suspicious_magnifier.webp',
  npcPriceMeso: null,
  from: '2026-10-22',
  until: '2026-11-19',
}

describeDb('HuntLootRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: HuntLootRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HuntLootRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('더한 차례로 내고, 고치기는 key · 분류를 빼고 갈아 끼우며 차례를 옮긴다. 모르는 key 는 false 다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, items: [] })
    await repo.create(fragment)
    await repo.create(milk)
    await repo.create(magnifier)
    await expect(repo.create(milk)).rejects.toBeInstanceOf(HuntLootExists)

    expect(
      await repo.update('suspicious_magnifier', {
        ...magnifier,
        name: '수상한 돋보기!',
        until: '2026-11-26',
      }),
    ).toBe(true)
    expect(await repo.update('nobody', milk)).toBe(false)
    expect(await repo.move('suspicious_magnifier', 'up')).toBe(true)
    expect(await repo.move('sol_erda_fragment', 'up')).toBe(true)
    expect(await repo.move('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.items).toEqual([
      fragment,
      { ...magnifier, name: '수상한 돋보기!', until: '2026-11-26' },
      milk,
    ])
  })

  it('NPC 가격은 소비에만 있고 소비에는 반드시 있다. 어기면 HuntLootPriceShape 다', async () => {
    await expect(repo.create({ ...milk, npcPriceMeso: null })).rejects.toBeInstanceOf(
      HuntLootPriceShape,
    )
    await expect(repo.create({ ...fragment, npcPriceMeso: 100 })).rejects.toBeInstanceOf(
      HuntLootPriceShape,
    )
    await repo.create(milk)
    await expect(
      repo.update('reindeer_milk', { ...milk, npcPriceMeso: null }),
    ).rejects.toBeInstanceOf(HuntLootPriceShape)
    expect((await repo.section()).items).toEqual([milk])
  })
})
