import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  CostLevelsMismatch,
  DefaultTypeTaken,
  HexaCoreExists,
  HexaMatrixRepository,
  HexaStatExists,
  HexaTypeExists,
  JobExists,
  LevelsAboveMax,
  NoHexaType,
  NoJob,
} from './hexa-matrix.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['items/hexa_core_skill.webp', 'skills/a.webp', 'skills/b.webp']
const NO_ASSET = '00000000-0000-4000-8000-000000000000'

describeDb('HexaMatrixRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: HexaMatrixRepository
  let icon: Record<string, string>

  const skillType = () => ({
    key: 'skill',
    name: '스킬 코어',
    apiType: '스킬 코어',
    isDefault: true,
    maxLevel: 3,
    iconAssetId: icon['items/hexa_core_skill.webp'] ?? '',
  })
  const skill3rdType = () => ({
    ...skillType(),
    key: 'skill_3rd',
    name: '3rd 스킬 코어',
    isDefault: false,
  })
  const costs = (base: number) =>
    [0, 1, 2].map((fromLevel) => ({
      fromLevel,
      fragmentQuantity: base + fromLevel,
      solErdaQuantity: fromLevel + 1,
    }))
  const typeId = async (key: string) =>
    (await repo.section()).hexaCoreTypes.find((t) => t.key === key)?.id ?? ''

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HexaMatrixRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    icon = await insertAssets(db, SPEC_ASSETS)
  })
  afterAll(() => close())

  it('빈 표는 표 이름의 배열 다섯이 모두 빈다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      jobs: [],
      hexaCoreTypes: [],
      hexaCores: [],
      hexaCoreLevelCosts: [],
      hexaStats: [],
    })
  })

  it('종류는 더한 차례로 줄 id 와 차례를 들고, 비용은 종류 차례 · 레벨 차례로 종류 줄 id 를 든다', async () => {
    await repo.createType(skill3rdType())
    await repo.createType(skillType())
    await expect(repo.createType(skillType())).rejects.toBeInstanceOf(HexaTypeExists)
    await expect(
      repo.createType({ ...skillType(), key: 'x', isDefault: false, iconAssetId: NO_ASSET }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    await repo.replaceCosts('skill', costs(100))
    await repo.replaceCosts('skill_3rd', costs(140))

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.hexaCoreTypes).toEqual([
      { id: await typeId('skill_3rd'), ...skill3rdType(), sortOrder: 0 },
      { id: await typeId('skill'), ...skillType(), sortOrder: 1 },
    ])
    expect(section.hexaCoreLevelCosts).toEqual([
      ...costs(140).map((c) => ({ typeId: section.hexaCoreTypes[0]?.id, ...c })),
      ...costs(100).map((c) => ({ typeId: section.hexaCoreTypes[1]?.id, ...c })),
    ])
  })

  // 넥슨 타입마다 기본 종류가 둘이면 표에 없는 코어를 넥슨 타입으로 맞출 때 종류가 하나로 안 정해진다.
  it('같은 넥슨 타입에 기본 종류를 둘 두면 DefaultTypeTaken 이다. 더할 때도 고칠 때도 그렇다', async () => {
    await repo.createType(skillType())
    await repo.createType(skill3rdType())
    await expect(repo.createType({ ...skillType(), key: 'skill_new' })).rejects.toBeInstanceOf(
      DefaultTypeTaken,
    )
    await expect(
      repo.updateType('skill_3rd', { ...skill3rdType(), isDefault: true }),
    ).rejects.toBeInstanceOf(DefaultTypeTaken)
    // 자기 자신은 겹침으로 안 본다.
    expect(await repo.updateType('skill', { ...skillType(), name: '스킬 코어!' })).toBe(true)
    expect(await repo.updateType('nobody', skillType())).toBe(false)
    expect((await repo.section()).hexaCoreTypes[0]?.name).toBe('스킬 코어!')
  })

  // 레벨 하나라도 비면 앱이 그 구간의 조각 합을 낼 수 없다.
  it('비용은 0 부터 만렙 - 1 까지 꼭 한 번씩이어야 하고, 어기면 CostLevelsMismatch 로 아무것도 안 바꾼다', async () => {
    await repo.createType(skillType())
    await repo.replaceCosts('skill', costs(100))
    await expect(repo.replaceCosts('skill', costs(1).slice(0, 2))).rejects.toBeInstanceOf(
      CostLevelsMismatch,
    )
    await expect(
      repo.replaceCosts('skill', [
        ...costs(1).slice(0, 2),
        { fromLevel: 1, fragmentQuantity: 1, solErdaQuantity: 1 },
      ]),
    ).rejects.toBeInstanceOf(CostLevelsMismatch)
    await expect(repo.replaceCosts('nobody', costs(1))).rejects.toBeInstanceOf(NoHexaType)
    expect((await repo.section()).hexaCoreLevelCosts.map((c) => c.fragmentQuantity)).toEqual([
      100, 101, 102,
    ])
  })

  it('만렙을 비용 줄 아래로 내리면 LevelsAboveMax 다. 올리는 것은 된다', async () => {
    await repo.createType(skillType())
    await repo.replaceCosts('skill', costs(100))
    await expect(repo.updateType('skill', { ...skillType(), maxLevel: 2 })).rejects.toBeInstanceOf(
      LevelsAboveMax,
    )
    expect(await repo.updateType('skill', { ...skillType(), maxLevel: 4 })).toBe(true)
  })

  it('직업은 이름 차례로 내고 더하고 이름을 고친다. 같은 이름은 JobExists, 모르는 직업은 false 다', async () => {
    const { id } = await repo.createJob({ name: '히어로' })
    const ren = (await repo.createJob({ name: '렌' })).id
    await expect(repo.createJob({ name: '렌' })).rejects.toBeInstanceOf(JobExists)
    expect(await repo.updateJob(id, { name: '팔라딘' })).toBe(true)
    await expect(repo.updateJob(id, { name: '렌' })).rejects.toBeInstanceOf(JobExists)
    expect(await repo.updateJob(NO_ASSET, { name: '비숍' })).toBe(false)

    expect((await repo.section()).jobs).toEqual([
      { id: ren, name: '렌', isAllJobs: false },
      { id, name: '팔라딘', isAllJobs: false },
    ])
  })

  // 차례는 한 직업의 같은 종류 안에서만 뜻이 있다. 앱이 전직업의 코어를 섞어 종류 차례 · 코어 차례로 다시 늘어놓는다.
  it('코어는 직업 · 종류 안 맨 뒤에 더하고, 종류를 바꾸면 새 종류의 맨 뒤로 가며, 옮기기는 같은 직업 · 같은 종류 안에서 한다', async () => {
    await repo.createType(skillType())
    await repo.createType(skill3rdType())
    const ren = (await repo.createJob({ name: '렌' })).id
    const hero = (await repo.createJob({ name: '히어로' })).id
    const a = icon['skills/a.webp'] ?? ''
    const core = (jobId: string, name: string, typeKey: string) => ({
      jobId,
      name,
      typeKey,
      iconAssetId: a,
    })

    const first = await repo.createCore(core(ren, '창룡파천검', 'skill'))
    const second = await repo.createCore(core(ren, '염화무극', 'skill'))
    const third = await repo.createCore(core(ren, '천예', 'skill_3rd'))
    await repo.createCore(core(hero, '창룡파천검', 'skill'))
    await expect(repo.createCore(core(ren, '창룡파천검', 'skill'))).rejects.toBeInstanceOf(
      HexaCoreExists,
    )
    await expect(repo.createCore(core(NO_ASSET, 'x', 'skill'))).rejects.toBeInstanceOf(NoJob)
    await expect(repo.createCore(core(ren, 'x', 'nobody'))).rejects.toBeInstanceOf(NoHexaType)
    await expect(
      repo.createCore({ ...core(ren, 'x', 'skill'), iconAssetId: NO_ASSET }),
    ).rejects.toBeInstanceOf(AssetNotFound)

    const rows = async () =>
      (await repo.section()).hexaCores
        .filter((c) => c.jobId === ren)
        .map((c) => [c.name, c.sortOrder])
    expect(await rows()).toEqual([
      ['창룡파천검', 0],
      ['염화무극', 1],
      ['천예', 0],
    ])
    expect((await repo.section()).hexaCores[0]).toEqual({
      id: first.id,
      jobId: ren,
      name: '창룡파천검',
      typeId: await typeId('skill'),
      iconAssetId: a,
      sortOrder: 0,
    })

    expect(await repo.moveCore(second.id, 'up')).toBe(true)
    // 같은 종류의 끝이라 다른 종류의 코어와 자리를 바꾸지 않는다.
    expect(await repo.moveCore(third.id, 'up')).toBe(true)
    expect(await rows()).toEqual([
      ['염화무극', 0],
      ['창룡파천검', 1],
      ['천예', 0],
    ])

    const b = icon['skills/b.webp'] ?? ''
    expect(
      await repo.updateCore(first.id, {
        name: '창룡파천검!',
        typeKey: 'skill_3rd',
        iconAssetId: b,
      }),
    ).toBe(true)
    expect(await rows()).toEqual([
      ['염화무극', 0],
      ['천예', 0],
      ['창룡파천검!', 1],
    ])
    expect(await repo.updateCore(NO_ASSET, core(ren, 'x', 'skill'))).toBe(false)
    expect(await repo.removeCore(third.id)).toBe(true)
    expect(await repo.removeCore(third.id)).toBe(false)
    expect(await rows()).toEqual([
      ['염화무극', 0],
      ['창룡파천검!', 1],
    ])
  })

  it('스탯은 더한 차례로 줄 id 와 함께 내고 활성화 조각은 비울 수 있다. 같은 key 는 HexaStatExists 다', async () => {
    const { id } = await repo.createStat({
      key: 'hexa_stat_1',
      name: '헥사 스탯 Ⅰ',
      activationFragmentQuantity: 10,
    })
    await repo.createStat({
      key: 'hexa_stat_2',
      name: '헥사 스탯 Ⅱ',
      activationFragmentQuantity: null,
    })
    await expect(
      repo.createStat({ key: 'hexa_stat_1', name: 'x', activationFragmentQuantity: null }),
    ).rejects.toBeInstanceOf(HexaStatExists)
    expect(
      await repo.updateStat('hexa_stat_1', { name: '헥사 스탯 1', activationFragmentQuantity: 20 }),
    ).toBe(true)
    expect(await repo.updateStat('nobody', { name: 'x', activationFragmentQuantity: null })).toBe(
      false,
    )

    const stats = (await repo.section()).hexaStats
    expect(stats.map((s) => [s.key, s.name, s.activationFragmentQuantity])).toEqual([
      ['hexa_stat_1', '헥사 스탯 1', 20],
      ['hexa_stat_2', '헥사 스탯 Ⅱ', null],
    ])
    expect(stats[0]?.id).toBe(id)
  })
})
