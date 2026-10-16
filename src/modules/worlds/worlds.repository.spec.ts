import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { WorldExists, WorldsRepository } from './worlds.repository'

describeDb('WorldsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: WorldsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new WorldsRepository(db)
  })
  beforeEach(() => truncate())
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
    expect(section.worlds).toEqual([scania, challengers5, special])
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
})
