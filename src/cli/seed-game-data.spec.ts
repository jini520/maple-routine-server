import { describeDb, openTestDb, type TestDb } from '../database/test-db'
import { BossesRepository } from '../modules/bosses/bosses.repository'
import { parseBossesSeed, seedGameData } from './seed-game-data'

const bossesSeed = {
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 },
  bosses: [
    {
      key: 'lotus',
      name: '스우',
      alias: '스우',
      cycle: 'weekly',
      portraitSlug: 'lotus',
      difficulties: [
        { difficulty: 'normal', requiredLevel: 190 },
        { difficulty: 'hard', requiredLevel: 190 },
      ],
    },
    {
      key: 'meirin',
      name: '시즌 보스 메이린',
      alias: '메이린',
      cycle: 'event_weekly',
      portraitSlug: 'maerin',
      difficulties: [{ difficulty: 'normal', requiredLevel: 270 }],
    },
  ],
}

describe('parseBossesSeed', () => {
  it('규칙 둘과 보스 목록을 받는다', () => {
    expect(parseBossesSeed(bossesSeed)).toEqual(bossesSeed)
  })

  // 번들 사본을 그대로 씨앗으로 쓸 수 있게 updatedAt 은 있어도 버린다. 서버가 넣는 시각이 기준이다.
  it('updatedAt 이 있어도 버린다', () => {
    expect(parseBossesSeed({ ...bossesSeed, updatedAt: '2026-10-15T01:00:00.000Z' })).toEqual(
      bossesSeed,
    )
  })

  it.each([
    ['객체가 아니다', '표'],
    ['rules 가 없다', { bosses: bossesSeed.bosses }],
    ['보스 목록이 비었다', { ...bossesSeed, bosses: [] }],
    [
      '난이도가 빈 보스',
      { ...bossesSeed, bosses: [{ ...bossesSeed.bosses[0], difficulties: [] }] },
    ],
    ['모르는 주기', { ...bossesSeed, bosses: [{ ...bossesSeed.bosses[0], cycle: 'daily' }] }],
  ])('%s → 던진다', (_name, body) => {
    expect(() => parseBossesSeed(body)).toThrow()
  })
})

describeDb('seedGameData', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('빈 표를 씨앗으로 채운다. 차례는 씨앗 파일 순이고 규칙도 함께 든다', async () => {
    const result = await seedGameData(db, { bosses: parseBossesSeed(bossesSeed) })

    expect(result).toEqual({ bosses: 'seeded' })
    const catalog = await new BossesRepository(db).catalog()
    expect(catalog.rules).toEqual(bossesSeed.rules)
    expect(catalog.bosses.map((b) => b.key)).toEqual(['lotus', 'meirin'])
    expect(catalog.bosses[0]?.difficulties).toEqual(bossesSeed.bosses[0]?.difficulties)
  })

  // 운영자가 폼으로 고친 값을 배포 때 씨앗이 되돌리면 안 된다. 줄이 하나라도 있으면 그 표는 건너뛴다.
  it('줄이 있는 표는 건드리지 않는다', async () => {
    const repo = new BossesRepository(db)
    await repo.setRules({ weeklyBossSelectionLimit: 10, weeklyCrystalSaleLimit: 80 })
    await repo.createBoss({
      ...bossesSeed.bosses[1],
      cycle: 'event_weekly',
      difficulties: [{ difficulty: 'hard', requiredLevel: 280 }],
    })

    const result = await seedGameData(db, { bosses: parseBossesSeed(bossesSeed) })

    expect(result).toEqual({ bosses: 'skipped' })
    const catalog = await repo.catalog()
    expect(catalog.rules).toEqual({ weeklyBossSelectionLimit: 10, weeklyCrystalSaleLimit: 80 })
    expect(catalog.bosses.map((b) => b.key)).toEqual(['meirin'])
  })
})
