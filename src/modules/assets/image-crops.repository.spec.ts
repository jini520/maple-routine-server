import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { ImageCropsRepository } from './image-crops.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['bosses/zakum.webp', 'maps/arcana.webp']

describeDb('ImageCropsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: ImageCropsRepository
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ImageCropsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
  })
  afterAll(() => close())

  it('종류 · slug 하나에 줄 하나를 갈아 끼우고, 지우면 칸 시각을 민다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, crops: [] })
    await repo.put('boss_portrait', 'zakum', { size: '100% auto', position: '50% 45%' })
    await repo.put('boss_portrait', 'zakum', { size: '120% auto', position: '50% 40%' })
    await repo.put('daily_quest_region', 'arcana', { size: '200% auto', position: '100% 65%' })
    const section = await repo.section()
    expect(section.crops).toEqual([
      {
        kind: 'boss_portrait',
        slug: 'zakum',
        assetId: assetIds['bosses/zakum.webp'],
        size: '120% auto',
        position: '50% 40%',
      },
      {
        kind: 'daily_quest_region',
        slug: 'arcana',
        assetId: assetIds['maps/arcana.webp'],
        size: '200% auto',
        position: '100% 65%',
      },
    ])
    const before = section.updatedAt
    expect(await repo.remove('boss_portrait', 'zakum')).toBe(true)
    expect(await repo.remove('boss_portrait', 'zakum')).toBe(false)
    const after = await repo.section()
    expect(after.crops).toHaveLength(1)
    expect(after.updatedAt).not.toBe(before)
  })
})
