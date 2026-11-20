import { gameDataSections, items } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
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

type Row = Omit<HuntLootInput, 'iconAssetId'> & { icon: string }

const milkRow: Row = {
  key: 'reindeer_milk',
  kind: 'consumable',
  name: '순록의 우유',
  icon: 'items/reindeer_milk.png',
  npcPriceMeso: 2750,
  from: null,
  until: null,
}
const fragmentRow: Row = {
  key: 'sol_erda_fragment',
  kind: 'fragment',
  name: '솔 에르다 조각',
  icon: 'items/sol_erda_fragment.webp',
  npcPriceMeso: null,
  from: null,
  until: null,
}
const magnifierRow: Row = {
  key: 'suspicious_magnifier',
  kind: 'event',
  name: '수상한 돋보기',
  icon: 'items/suspicious_magnifier.webp',
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
  /** 그림 경로를 넣은 그림의 id 로 바꾼 본문. 칸이 내는 줄과 모양이 같다. */
  const input = ({ icon, ...row }: Row): HuntLootInput => ({
    ...row,
    iconAssetId: assetIds[icon] ?? '',
  })
  let milk: HuntLootInput
  let fragment: HuntLootInput
  let magnifier: HuntLootInput

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HuntLootRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
    milk = input(milkRow)
    fragment = input(fragmentRow)
    magnifier = input(magnifierRow)
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

  it('이름 · 그림을 고치면 아이템 줄이 바뀌므로 사냥 전리품 칸과 items 칸의 시각을 함께 민다', async () => {
    const touched = async () =>
      (await db.select({ key: gameDataSections.key }).from(gameDataSections)).map((r) => r.key).sort()
    await repo.create(milk)
    await db.delete(gameDataSections)

    await repo.update('reindeer_milk', { ...milk, name: '순록의 우유!' })
    expect(await touched()).toEqual(['huntLoot', 'items'])
  })

  it('그림 표에 없는 그림은 AssetNotFound 이고 아무것도 안 바뀐다', async () => {
    await expect(
      repo.create({ ...milk, iconAssetId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect(await db.select().from(items)).toEqual([])
  })
})
