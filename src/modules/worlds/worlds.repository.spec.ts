import { tradeGroups } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  NoTradeGroup,
  NoWorld,
  PeriodNotAfter,
  PeriodOverlap,
  WorldExists,
  type WorldInput,
  WorldsRepository,
} from './worlds.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['worlds/challengers.png', 'worlds/scania.png']

describeDb('WorldsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: WorldsRepository
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new WorldsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
    await db.insert(tradeGroups).values([
      { key: 'general', name: '일반 월드' },
      { key: 'helios_eos', name: '에오스 · 핼리오스' },
    ])
    scania = {
      key: 'scania',
      name: '스카니아',
      emblemAssetId: assetIds['worlds/scania.png'] ?? null,
      isChallengers: false,
      isEvent: false,
    }
    challengers5 = {
      key: 'challengers_5',
      name: '챌린저스5',
      emblemAssetId: assetIds['worlds/challengers.png'] ?? null,
      isChallengers: true,
      isEvent: false,
    }
  })
  afterAll(() => close())

  let scania: WorldInput
  let challengers5: WorldInput
  const special: WorldInput = {
    key: 'special',
    name: '스페셜',
    emblemAssetId: null,
    isChallengers: false,
    isEvent: true,
  }

  it('더한 차례로 내고 같은 key 는 WorldExists 다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, worlds: [], worldOpenPeriods: [] })
    await repo.create(scania)
    await repo.create(challengers5)
    await repo.create(special)
    await expect(repo.create(scania)).rejects.toBeInstanceOf(WorldExists)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.worlds).toMatchObject([scania, challengers5, special])
    expect(section.worlds.map((w) => Object.keys(w).sort())[0]).toEqual([
      'emblemAssetId',
      'id',
      'isChallengers',
      'isEvent',
      'key',
      'name',
    ])
  })

  it('이름 · 엠블럼 · 챌린저스 · 이벤트를 고치고 차례를 옮긴다. 모르는 key 는 false 다', async () => {
    await repo.create(scania)
    await repo.create(challengers5)

    expect(
      await repo.update('challengers_5', {
        name: '챌린저스5',
        emblemAssetId: assetIds['worlds/challengers.png'] ?? null,
        isChallengers: false,
        isEvent: false,
      }),
    ).toBe(true)
    expect(
      await repo.update('nobody', {
        name: 'x',
        emblemAssetId: null,
        isChallengers: false,
        isEvent: false,
      }),
    ).toBe(false)
    expect(await repo.move('challengers_5', 'up')).toBe(true)
    expect(await repo.move('challengers_5', 'up')).toBe(true)
    expect(await repo.move('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.worlds.map((w) => [w.key, w.isChallengers])).toEqual([
      ['challengers_5', false],
      ['scania', false],
    ])
  })

  // 거래권은 관리 화면에만 있다. 앱의 게임 데이터에 실리면 기기 사본까지 바뀐다.
  it('거래권은 adminSection 에만 보이고 안 주면 general, null 이면 시세 제외, 고칠 때 안 주면 그대로다', async () => {
    await repo.create({ ...scania, key: 'eos', name: '에오스', tradeGroupKey: 'helios_eos' })
    await repo.create(scania)
    await repo.create({ ...special, tradeGroupKey: null })
    await repo.update('eos', { ...scania, name: '에오스' })

    expect((await repo.section()).worlds.every((w) => !('tradeGroupKey' in w))).toBe(true)
    const admin = await repo.adminSection()
    expect(admin.worlds.map((w) => [w.key, w.tradeGroupKey])).toEqual([
      ['eos', 'helios_eos'],
      ['scania', 'general'],
      ['special', null],
    ])
    expect(admin.tradeGroups.map((g) => g.key)).toEqual(['general', 'helios_eos'])
  })

  it('거래권 표에 없는 거래권은 NoTradeGroup, 그림 표에 없는 엠블럼은 AssetNotFound 이고 아무것도 안 바뀐다', async () => {
    await expect(repo.create({ ...scania, tradeGroupKey: 'nobody' })).rejects.toBeInstanceOf(
      NoTradeGroup,
    )
    await expect(
      repo.create({ ...scania, emblemAssetId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect((await repo.section()).worlds).toEqual([])
  })

  /** 같은 밀리초에 두 회차가 돌면 칸 시각이 같아 바뀌었는지 가를 수 없다. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

  // 같은 이름의 월드가 시즌마다 다시 열려 기간이 여러 줄이다. 앱은 월드 줄 id 로 기간을 찾는다.
  it('열린 기간은 worldOpenPeriods 배열에 월드 줄 id 와 함께 시작 차례로 싣고, 기간 줄 id 는 adminSection 에만 있다', async () => {
    await repo.create(scania)
    await repo.create(special)
    await repo.addPeriod('special', { validFrom: '2026-12-03', validUntil: '2027-01-07' })
    const first = await repo.addPeriod('special', {
      validFrom: '2025-11-20',
      validUntil: '2025-12-19',
    })

    const section = await repo.section()
    const worldId = section.worlds.find((w) => w.key === 'special')?.id
    expect(section.worldOpenPeriods).toEqual([
      { worldId, validFrom: '2025-11-20', validUntil: '2025-12-19' },
      { worldId, validFrom: '2026-12-03', validUntil: '2027-01-07' },
    ])
    const admin = (await repo.adminSection()).worlds.find((w) => w.key === 'special')
    expect(admin?.openPeriods[0]).toEqual({
      id: first.id,
      validFrom: '2025-11-20',
      validUntil: '2025-12-19',
    })
  })

  it('기간을 더하고 고치고 지우면 칸의 updatedAt 이 바뀐다. 모르는 월드 · 기간은 거절한다', async () => {
    await repo.create(special)
    const at = async () => (await repo.section()).updatedAt

    let before = await at()
    await tick()
    const { id } = await repo.addPeriod('special', {
      validFrom: '2025-11-20',
      validUntil: '2025-12-18',
    })
    expect(await at()).not.toBe(before)

    before = await at()
    await tick()
    expect(await repo.updatePeriod(id, { validFrom: '2025-11-20', validUntil: '2025-12-19' })).toBe(
      true,
    )
    expect(await at()).not.toBe(before)
    const worldId = (await repo.section()).worlds[0]?.id
    expect((await repo.section()).worldOpenPeriods).toEqual([
      { worldId, validFrom: '2025-11-20', validUntil: '2025-12-19' },
    ])

    before = await at()
    await tick()
    expect(await repo.removePeriod(id)).toBe(true)
    expect(await at()).not.toBe(before)
    expect((await repo.section()).worldOpenPeriods).toEqual([])

    await expect(
      repo.addPeriod('nobody', { validFrom: '2025-11-20', validUntil: '2025-12-19' }),
    ).rejects.toBeInstanceOf(NoWorld)
    expect(await repo.updatePeriod(id, { validFrom: '2025-11-20', validUntil: '2025-12-19' })).toBe(
      false,
    )
    expect(await repo.removePeriod(id)).toBe(false)
  })

  // 끝은 닫힌 다음 날이라 앞 기간의 끝과 뒤 기간의 시작이 같은 날이면 겹치지 않는다.
  it('같은 월드의 기간이 겹치거나 끝이 시작보다 뒤가 아니면 거절하고 아무것도 안 바뀐다', async () => {
    await repo.create(scania)
    await repo.create(special)
    const { id } = await repo.addPeriod('special', {
      validFrom: '2025-11-20',
      validUntil: '2025-12-19',
    })
    await repo.addPeriod('special', { validFrom: '2025-12-19', validUntil: '2026-01-01' })
    await repo.addPeriod('scania', { validFrom: '2025-11-20', validUntil: '2025-12-19' })
    const before = await repo.section()
    await tick()

    await expect(
      repo.addPeriod('special', { validFrom: '2025-12-01', validUntil: '2025-12-25' }),
    ).rejects.toBeInstanceOf(PeriodOverlap)
    await expect(
      repo.addPeriod('special', { validFrom: '2026-02-01', validUntil: '2026-02-01' }),
    ).rejects.toBeInstanceOf(PeriodNotAfter)
    await expect(
      repo.updatePeriod(id, { validFrom: '2025-11-20', validUntil: '2025-12-20' }),
    ).rejects.toBeInstanceOf(PeriodOverlap)
    await expect(
      repo.updatePeriod(id, { validFrom: '2025-12-19', validUntil: '2025-11-20' }),
    ).rejects.toBeInstanceOf(PeriodNotAfter)

    expect(await repo.section()).toEqual(before)
  })
})
