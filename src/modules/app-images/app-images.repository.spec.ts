import { appImages } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { touchSection } from '../game-data/sections'
import { AppImagesRepository } from './app-images.repository'

describeDb('AppImagesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: AppImagesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new AppImagesRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('줄마다 key 와 그림 id 를 key 차례로 내고, 칸의 시각은 칸 표의 값이다', async () => {
    const ids = await insertAssets(db, ['items/meso_pouch.webp', 'drop-effect/loop/10.webp'])
    await db.insert(appImages).values([
      { key: 'meso_pouch', assetId: ids['items/meso_pouch.webp'] ?? '' },
      { key: 'drop_effect_loop_10', assetId: ids['drop-effect/loop/10.webp'] ?? '' },
    ])
    expect(await repo.section()).toEqual({
      updatedAt: null,
      images: [
        { key: 'drop_effect_loop_10', assetId: ids['drop-effect/loop/10.webp'] },
        { key: 'meso_pouch', assetId: ids['items/meso_pouch.webp'] },
      ],
    })

    await touchSection(db, 'appImages')
    expect((await repo.section()).updatedAt).toEqual(expect.any(String))
  })
})
