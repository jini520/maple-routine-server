import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  GroundExists,
  GroundKeyPrefix,
  GroundNameTaken,
  HuntingGroundsRepository,
  NoRegion,
  RegionExists,
} from './hunting-grounds.repository'

describeDb('HuntingGroundsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: HuntingGroundsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HuntingGroundsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  const vanishing = {
    key: 'road_of_vanishing',
    name: '소멸의 여로',
    forceType: 'arcane' as const,
    iconMap: 'roadOfVanishing',
  }
  const cernium = { key: 'cernium', name: '세르니움', forceType: 'authentic' as const, iconMap: null }
  const joy = {
    key: 'road_of_vanishing_weathered_land_of_joy',
    region: 'road_of_vanishing',
    name: '풍화된 기쁨의 땅',
    force: 30,
    mobs: 22,
    levels: [200],
  }
  const joyAndAnger = {
    ...joy,
    key: 'road_of_vanishing_weathered_land_of_joy_and_anger',
    name: '풍화된 기쁨과 분노의 땅',
    mobs: 29,
    levels: [201, 200],
  }

  it('지역 · 사냥터는 더한 차례로 내고 레벨은 오름차순이다. 같은 key 는 RegionExists 다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      regions: [],
      grounds: [],
      groundLevels: [],
    })
    await repo.createRegion(vanishing)
    await repo.createRegion(cernium)
    await expect(repo.createRegion(vanishing)).rejects.toBeInstanceOf(RegionExists)
    await repo.createGround(joy)
    await repo.createGround(joyAndAnger)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.regions).toEqual([vanishing, cernium])
    expect(section.grounds.map((g) => g.key)).toEqual([joy.key, joyAndAnger.key])
    expect(section.grounds[0]).toEqual({
      key: joy.key,
      region: 'road_of_vanishing',
      name: '풍화된 기쁨의 땅',
      force: 30,
      mobs: 22,
    })
    expect(section.groundLevels).toEqual([
      { ground: joy.key, level: 200 },
      { ground: joyAndAnger.key, level: 200 },
      { ground: joyAndAnger.key, level: 201 },
    ])
  })

  it('모르는 지역은 NoRegion, 지역 key 로 안 시작하면 GroundKeyPrefix, 같은 이름은 GroundNameTaken, 같은 key 는 GroundExists 다', async () => {
    await repo.createRegion(vanishing)
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
    expect((await repo.section()).grounds).toHaveLength(1)
  })

  it('지역 · 사냥터를 고치고 차례를 옮긴다. 레벨 목록은 통째로 바뀌고 자기 이름은 겹침이 아니다. 모르는 key 는 false 다', async () => {
    await repo.createRegion(vanishing)
    await repo.createRegion(cernium)
    await repo.createGround(joy)
    await repo.createGround(joyAndAnger)

    expect(
      await repo.updateRegion('cernium', { name: '세르니움', forceType: 'authentic', iconMap: 'cernium' }),
    ).toBe(true)
    expect(
      await repo.updateRegion('limen', { name: '리멘', forceType: 'arcane', iconMap: null }),
    ).toBe(false)
    expect(await repo.moveRegion('cernium', 'up')).toBe(true)
    expect(await repo.moveRegion('cernium', 'up')).toBe(true)
    expect(await repo.moveRegion('limen', 'up')).toBe(false)

    expect(
      await repo.updateGround(joy.key, {
        name: '풍화된 기쁨의 땅',
        force: 30,
        mobs: 30,
        levels: [200, 201],
      }),
    ).toBe(true)
    await expect(
      repo.updateGround(joy.key, {
        name: '풍화된 기쁨과 분노의 땅',
        force: 30,
        mobs: 30,
        levels: [200],
      }),
    ).rejects.toBeInstanceOf(GroundNameTaken)
    expect(await repo.updateGround('nobody', { name: 'x', force: 0, mobs: 1, levels: [1] })).toBe(
      false,
    )
    expect(await repo.moveGround(joyAndAnger.key, 'up')).toBe(true)
    expect(await repo.moveGround('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.regions.map((r) => r.key)).toEqual(['cernium', 'road_of_vanishing'])
    expect(section.grounds.map((g) => [g.key, g.mobs])).toEqual([
      [joyAndAnger.key, 29],
      [joy.key, 30],
    ])
    expect(section.groundLevels.filter((l) => l.ground === joy.key).map((l) => l.level)).toEqual([
      200, 201,
    ])
  })
})
