import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  LevelOutOfRange,
  LevelsAboveMax,
  LevelsIncomplete,
  NoSymbol,
  NoSymbolGroup,
  NotAfterCurrent,
  NotLatest,
  OnlyRow,
  SymbolCostsRepository,
  SymbolExists,
  SymbolGroupExists,
} from './symbol-costs.repository'

describeDb('SymbolCostsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: SymbolCostsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new SymbolCostsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  const grand = {
    key: 'grand_authentic',
    name: '그랜드 어센틱 심볼',
    maxLevel: 4,
    defaultFrom: 1,
    defaultTo: 3,
  }
  const tallahart = {
    key: 'tallahart',
    group: 'grand_authentic',
    name: '탈라하트',
    requiredLevel: 290,
    iconFile: 'grand_authentic_symbol_tallahart.webp',
  }
  const three = [
    { level: 1, costMeso: 100 },
    { level: 2, costMeso: 200 },
    { level: 3, costMeso: 300 },
  ]

  it('빈 표는 칸 전부가 빈다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      groups: [],
      symbols: [],
      levelCosts: [],
    })
    expect(await repo.adminRows()).toEqual({ updatedAt: null, groups: [] })
  })

  it('묶음과 심볼을 더하고, 비용은 레벨 전부를 한 번에 넣는다. 빠지면 LevelsIncomplete 다', async () => {
    await repo.createGroup(grand)
    await expect(repo.createGroup(grand)).rejects.toBeInstanceOf(SymbolGroupExists)
    await expect(repo.createSymbol({ ...tallahart, group: 'nobody' })).rejects.toBeInstanceOf(
      NoSymbolGroup,
    )
    await repo.createSymbol(tallahart)
    await expect(repo.createSymbol(tallahart)).rejects.toBeInstanceOf(SymbolExists)
    await expect(repo.addCosts('nobody', { from: null, costs: three })).rejects.toBeInstanceOf(
      NoSymbol,
    )
    await expect(
      repo.addCosts('tallahart', { from: null, costs: three.slice(0, 2) }),
    ).rejects.toBeInstanceOf(LevelsIncomplete)
    await expect(
      repo.addCosts('tallahart', { from: null, costs: [...three, { level: 4, costMeso: 1 }] }),
    ).rejects.toBeInstanceOf(LevelOutOfRange)
    expect(await repo.addCosts('tallahart', { from: '2026-09-17', costs: three })).toEqual({
      inserted: 3,
    })

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.groups).toEqual([grand])
    expect(section.symbols).toEqual([tallahart])
    expect(section.levelCosts).toEqual(
      three.map((c) => ({ symbol: 'tallahart', ...c, from: '2026-09-17', until: null })),
    )
    const admin = await repo.adminRows()
    expect(admin.groups[0]?.symbols[0]?.levels.map((l) => [l.level, l.costs.length])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
  })

  it('새 비용은 지금 줄을 닫고 새 줄을 연다. 시작이 없거나 앞이거나 날짜가 아니면 NotAfterCurrent 다', async () => {
    await repo.createGroup(grand)
    await repo.createSymbol(tallahart)
    await repo.addCosts('tallahart', { from: '2026-09-17', costs: three })

    await expect(
      repo.addCosts('tallahart', { from: null, costs: [{ level: 2, costMeso: 250 }] }),
    ).rejects.toBeInstanceOf(NotAfterCurrent)
    await expect(
      repo.addCosts('tallahart', { from: '2026-09-10', costs: [{ level: 2, costMeso: 250 }] }),
    ).rejects.toBeInstanceOf(NotAfterCurrent)
    await expect(
      repo.addCosts('tallahart', { from: '2026-02-30', costs: [{ level: 2, costMeso: 250 }] }),
    ).rejects.toBeInstanceOf(NotAfterCurrent)
    await repo.addCosts('tallahart', { from: '2026-10-22', costs: [{ level: 2, costMeso: 250 }] })

    const section = await repo.section()
    expect(section.levelCosts.filter((c) => c.level === 2)).toEqual([
      { symbol: 'tallahart', level: 2, costMeso: 200, from: '2026-09-17', until: '2026-10-22' },
      { symbol: 'tallahart', level: 2, costMeso: 250, from: '2026-10-22', until: null },
    ])
  })

  it('지금 줄을 거두면 앞 줄이 다시 열리고, 지난 줄과 유일한 줄은 못 거둔다', async () => {
    await repo.createGroup(grand)
    await repo.createSymbol(tallahart)
    await repo.addCosts('tallahart', { from: '2026-09-17', costs: three })
    await repo.addCosts('tallahart', { from: '2026-10-22', costs: [{ level: 2, costMeso: 250 }] })
    const admin = await repo.adminRows()
    const level2 = admin.groups[0]?.symbols[0]?.levels[1]?.costs ?? []
    const level1 = admin.groups[0]?.symbols[0]?.levels[0]?.costs ?? []

    await expect(repo.removeLatest(level2[0]?.id ?? '')).rejects.toBeInstanceOf(NotLatest)
    await expect(repo.removeLatest(level1[0]?.id ?? '')).rejects.toBeInstanceOf(OnlyRow)
    expect(await repo.removeLatest(level2[1]?.id ?? '')).toBe(true)
    expect(await repo.removeLatest(level2[1]?.id ?? '')).toBe(false)
    expect((await repo.section()).levelCosts.filter((c) => c.level === 2)).toEqual([
      { symbol: 'tallahart', level: 2, costMeso: 200, from: '2026-09-17', until: null },
    ])
  })

  it('묶음을 고치고 심볼을 고치고 옮긴다. 만렙은 비용 줄 위로 못 내린다', async () => {
    await repo.createGroup(grand)
    await repo.createSymbol(tallahart)
    await repo.createSymbol({ ...tallahart, key: 'geardrak', name: '기어드락', requiredLevel: 295 })
    await repo.addCosts('tallahart', { from: null, costs: three })

    const fields = { name: grand.name, maxLevel: grand.maxLevel, defaultFrom: 1, defaultTo: 3 }
    await expect(
      repo.updateGroup('grand_authentic', { ...fields, maxLevel: 3, defaultTo: 2 }),
    ).rejects.toBeInstanceOf(LevelsAboveMax)
    expect(await repo.updateGroup('grand_authentic', { ...fields, maxLevel: 5 })).toBe(true)
    expect(await repo.updateGroup('nobody', fields)).toBe(false)
    expect(
      await repo.updateSymbol('geardrak', {
        name: '기어드락!',
        requiredLevel: 295,
        iconFile: 'g.webp',
      }),
    ).toBe(true)
    expect(
      await repo.updateSymbol('nobody', { name: 'x', requiredLevel: 1, iconFile: 'x.webp' }),
    ).toBe(false)
    expect(await repo.moveSymbol('geardrak', 'up')).toBe(true)
    expect(await repo.moveSymbol('geardrak', 'up')).toBe(true)
    expect(await repo.moveSymbol('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.groups[0]?.maxLevel).toBe(5)
    expect(section.symbols.map((s) => [s.key, s.name])).toEqual([
      ['geardrak', '기어드락!'],
      ['tallahart', '탈라하트'],
    ])
    // 만렙을 올리면 레벨 4 가 비어 선다. 화면이 그것을 보이고 addCosts 가 채운다.
    const admin = await repo.adminRows()
    expect(admin.groups[0]?.symbols[1]?.levels.map((l) => l.costs.length)).toEqual([1, 1, 1, 0])
    await expect(
      repo.addCosts('tallahart', { from: '2026-10-22', costs: [{ level: 3, costMeso: 1 }] }),
    ).rejects.toBeInstanceOf(LevelsIncomplete)
    await repo.addCosts('tallahart', { from: '2026-10-22', costs: [{ level: 4, costMeso: 400 }] })
  })
})
