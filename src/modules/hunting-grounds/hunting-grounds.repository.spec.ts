import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  GroundExists,
  GroundKeyPrefix,
  GroundNameTaken,
  HuntingGroundsRepository,
  NoRegion,
  RegionExists,
} from './hunting-grounds.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['maps/icons/cernium.png', 'maps/icons/roadOfVanishing.png']
const NO_ASSET = '00000000-0000-4000-8000-000000000000'

describeDb('HuntingGroundsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: HuntingGroundsRepository
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HuntingGroundsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
  })
  afterAll(() => close())

  const vanishing = () => ({
    key: 'road_of_vanishing',
    name: '소멸의 여로',
    forceType: 'arcane' as const,
    iconAssetId: assetIds['maps/icons/roadOfVanishing.png'] ?? '',
  })
  const cernium = {
    key: 'cernium',
    name: '세르니움',
    forceType: 'authentic' as const,
    iconAssetId: null,
  }
  const joy = {
    key: 'road_of_vanishing_weathered_land_of_joy',
    region: 'road_of_vanishing',
    name: '풍화된 기쁨의 땅',
    requiredForce: 30,
    mobQuantity: 22,
    mobLevels: [200],
  }
  const joyAndAnger = {
    ...joy,
    key: 'road_of_vanishing_weathered_land_of_joy_and_anger',
    name: '풍화된 기쁨과 분노의 땅',
    mobQuantity: 29,
    mobLevels: [201, 200],
  }

  it('지역 · 사냥터 · 몬스터 레벨은 표 이름의 배열에 더한 차례로 줄 id 로 잇고 레벨은 오름차순이다. 같은 key 는 RegionExists 다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      huntingRegions: [],
      huntingGrounds: [],
      huntingGroundLevels: [],
    })
    const { id: regionId } = await repo.createRegion(vanishing())
    const { id: cerniumId } = await repo.createRegion(cernium)
    await expect(repo.createRegion(vanishing())).rejects.toBeInstanceOf(RegionExists)
    const { id: joyId } = await repo.createGround(joy)
    const { id: joyAndAngerId } = await repo.createGround(joyAndAnger)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.huntingRegions).toEqual([
      { id: regionId, ...vanishing() },
      { id: cerniumId, ...cernium },
    ])
    expect(section.huntingGrounds).toEqual([
      {
        id: joyId,
        key: joy.key,
        regionId,
        name: '풍화된 기쁨의 땅',
        requiredForce: 30,
        mobQuantity: 22,
        isPopular: false,
      },
      {
        id: joyAndAngerId,
        key: joyAndAnger.key,
        regionId,
        name: '풍화된 기쁨과 분노의 땅',
        requiredForce: 30,
        mobQuantity: 29,
        isPopular: false,
      },
    ])
    expect(section.huntingGroundLevels).toEqual([
      { groundId: joyId, mobLevel: 200 },
      { groundId: joyAndAngerId, mobLevel: 200 },
      { groundId: joyAndAngerId, mobLevel: 201 },
    ])

    // 관리 화면은 같은 줄을 key 로 잇는다.
    const admin = await repo.adminRows()
    expect(admin.regions).toEqual([vanishing(), cernium])
    expect(admin.grounds[1]).toEqual({
      key: joyAndAnger.key,
      region: 'road_of_vanishing',
      name: '풍화된 기쁨과 분노의 땅',
      requiredForce: 30,
      mobQuantity: 29,
      isPopular: false,
    })
    expect(admin.groundLevels).toEqual([
      { ground: joy.key, mobLevel: 200 },
      { ground: joyAndAnger.key, mobLevel: 200 },
      { ground: joyAndAnger.key, mobLevel: 201 },
    ])
  })

  it('지역 아이콘이 그림 표에 없는 그림이면 더하지도 고치지도 않고 AssetNotFound 다', async () => {
    await expect(repo.createRegion({ ...cernium, iconAssetId: NO_ASSET })).rejects.toBeInstanceOf(
      AssetNotFound,
    )
    await repo.createRegion(cernium)
    await expect(
      repo.updateRegion('cernium', { ...cernium, iconAssetId: NO_ASSET }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect((await repo.section()).huntingRegions).toMatchObject([{ iconAssetId: null }])
  })

  it('모르는 지역은 NoRegion, 지역 key 로 안 시작하면 GroundKeyPrefix, 같은 이름은 GroundNameTaken, 같은 key 는 GroundExists 다', async () => {
    await repo.createRegion(vanishing())
    await repo.createGround(joy)
    await expect(repo.createGround({ ...joyAndAnger, region: 'limen' })).rejects.toBeInstanceOf(
      NoRegion,
    )
    await expect(repo.createGround({ ...joyAndAnger, key: 'weathered_land' })).rejects.toThrow(
      new GroundKeyPrefix('road_of_vanishing_'),
    )
    await expect(repo.createGround({ ...joyAndAnger, name: '풍화된 기쁨의 땅' })).rejects.toThrow(
      new GroundNameTaken(joy.key),
    )
    await expect(repo.createGround({ ...joyAndAnger, key: joy.key })).rejects.toBeInstanceOf(
      GroundExists,
    )
    expect((await repo.section()).huntingGrounds).toHaveLength(1)
  })

  it('지역 · 사냥터를 고치고 차례를 옮긴다. 레벨 목록은 통째로 바뀌고 자기 이름은 겹침이 아니다. 모르는 key 는 false 다', async () => {
    await repo.createRegion(vanishing())
    await repo.createRegion(cernium)
    await repo.createGround(joy)
    await repo.createGround(joyAndAnger)

    const cerniumIcon = assetIds['maps/icons/cernium.png'] ?? ''
    expect(
      await repo.updateRegion('cernium', {
        name: '세르니움',
        forceType: 'authentic',
        iconAssetId: cerniumIcon,
      }),
    ).toBe(true)
    expect(
      await repo.updateRegion('limen', { name: '리멘', forceType: 'arcane', iconAssetId: null }),
    ).toBe(false)
    expect(await repo.moveRegion('cernium', 'up')).toBe(true)
    expect(await repo.moveRegion('cernium', 'up')).toBe(true)
    expect(await repo.moveRegion('limen', 'up')).toBe(false)

    expect(
      await repo.updateGround(joy.key, {
        name: '풍화된 기쁨의 땅',
        requiredForce: 30,
        mobQuantity: 30,
        mobLevels: [200, 201],
      }),
    ).toBe(true)
    await expect(
      repo.updateGround(joy.key, {
        name: '풍화된 기쁨과 분노의 땅',
        requiredForce: 30,
        mobQuantity: 30,
        mobLevels: [200],
      }),
    ).rejects.toBeInstanceOf(GroundNameTaken)
    expect(
      await repo.updateGround('nobody', {
        name: 'x',
        requiredForce: 0,
        mobQuantity: 1,
        mobLevels: [1],
      }),
    ).toBe(false)
    expect(await repo.moveGround(joyAndAnger.key, 'up')).toBe(true)
    expect(await repo.moveGround('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.huntingRegions.map((r) => [r.key, r.iconAssetId])).toEqual([
      ['cernium', cerniumIcon],
      ['road_of_vanishing', vanishing().iconAssetId],
    ])
    expect(section.huntingGrounds.map((g) => [g.key, g.mobQuantity])).toEqual([
      [joyAndAnger.key, 29],
      [joy.key, 30],
    ])
    const joyId = section.huntingGrounds[1]?.id
    expect(
      section.huntingGroundLevels.filter((l) => l.groundId === joyId).map((l) => l.mobLevel),
    ).toEqual([200, 201])
  })

  it('인기를 바꾸면 응답의 isPopular 와 updatedAt 이 함께 움직이고, 사냥터를 고쳐도 인기는 그대로다. 모르는 key 는 false 다', async () => {
    await repo.createRegion(vanishing())
    await repo.createGround(joy)
    await repo.createGround(joyAndAnger)
    const before = await repo.section()
    expect(before.huntingGrounds.map((g) => g.isPopular)).toEqual([false, false])

    expect(await repo.setGroundPopular(joyAndAnger.key, true)).toBe(true)
    const after = await repo.section()
    expect(after.huntingGrounds.map((g) => [g.key, g.isPopular])).toEqual([
      [joy.key, false],
      [joyAndAnger.key, true],
    ])
    expect(after.updatedAt).not.toBe(before.updatedAt)

    await repo.updateGround(joyAndAnger.key, {
      name: joyAndAnger.name,
      requiredForce: 30,
      mobQuantity: 30,
      mobLevels: [201],
    })
    expect((await repo.section()).huntingGrounds[1]).toMatchObject({
      mobQuantity: 30,
      isPopular: true,
    })

    expect(await repo.setGroundPopular('nobody', true)).toBe(false)
  })
})
