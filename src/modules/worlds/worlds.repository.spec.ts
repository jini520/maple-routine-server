import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import {
  NoWorld,
  PeriodNotAfter,
  PeriodOverlap,
  WorldExists,
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
  })
  afterAll(() => close())

  const scania = {
    key: 'scania',
    name: '스카니아',
    emblem: 'scania',
    challengers: false,
    event: false,
  }
  const challengers5 = {
    key: 'challengers_5',
    name: '챌린저스5',
    emblem: 'challengers',
    challengers: true,
    event: false,
  }
  const special = { key: 'special', name: '스페셜', emblem: null, challengers: false, event: true }

  it('더한 차례로 내고 같은 key 는 WorldExists 다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, worlds: [] })
    await repo.create(scania)
    await repo.create(challengers5)
    await repo.create(special)
    await expect(repo.create(scania)).rejects.toBeInstanceOf(WorldExists)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.worlds).toEqual([
      { ...scania, emblemAssetId: assetIds['worlds/scania.png'], periods: [] },
      { ...challengers5, emblemAssetId: assetIds['worlds/challengers.png'], periods: [] },
      { ...special, emblemAssetId: null, periods: [] },
    ])
  })

  it('이름 · 엠블럼 · 챌린저스 · 이벤트를 고치고 차례를 옮긴다. 모르는 key 는 false 다', async () => {
    await repo.create(scania)
    await repo.create(challengers5)

    expect(
      await repo.update('challengers_5', {
        name: '챌린저스5',
        emblem: 'challengers',
        challengers: false,
        event: false,
      }),
    ).toBe(true)
    expect(
      await repo.update('nobody', { name: 'x', emblem: null, challengers: false, event: false }),
    ).toBe(false)
    expect(await repo.move('challengers_5', 'up')).toBe(true)
    expect(await repo.move('challengers_5', 'up')).toBe(true)
    expect(await repo.move('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.worlds.map((w) => [w.key, w.challengers])).toEqual([
      ['challengers_5', false],
      ['scania', false],
    ])
  })

  // 거래권은 관리 화면에만 있다. 앱의 게임 데이터에 실리면 번들 사본까지 바뀐다.
  it('거래권은 adminSection 에만 보이고 안 주면 general, null 이면 시세 제외, 고칠 때 안 주면 그대로다', async () => {
    await repo.create({ ...scania, key: 'eos', name: '에오스', priceGroup: 'helios_eos' })
    await repo.create(scania)
    await repo.create({ ...special, priceGroup: null })
    await repo.update('eos', { name: '에오스', emblem: null, challengers: false, event: false })

    expect((await repo.section()).worlds.every((w) => !('priceGroup' in w))).toBe(true)
    expect((await repo.adminSection()).worlds.map((w) => [w.key, w.priceGroup])).toEqual([
      ['eos', 'helios_eos'],
      ['scania', 'general'],
      ['special', null],
    ])
  })

  /** 같은 밀리초에 두 회차가 돌면 칸 시각이 같아 바뀌었는지 가를 수 없다. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

  // 같은 이름의 월드가 시즌마다 다시 열려 기간이 여러 줄이다. 앱은 from 차례로 읽고, 기간이 없는 월드도 배열을 받는다.
  it('월드마다 기간을 from 차례로 싣고 없으면 빈 배열이며, id 는 adminSection 에만 있다', async () => {
    await repo.create(scania)
    await repo.create(special)
    await repo.addPeriod('special', { from: '2026-12-03', until: '2027-01-07' })
    const first = await repo.addPeriod('special', { from: '2025-11-20', until: '2025-12-19' })

    expect((await repo.section()).worlds.map((w) => [w.key, w.periods])).toEqual([
      ['scania', []],
      [
        'special',
        [
          { from: '2025-11-20', until: '2025-12-19' },
          { from: '2026-12-03', until: '2027-01-07' },
        ],
      ],
    ])
    const admin = (await repo.adminSection()).worlds.find((w) => w.key === 'special')
    expect(admin?.periods[0]).toEqual({ id: first.id, from: '2025-11-20', until: '2025-12-19' })
  })

  it('기간을 더하고 고치고 지우면 칸의 updatedAt 이 바뀐다. 모르는 월드 · 기간은 거절한다', async () => {
    await repo.create(special)
    const at = async () => (await repo.section()).updatedAt

    let before = await at()
    await tick()
    const { id } = await repo.addPeriod('special', { from: '2025-11-20', until: '2025-12-18' })
    expect(await at()).not.toBe(before)

    before = await at()
    await tick()
    expect(await repo.updatePeriod(id, { from: '2025-11-20', until: '2025-12-19' })).toBe(true)
    expect(await at()).not.toBe(before)
    expect((await repo.section()).worlds[0]?.periods).toEqual([
      { from: '2025-11-20', until: '2025-12-19' },
    ])

    before = await at()
    await tick()
    expect(await repo.removePeriod(id)).toBe(true)
    expect(await at()).not.toBe(before)
    expect((await repo.section()).worlds[0]?.periods).toEqual([])

    await expect(
      repo.addPeriod('nobody', { from: '2025-11-20', until: '2025-12-19' }),
    ).rejects.toBeInstanceOf(NoWorld)
    expect(await repo.updatePeriod(id, { from: '2025-11-20', until: '2025-12-19' })).toBe(false)
    expect(await repo.removePeriod(id)).toBe(false)
  })

  // until 은 닫힌 다음 날이라 앞 기간의 until 과 뒤 기간의 from 이 같은 날이면 겹치지 않는다.
  it('같은 월드의 기간이 겹치거나 until 이 from 보다 뒤가 아니면 거절하고 아무것도 안 바뀐다', async () => {
    await repo.create(scania)
    await repo.create(special)
    const { id } = await repo.addPeriod('special', { from: '2025-11-20', until: '2025-12-19' })
    await repo.addPeriod('special', { from: '2025-12-19', until: '2026-01-01' })
    await repo.addPeriod('scania', { from: '2025-11-20', until: '2025-12-19' })
    const before = await repo.section()
    await tick()

    await expect(
      repo.addPeriod('special', { from: '2025-12-01', until: '2025-12-25' }),
    ).rejects.toBeInstanceOf(PeriodOverlap)
    await expect(
      repo.addPeriod('special', { from: '2026-02-01', until: '2026-02-01' }),
    ).rejects.toBeInstanceOf(PeriodNotAfter)
    await expect(
      repo.updatePeriod(id, { from: '2025-11-20', until: '2025-12-20' }),
    ).rejects.toBeInstanceOf(PeriodOverlap)
    await expect(
      repo.updatePeriod(id, { from: '2025-12-19', until: '2025-11-20' }),
    ).rejects.toBeInstanceOf(PeriodNotAfter)

    expect(await repo.section()).toEqual(before)
  })
})
