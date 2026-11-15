import { gameDataSections } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  BandExists,
  BaseBand,
  EnhancementCostsRepository,
  NoSuperiorSeries,
  SuperiorItemNameTaken,
  SuperiorSeriesExists,
} from './enhancement-costs.repository'

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
      superiorSeries: [],
      superiorItems: [],
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

  it('슈페리얼 계열과 장비를 칸에 싣는다. 같은 계열 key 는 SuperiorSeriesExists, 공백만 다른 장비 이름은 SuperiorItemNameTaken, 없는 계열은 NoSuperiorSeries 다', async () => {
    await repo.addSuperiorSeries({ key: 'tyrant', name: '타일런트', starforceCostMeso: 55_382_200 })
    await repo.addSuperiorSeries({ key: 'nova', name: '노바', starforceCostMeso: 18_507_900 })
    await expect(
      repo.addSuperiorSeries({ key: 'tyrant', name: '타일런트', starforceCostMeso: 1 }),
    ).rejects.toBeInstanceOf(SuperiorSeriesExists)

    await repo.addSuperiorItem('타일런트 리카온 벨트', 'tyrant')
    await repo.addSuperiorItem('노바 히아데스 클록', 'nova')
    // 앱은 넥슨 이름과 공백을 지운 뒤 맞춘다. 공백만 다른 이름이 둘이면 한 장비가 두 줄이 된다.
    await expect(repo.addSuperiorItem('타일런트리카온 벨트', 'tyrant')).rejects.toBeInstanceOf(
      SuperiorItemNameTaken,
    )
    await expect(
      repo.addSuperiorItem('헬리시움 정예 도적 벨트', 'helisium_elite'),
    ).rejects.toBeInstanceOf(NoSuperiorSeries)

    expect(
      await repo.setSuperiorSeries('tyrant', { name: '타일런트', starforceCostMeso: 55_000_000 }),
    ).toBe(true)
    expect(
      await repo.setSuperiorSeries('helisium_elite', {
        name: '헬리시움 정예',
        starforceCostMeso: 1,
      }),
    ).toBe(false)

    const section = await repo.section()
    expect(section.superiorSeries).toEqual([
      { key: 'nova', name: '노바', starforceCostMeso: 18_507_900 },
      { key: 'tyrant', name: '타일런트', starforceCostMeso: 55_000_000 },
    ])
    expect(section.superiorItems).toEqual([
      { name: '노바 히아데스 클록', seriesKey: 'nova', iconAssetId: null },
      { name: '타일런트 리카온 벨트', seriesKey: 'tyrant', iconAssetId: null },
    ])

    expect(await repo.removeSuperiorItem('타일런트 리카온 벨트')).toBe(true)
    expect(await repo.removeSuperiorItem('타일런트 리카온 벨트')).toBe(false)
    expect((await repo.section()).superiorItems).toEqual([
      { name: '노바 히아데스 클록', seriesKey: 'nova', iconAssetId: null },
    ])
  })

  it('슈페리얼 장비의 그림을 바꾼다. 없는 장비는 false, 그림 표에 없는 그림은 AssetNotFound 다', async () => {
    const icon = (await insertAssets(db, ['items/tyrant_lycaon_belt.png']))[
      'items/tyrant_lycaon_belt.png'
    ]
    await repo.addSuperiorSeries({ key: 'tyrant', name: '타일런트', starforceCostMeso: 55_382_200 })
    await repo.addSuperiorItem('타일런트 리카온 벨트', 'tyrant')

    expect(await repo.setSuperiorItemIcon('타일런트 리카온 벨트', icon)).toBe(true)
    expect(await repo.setSuperiorItemIcon('타일런트 알테어 벨트', icon)).toBe(false)
    await expect(
      repo.setSuperiorItemIcon('타일런트 리카온 벨트', '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect((await repo.section()).superiorItems).toEqual([
      { name: '타일런트 리카온 벨트', seriesKey: 'tyrant', iconAssetId: icon },
    ])
  })

  it('계열을 더하거나 고치고 장비를 더하거나 지우거나 그림을 바꾸면 칸의 updatedAt 이 선다', async () => {
    const touched = async (write: () => Promise<unknown>) => {
      await db.delete(gameDataSections)
      await write()
      return (await repo.section()).updatedAt
    }
    expect(
      await touched(() =>
        repo.addSuperiorSeries({ key: 'tyrant', name: '타일런트', starforceCostMeso: 55_382_200 }),
      ),
    ).not.toBeNull()
    expect(
      await touched(() =>
        repo.setSuperiorSeries('tyrant', { name: '타일런트', starforceCostMeso: 55_000_000 }),
      ),
    ).not.toBeNull()
    expect(
      await touched(() => repo.addSuperiorItem('타일런트 리카온 벨트', 'tyrant')),
    ).not.toBeNull()
    const icon = (await insertAssets(db, ['items/tyrant_lycaon_belt.png']))[
      'items/tyrant_lycaon_belt.png'
    ]
    expect(
      await touched(() => repo.setSuperiorItemIcon('타일런트 리카온 벨트', icon)),
    ).not.toBeNull()
    expect(await touched(() => repo.removeSuperiorItem('타일런트 리카온 벨트'))).not.toBeNull()
  })
})
