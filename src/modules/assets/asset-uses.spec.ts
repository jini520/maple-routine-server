import { sql } from 'drizzle-orm'

import { appImages, mvpGrades } from '../../database/schema'
import {
  describeDb,
  insertAssets,
  insertItems,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { ASSET_USES, assetUses } from './asset-uses'

describeDb('assetUses', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('목록은 그림 표를 FK 로 가리키는 칸 전부다. 크롭은 그림에 딸린 값이라 뺀다', async () => {
    const { rows } = await db.execute<{ t: string }>(sql`
      SELECT kcu.table_name || '.' || kcu.column_name AS t
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'assets' AND kcu.table_name <> 'image_crops'`)
    expect(ASSET_USES.map((u) => `${u.table}.${u.column}`).sort()).toEqual(
      rows.map((r) => r.t).sort(),
    )
  })

  it('그림마다 쓰는 곳의 종류 · 이름을 모으고, 아이템이면 그 분류를 든다', async () => {
    const ids = await insertAssets(db, [
      'items/green_pendant.png',
      'mvp/gold.webp',
      'items/meso_pouch.webp',
      'bosses/unused.webp',
    ])
    await insertItems(db, [
      {
        key: 'bears_green',
        name: '베어스 그린 펜던트',
        category: 'pendant',
        iconAssetId: ids['items/green_pendant.png'],
      },
      {
        key: 'owls_green',
        name: '아울스 그린 펜던트',
        category: 'pendant',
        iconAssetId: ids['items/green_pendant.png'],
      },
    ])
    await db.insert(mvpGrades).values({
      key: 'gold',
      name: '골드',
      auctionFeePercent: 3,
      starforceDiscountPercent: 5,
      sortOrder: 1,
      plateAssetId: ids['mvp/gold.webp'],
    })
    await db
      .insert(appImages)
      .values({ key: 'meso_pouch', assetId: ids['items/meso_pouch.webp'] ?? '' })

    const uses = await assetUses(db)
    expect(uses.get(ids['items/green_pendant.png'] ?? '')).toEqual([
      { kind: '아이템', name: '베어스 그린 펜던트', itemCategory: 'pendant' },
      { kind: '아이템', name: '아울스 그린 펜던트', itemCategory: 'pendant' },
    ])
    expect(uses.get(ids['mvp/gold.webp'] ?? '')).toEqual([
      { kind: 'MVP 명패', name: '골드', itemCategory: null },
    ])
    expect(uses.get(ids['items/meso_pouch.webp'] ?? '')).toEqual([
      { kind: '앱 그림', name: 'meso_pouch', itemCategory: null },
    ])
    expect(uses.has(ids['bosses/unused.webp'] ?? '')).toBe(false)
  })

  it('그림 하나만 물으면 그 그림의 쓰는 곳만 낸다', async () => {
    const ids = await insertAssets(db, ['items/a.png', 'items/b.png'])
    await insertItems(db, [
      { key: 'a', name: '에이', iconAssetId: ids['items/a.png'] },
      { key: 'b', name: '비', iconAssetId: ids['items/b.png'] },
    ])
    const uses = await assetUses(db, ids['items/a.png'])
    expect([...uses.keys()]).toEqual([ids['items/a.png']])
  })
})
