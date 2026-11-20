import { gameRules } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { GameRulesRepository, NoGameRules } from './game-rules.repository'

describeDb('GameRulesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: GameRulesRepository

  const rules = {
    weeklyBossSelectionLimit: 12,
    weeklyCrystalSaleLimit: 90,
    defaultMaxPartySize: 6,
    spendTariffPercent: 10,
    rewardCoinPriceMeso: 40_000_000,
    mesoMarketFeePercent: 1,
    cubeAppraisalFreeMaxLevel: 120,
    cubeAppraisalCoefficient: 20,
    starforceDestroyDefenceSurchargePercent: 200,
  }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new GameRulesRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('줄이 없으면 규칙이 null 이고 고치기는 NoGameRules 다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, gameRules: null })
    await expect(repo.update({ spendTariffPercent: 9 })).rejects.toBeInstanceOf(NoGameRules)
  })

  // 화면마다 자기 규칙만 보낸다. 다른 화면의 규칙을 그 화면이 읽은 옛 값으로 덮으면 안 된다.
  it('받은 규칙만 고치고 나머지는 그대로이며, 칸의 updatedAt 은 그 줄의 시각이다', async () => {
    const before = new Date('2026-11-01T00:00:00Z')
    await db.insert(gameRules).values({ ...rules, updatedAt: before })
    await repo.update({ cubeAppraisalFreeMaxLevel: 121 })

    const section = await repo.section()
    expect(section.gameRules).toEqual({ ...rules, cubeAppraisalFreeMaxLevel: 121 })
    expect(section.updatedAt).not.toBe(before.toISOString())
  })
})
