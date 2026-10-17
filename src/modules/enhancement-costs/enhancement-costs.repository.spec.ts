import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { BandExists, BaseBand, EnhancementCostsRepository } from './enhancement-costs.repository'

describeDb('EnhancementCostsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: EnhancementCostsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new EnhancementCostsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  const base = { rare: 4_000_000, epic: 16_000_000, unique: 34_000_000, legendary: 40_000_000 }
  const rules = {
    cubeAppraisalFreeMaxLevel: 120,
    cubeAppraisalCoefficient: 20,
    starforceDestroyDefenceSurchargePercent: 200,
  }

  it('비어 있으면 규칙이 null 이고 배열이 빈다. 규칙 셋은 한 번에 적는다', async () => {
    expect(await repo.section()).toEqual({
      updatedAt: null,
      rules: {
        cubeAppraisalFreeMaxLevel: null,
        cubeAppraisalCoefficient: null,
        starforceDestroyDefenceSurchargePercent: null,
      },
      potentialResetCosts: [],
      soulPotentialResetCosts: [],
      starforceSteps: [],
    })
    await repo.setRules(rules)
    const section = await repo.section()
    expect(section.rules).toEqual(rules)
    expect(section.updatedAt).not.toBeNull()
  })

  it('구간은 등급 넷과 함께 더하고 지운다. 같은 구간은 BandExists, 1 구간은 BaseBand 다. 칸 하나를 고친다', async () => {
    await repo.addPotentialResetBand('potential', 1, base)
    await repo.addPotentialResetBand('potential', 250, { ...base, rare: 5_000_000 })
    await repo.addPotentialResetBand('additional', 1, { ...base, rare: 9_750_000 })
    await expect(repo.addPotentialResetBand('potential', 250, base)).rejects.toBeInstanceOf(
      BandExists,
    )
    expect(await repo.setPotentialResetCost('potential', 250, 'epic', 20_000_000)).toBe(true)
    expect(await repo.setPotentialResetCost('potential', 200, 'epic', 1)).toBe(false)
    await expect(repo.removePotentialResetBand('potential', 1)).rejects.toBeInstanceOf(BaseBand)
    expect(await repo.removePotentialResetBand('potential', 200)).toBe(false)

    const rows = (await repo.section()).potentialResetCosts
    // 종류 · 구간 · 등급 차례다. ENUM 의 선언 차례가 곧 정렬이다.
    expect(rows.map((r) => `${r.type}/${r.minLevel}/${r.grade}`)).toEqual([
      'potential/1/rare',
      'potential/1/epic',
      'potential/1/unique',
      'potential/1/legendary',
      'potential/250/rare',
      'potential/250/epic',
      'potential/250/unique',
      'potential/250/legendary',
      'additional/1/rare',
      'additional/1/epic',
      'additional/1/unique',
      'additional/1/legendary',
    ])
    expect(
      rows.find((r) => r.type === 'potential' && r.minLevel === 250 && r.grade === 'epic')
        ?.costMeso,
    ).toBe(20_000_000)
    expect(await repo.removePotentialResetBand('potential', 250)).toBe(true)
    expect((await repo.section()).potentialResetCosts).toHaveLength(8)
  })

  it('소울은 등급마다 없으면 만들고 있으면 고친다', async () => {
    await repo.setSoulPotentialResetCost('rare', 20_000_000)
    await repo.setSoulPotentialResetCost('legendary', 88_000_000)
    await repo.setSoulPotentialResetCost('rare', 21_000_000)
    expect((await repo.section()).soulPotentialResetCosts).toEqual([
      { grade: 'rare', costMeso: 21_000_000 },
      { grade: 'legendary', costMeso: 88_000_000 },
    ])
  })

  it('스타포스 단계는 끝 성수만 더하고 지운다. 비어 있으면 0 부터다. 없는 성수는 false 다', async () => {
    expect(await repo.removeLastStarforceStep()).toBe(false)
    expect(await repo.addStarforceStep({ exponent: 1, divisor: 36 })).toEqual({ fromStar: 0 })
    expect(await repo.addStarforceStep({ exponent: 1, divisor: 36 })).toEqual({ fromStar: 1 })
    expect(await repo.addStarforceStep({ exponent: 2.7, divisor: 571 })).toEqual({ fromStar: 2 })
    expect(await repo.setStarforceStep(1, { exponent: 1, divisor: 40 })).toBe(true)
    expect(await repo.setStarforceStep(9, { exponent: 1, divisor: 40 })).toBe(false)
    expect(await repo.removeLastStarforceStep()).toBe(true)
    expect((await repo.section()).starforceSteps).toEqual([
      { fromStar: 0, exponent: 1, divisor: 36 },
      { fromStar: 1, exponent: 1, divisor: 40 },
    ])
  })
})
