import { appImages, gameDataSections } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
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

  it('그림을 바꾸면 칸의 시각을 밀고, 같은 그림이면 그대로 두며, 모르는 key 는 false · 없는 그림은 AssetNotFound 다', async () => {
    const ids = await insertAssets(db, ['items/meso_pouch.webp', 'items/meso_pouch_new.webp'])
    await db
      .insert(appImages)
      .values({ key: 'meso_pouch', assetId: ids['items/meso_pouch.webp'] ?? '' })
    const touched = async () => (await db.select().from(gameDataSections)).length

    expect(await repo.set('meso_pouch', ids['items/meso_pouch.webp'] ?? '')).toBe(true)
    expect(await touched()).toBe(0)
    expect(await repo.set('meso_pouch', ids['items/meso_pouch_new.webp'] ?? '')).toBe(true)
    expect((await repo.section()).images).toEqual([
      { key: 'meso_pouch', assetId: ids['items/meso_pouch_new.webp'] },
    ])
    expect(await touched()).toBe(1)
    expect(await repo.set('nobody', ids['items/meso_pouch.webp'] ?? '')).toBe(false)
    await expect(
      repo.set('meso_pouch', '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(AssetNotFound)
  })
})
