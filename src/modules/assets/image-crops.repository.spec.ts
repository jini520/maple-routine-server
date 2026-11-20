import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from './asset-refs'
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

  it('종류 · 그림 하나에 줄 하나를 갈아 끼워 표 이름의 배열에 숫자 셋으로 내고, 지우면 칸 시각을 민다', async () => {
    const zakum = assetIds['bosses/zakum.webp'] ?? ''
    const arcana = assetIds['maps/arcana.webp'] ?? ''
    expect(await repo.section()).toEqual({ updatedAt: null, imageCrops: [] })
    await repo.put('boss_portrait', zakum, {
      widthPercent: 100,
      positionXPercent: 50,
      positionYPercent: 45,
    })
    await repo.put('boss_portrait', zakum, {
      widthPercent: 120,
      positionXPercent: 50,
      positionYPercent: 40.5,
    })
    await repo.put('daily_quest_region', arcana, {
      widthPercent: 200,
      positionXPercent: 100,
      positionYPercent: -5,
    })
    const section = await repo.section()
    expect(section.imageCrops).toEqual([
      {
        type: 'boss_portrait',
        assetId: zakum,
        widthPercent: 120,
        positionXPercent: 50,
        positionYPercent: 40.5,
      },
      {
        type: 'daily_quest_region',
        assetId: arcana,
        widthPercent: 200,
        positionXPercent: 100,
        positionYPercent: -5,
      },
    ])
    await expect(
      repo.put('boss_portrait', '00000000-0000-4000-8000-000000000000', {
        widthPercent: 1,
        positionXPercent: 1,
        positionYPercent: 1,
      }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    const before = section.updatedAt
    expect(await repo.remove('boss_portrait', zakum)).toBe(true)
    expect(await repo.remove('boss_portrait', zakum)).toBe(false)
    const after = await repo.section()
    expect(after.imageCrops).toHaveLength(1)
    expect(after.updatedAt).not.toBe(before)
  })
})
