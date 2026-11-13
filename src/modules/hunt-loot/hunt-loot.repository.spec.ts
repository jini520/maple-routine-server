import { eq } from 'drizzle-orm'

import { gameDataSections, items } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import {
  HuntLootExists,
  HuntLootPriceShape,
  HuntLootRepository,
  type HuntLootInput,
} from './hunt-loot.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = [
  'items/reindeer_milk.png',
  'items/sol_erda_fragment.webp',
  'items/suspicious_magnifier.webp',
]

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
  let assetIds: Record<string, string>
  /** 칸이 내는 줄. 그림 이름 옆에 그 그림의 id 가 선다 */
  const withIcon = (row: HuntLootInput) => ({
    ...row,
    iconAssetId: assetIds[`items/${row.iconFile}`],
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HuntLootRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
  })
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
      withIcon(fragment),
      withIcon({ ...magnifier, name: '수상한 돋보기!', until: '2026-11-26' }),
      withIcon(milk),
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
    expect((await repo.section()).items).toEqual([withIcon(milk)])
  })

  it('이름 · 그림을 고친 아이템에 분류가 있으면 items 칸의 시각도 민다. 분류가 없으면 그 칸에 안 실려 밀지 않는다', async () => {
    const touched = async () =>
      (await db.select({ key: gameDataSections.key }).from(gameDataSections)).map((r) => r.key).sort()
    await repo.create(milk)
    await repo.create(fragment)
    await db.update(items).set({ category: 'growth_material' }).where(eq(items.key, 'sol_erda_fragment'))
    await db.delete(gameDataSections)

    await repo.update('reindeer_milk', { ...milk, name: '순록의 우유!' })
    expect(await touched()).toEqual(['huntLoot'])

    await repo.update('sol_erda_fragment', { ...fragment, name: '솔 에르다 조각!' })
    expect(await touched()).toEqual(['huntLoot', 'items'])
  })
})
