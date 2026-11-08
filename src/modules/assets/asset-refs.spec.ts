import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound, refValueOf, resolveAssetId, resolveOptionalAssetId } from './asset-refs'

describe('refValueOf', () => {
  it('파일 이름 칸은 확장자까지, slug 칸은 확장자를 뗀 이름을 돌려준다', () => {
    expect(refValueOf('itemIcon', 'items/rings/Weapon_Jump_Ring.webp')).toBe(
      'Weapon_Jump_Ring.webp',
    )
    expect(refValueOf('bossPortrait', 'bosses/bellona.webp')).toBe('bellona')
    expect(refValueOf('mapIcon', 'maps/icons/roadOfVanishing.png')).toBe('roadOfVanishing')
  })
})

describeDb('그림 칸 값을 그림 id 로 풀기', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('후보가 여럿이면 앱이 찾는 차례대로 앞선 그림이다. 아이템은 items 가 반지 폴더보다, 보스 초상은 webp 가 png 보다 앞이다', async () => {
    const ids = await insertAssets(db, [
      'items/rings/ring.png',
      'items/ring.png',
      'bosses/bellona.png',
      'bosses/bellona.webp',
    ])
    expect(await resolveAssetId(db, 'itemIcon', 'ring.png')).toBe(ids['items/ring.png'])
    expect(await resolveAssetId(db, 'bossPortrait', 'bellona')).toBe(ids['bosses/bellona.webp'])
  })

  it('NFD 로 들어온 한글 이름도 NFC 경로를 찾는다', async () => {
    const ids = await insertAssets(db, ['maps/icons/소멸의여로.png'])
    expect(await resolveAssetId(db, 'mapIcon', '소멸의여로'.normalize('NFD'))).toBe(
      ids['maps/icons/소멸의여로.png'],
    )
  })

  it('표에 없는 그림은 AssetNotFound 이고, 비운 칸은 null 이다', async () => {
    await expect(resolveAssetId(db, 'worldEmblem', 'reboot')).rejects.toThrow(AssetNotFound)
    expect(await resolveOptionalAssetId(db, 'worldEmblem', null)).toBeNull()
  })
})
