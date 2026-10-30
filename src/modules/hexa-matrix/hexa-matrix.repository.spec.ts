import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  CostLevelsMismatch,
  DefaultKindTaken,
  HexaKindExists,
  HexaMatrixRepository,
  HexaStatExists,
  JobCoreExists,
  LevelsAboveMax,
  NameKindExists,
  NoHexaKind,
} from './hexa-matrix.repository'

const skill = {
  key: 'skill',
  name: '스킬 코어',
  apiType: '스킬 코어',
  isDefault: true,
  maxLevel: 3,
  iconFile: 'hexa_core_skill.webp',
}
const skill3rd = { ...skill, key: 'skill_3rd', name: '3rd 스킬 코어', isDefault: false }
const costs = (base: number) =>
  [0, 1, 2].map((level) => ({ level, fragments: base + level, solErda: level + 1 }))

describeDb('HexaMatrixRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: HexaMatrixRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new HexaMatrixRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('빈 표는 칸 전부가 빈다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      kinds: [],
      levelCosts: [],
      nameKinds: [],
      jobCores: [],
      stats: [],
    })
  })

  it('종류를 더한 차례로 내고 비용은 종류 차례 → 레벨 차례다. 참조는 key 로 낸다', async () => {
    await repo.createKind(skill3rd)
    await repo.createKind(skill)
    await expect(repo.createKind(skill)).rejects.toBeInstanceOf(HexaKindExists)
    await repo.replaceCosts('skill', costs(100))
    await repo.replaceCosts('skill_3rd', costs(140))
    await repo.addNameKind({ name: '  레이지 익스플로젼 ', kind: 'skill_3rd' })

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.kinds).toEqual([skill3rd, skill])
    expect(section.levelCosts).toEqual([
      ...costs(140).map((c) => ({ kind: 'skill_3rd', ...c })),
      ...costs(100).map((c) => ({ kind: 'skill', ...c })),
    ])
    expect(section.nameKinds).toEqual([{ name: '레이지 익스플로젼', kind: 'skill_3rd' }])
  })

  // API 타입마다 기본 종류가 둘이면 이름 표에 없는 코어의 종류가 하나로 안 정해진다.
  it('같은 API 타입에 기본 종류를 둘 두면 DefaultKindTaken 이다. 더할 때도 고칠 때도 그렇다', async () => {
    await repo.createKind(skill)
    await repo.createKind(skill3rd)
    await expect(repo.createKind({ ...skill, key: 'skill_new' })).rejects.toBeInstanceOf(
      DefaultKindTaken,
    )
    await expect(
      repo.updateKind('skill_3rd', { ...skill3rd, isDefault: true }),
    ).rejects.toBeInstanceOf(DefaultKindTaken)
    // 자기 자신은 겹침으로 안 본다.
    expect(await repo.updateKind('skill', { ...skill, name: '스킬 코어!' })).toBe(true)
    expect(await repo.updateKind('nobody', skill)).toBe(false)
    expect((await repo.section()).kinds[0]?.name).toBe('스킬 코어!')
  })

  // 레벨 하나라도 비면 앱이 그 구간의 조각 합을 낼 수 없다.
  it('비용은 0 부터 만렙 - 1 까지 꼭 한 번씩이어야 하고, 어기면 CostLevelsMismatch 로 아무것도 안 바꾼다', async () => {
    await repo.createKind(skill)
    await repo.replaceCosts('skill', costs(100))
    await expect(repo.replaceCosts('skill', costs(1).slice(0, 2))).rejects.toBeInstanceOf(
      CostLevelsMismatch,
    )
    await expect(
      repo.replaceCosts('skill', [...costs(1).slice(0, 2), { level: 1, fragments: 1, solErda: 1 }]),
    ).rejects.toBeInstanceOf(CostLevelsMismatch)
    await expect(
      repo.replaceCosts('skill', [...costs(1), { level: 3, fragments: 1, solErda: 1 }]),
    ).rejects.toBeInstanceOf(CostLevelsMismatch)
    await expect(repo.replaceCosts('nobody', costs(1))).rejects.toBeInstanceOf(NoHexaKind)
    expect((await repo.section()).levelCosts.map((c) => c.fragments)).toEqual([100, 101, 102])

    await repo.replaceCosts('skill', costs(200))
    expect((await repo.section()).levelCosts.map((c) => c.fragments)).toEqual([200, 201, 202])
  })

  it('만렙을 비용 줄 아래로 내리면 LevelsAboveMax 다. 올리는 것은 된다', async () => {
    await repo.createKind(skill)
    await repo.replaceCosts('skill', costs(100))
    await expect(repo.updateKind('skill', { ...skill, maxLevel: 2 })).rejects.toBeInstanceOf(
      LevelsAboveMax,
    )
    expect(await repo.updateKind('skill', { ...skill, maxLevel: 4 })).toBe(true)
    expect((await repo.section()).kinds[0]?.maxLevel).toBe(4)
  })

  it('이름 표는 이름 차례로 내고, 같은 이름은 NameKindExists · 모르는 종류는 NoHexaKind 다. 지우면 사라진다', async () => {
    await repo.createKind(skill3rd)
    await repo.addNameKind({ name: '인페르날 웨이브', kind: 'skill_3rd' })
    await repo.addNameKind({ name: '레이지 익스플로젼', kind: 'skill_3rd' })
    await expect(
      repo.addNameKind({ name: '레이지 익스플로젼 ', kind: 'skill_3rd' }),
    ).rejects.toBeInstanceOf(NameKindExists)
    await expect(repo.addNameKind({ name: '무아지경', kind: 'nobody' })).rejects.toBeInstanceOf(
      NoHexaKind,
    )

    const rows = await repo.adminRows()
    expect(rows.nameKinds.map((n) => n.name)).toEqual(['레이지 익스플로젼', '인페르날 웨이브'])
    expect(await repo.removeNameKind(rows.nameKinds[0]?.id ?? '')).toBe(true)
    expect(await repo.removeNameKind(rows.nameKinds[0]?.id ?? '')).toBe(false)
    expect((await repo.section()).nameKinds).toEqual([
      { name: '인페르날 웨이브', kind: 'skill_3rd' },
    ])
  })

  it('직업별 코어는 직업 → 직업 안 차례로 내고, 직업 안 맨 뒤에 더해 옮기고 고치고 지운다', async () => {
    const core = (job: string, name: string) => ({
      job,
      name,
      apiType: '스킬 코어',
      iconFile: `${name}.webp`,
    })
    await repo.createJobCore(core('히어로', '스피릿 칼리버'))
    await repo.createJobCore(core('렌', '창룡파천검 : 만참'))
    await repo.createJobCore(core('히어로', '레이지 익스플로젼'))
    await expect(repo.createJobCore(core('히어로', '스피릿 칼리버'))).rejects.toBeInstanceOf(
      JobCoreExists,
    )

    let rows = await repo.adminRows()
    const id = (name: string) => rows.jobCores.find((c) => c.name === name)?.id ?? ''
    expect(await repo.moveJobCore(id('레이지 익스플로젼'), 'up')).toBe(true)
    expect(await repo.moveJobCore(id('레이지 익스플로젼'), 'up')).toBe(true)
    expect(await repo.moveJobCore('0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b', 'up')).toBe(false)
    expect(
      await repo.updateJobCore(id('스피릿 칼리버'), {
        name: '스피릿 칼리버!',
        apiType: '스킬 코어',
        iconFile: 'x.webp',
      }),
    ).toBe(true)
    await expect(
      repo.updateJobCore(id('스피릿 칼리버'), {
        name: '레이지 익스플로젼',
        apiType: '스킬 코어',
        iconFile: 'x.webp',
      }),
    ).rejects.toBeInstanceOf(JobCoreExists)
    expect((await repo.section()).jobCores).toEqual([
      core('렌', '창룡파천검 : 만참'),
      core('히어로', '레이지 익스플로젼'),
      { ...core('히어로', '스피릿 칼리버'), name: '스피릿 칼리버!', iconFile: 'x.webp' },
    ])

    rows = await repo.adminRows()
    expect(await repo.removeJobCore(id('창룡파천검 : 만참'))).toBe(true)
    expect(await repo.removeJobCore(id('창룡파천검 : 만참'))).toBe(false)
    expect((await repo.section()).jobCores.map((c) => c.job)).toEqual(['히어로', '히어로'])
  })

  it('스탯은 더한 차례로 내고 활성화 비용은 비울 수 있다. 같은 key 는 HexaStatExists 다', async () => {
    await repo.createStat({ key: 'hexa_stat_2', name: '헥사 스탯 Ⅱ', activationFragments: 200 })
    await repo.createStat({ key: 'hexa_stat_4', name: '헥사 스탯 Ⅳ', activationFragments: null })
    await expect(
      repo.createStat({ key: 'hexa_stat_2', name: 'x', activationFragments: 1 }),
    ).rejects.toBeInstanceOf(HexaStatExists)
    expect(
      await repo.updateStat('hexa_stat_4', { name: '헥사 스탯 Ⅳ', activationFragments: 500 }),
    ).toBe(true)
    expect(await repo.updateStat('nobody', { name: 'x', activationFragments: null })).toBe(false)
    expect((await repo.section()).stats).toEqual([
      { key: 'hexa_stat_2', name: '헥사 스탯 Ⅱ', activationFragments: 200 },
      { key: 'hexa_stat_4', name: '헥사 스탯 Ⅳ', activationFragments: 500 },
    ])
  })
})
