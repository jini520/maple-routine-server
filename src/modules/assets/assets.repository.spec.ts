import { eq } from 'drizzle-orm'

import { assets, gameDataSections, imageCrops } from '../../database/schema'
import {
  describeDb,
  insertAssets,
  insertItems,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { AssetInUse, AssetsRepository } from './assets.repository'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)

describeDb('AssetsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: AssetsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new AssetsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('빈 표는 updatedAt null 이고, 넣으면 경로 차례로 디스크 파일 이름과 함께 낸다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, files: [] })
    await repo.put('worlds/reboot.png', SHA_B, { size: 10, width: 10, height: 20 })
    await repo.put('bosses/bellona.webp', SHA_A, { size: 20, width: 10, height: 20 })
    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    const idOf = new Map(
      (await db.select({ id: assets.id, path: assets.path }).from(assets)).map((r) => [
        r.path,
        r.id,
      ]),
    )
    expect(section.files).toEqual([
      {
        id: idOf.get('bosses/bellona.webp'),
        path: 'bosses/bellona.webp',
        file: `${SHA_A}.webp`,
        sha256: SHA_A,
        size: 20,
        width: 10,
        height: 20,
      },
      {
        id: idOf.get('worlds/reboot.png'),
        path: 'worlds/reboot.png',
        file: `${SHA_B}.png`,
        sha256: SHA_B,
        size: 10,
        width: 10,
        height: 20,
      },
    ])
  })

  it('같은 내용이면 칸 시각을 밀지 않고, 다른 내용이면 해시를 바꾸고 민다', async () => {
    expect(await repo.put('bosses/bellona.webp', SHA_A, { size: 20, width: 10, height: 20 })).toBe(
      'created',
    )
    const first = (await repo.section()).updatedAt
    expect(await repo.put('bosses/bellona.webp', SHA_A, { size: 20, width: 10, height: 20 })).toBe(
      'same',
    )
    expect((await repo.section()).updatedAt).toBe(first)
    expect(await repo.put('bosses/bellona.webp', SHA_B, { size: 30, width: 10, height: 20 })).toBe(
      'updated',
    )
    const after = await repo.section()
    expect(after.files[0]?.sha256).toBe(SHA_B)
    expect(after.updatedAt).not.toBe(first)
  })

  it('칸 값마다 그림이 없는 것만 돌려준다', async () => {
    await repo.put('bosses/bellona.webp', SHA_A, { size: 20, width: 10, height: 20 })
    await repo.put('items/rings/ring.png', SHA_A, { size: 20, width: 10, height: 20 })
    expect(
      await repo.missing([
        { ref: 'bossPortrait', value: 'bellona' },
        { ref: 'itemIcon', value: 'ring.png' },
        { ref: 'bossPortrait', value: 'nobody' },
      ]),
    ).toEqual(['nobody'])
  })

  it('관리 목록은 이름이 비면 쓰는 곳의 이름, 쓰는 곳도 없으면 파일 이름을 보이고 아이템 분류를 든다', async () => {
    const ids = await insertAssets(db, [
      'items/pendant.png',
      'skills/KAPCL.png',
      'bosses/named.webp',
    ])
    await insertItems(db, [
      { key: 'p', name: '그린 펜던트', category: 'pendant', iconAssetId: ids['items/pendant.png'] },
    ])
    await db
      .update(assets)
      .set({ name: '이름 붙인 보스' })
      .where(eq(assets.id, ids['bosses/named.webp'] ?? ''))
    const rows = new Map((await repo.adminRows()).map((r) => [r.path, r]))
    expect(rows.get('items/pendant.png')).toMatchObject({
      label: '그린 펜던트',
      name: null,
      itemCategory: 'pendant',
      uses: [{ kind: '아이템', name: '그린 펜던트', itemCategory: 'pendant' }],
    })
    expect(rows.get('skills/KAPCL.png')).toMatchObject({ label: 'KAPCL', name: null, uses: [] })
    expect(rows.get('bosses/named.webp')).toMatchObject({
      label: '이름 붙인 보스',
      name: '이름 붙인 보스',
    })
  })

  it('이름은 적고 비울 수 있고, 앱에 내는 그림 칸의 시각은 밀지 않는다', async () => {
    await repo.put('bosses/bellona.webp', SHA_A, { size: 20, width: 10, height: 20 })
    const before = (await repo.section()).updatedAt
    const id = (await repo.section()).files[0]?.id ?? ''
    expect(await repo.rename(id, '벨로나')).toBe(true)
    expect((await repo.adminRows())[0]?.label).toBe('벨로나')
    expect(await repo.rename(id, null)).toBe(true)
    expect((await repo.adminRows())[0]?.name).toBeNull()
    expect((await repo.section()).updatedAt).toBe(before)
    expect(await repo.rename('00000000-0000-0000-0000-000000000000', 'x')).toBe(false)
  })

  it('쓰는 곳이 있으면 지우지 않고 그 목록을 알리고, 없으면 그림과 크롭을 지우며 두 칸의 시각을 민다', async () => {
    const ids = await insertAssets(db, ['items/used.png', 'bosses/old.webp'])
    await insertItems(db, [{ key: 'u', name: '쓰는 아이템', iconAssetId: ids['items/used.png'] }])
    await db.insert(imageCrops).values({
      kind: 'boss_portrait',
      assetId: ids['bosses/old.webp'] ?? '',
      size: '120% auto',
      position: '50% 50%',
    })
    await expect(repo.remove(ids['items/used.png'] ?? '')).rejects.toEqual(
      new AssetInUse([{ kind: '아이템', name: '쓰는 아이템', itemCategory: null }]),
    )
    expect(await repo.remove(ids['bosses/old.webp'] ?? '')).toBe(true)
    expect((await db.select().from(assets)).map((r) => r.path)).toEqual(['items/used.png'])
    expect(await db.select().from(imageCrops)).toEqual([])
    const touched = (await db.select({ key: gameDataSections.key }).from(gameDataSections)).map(
      (r) => r.key,
    )
    expect(touched).toEqual(expect.arrayContaining(['assets', 'imageCrops']))
    expect(await repo.remove(ids['bosses/old.webp'] ?? '')).toBe(false)
  })
})
