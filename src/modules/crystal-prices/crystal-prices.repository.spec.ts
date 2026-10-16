import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { BossesRepository } from '../bosses/bosses.repository'
import {
  CrystalPricesRepository,
  NotAfterCurrent,
  NotBoundary,
  NotLatest,
} from './crystal-prices.repository'

describeDb('CrystalPricesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: CrystalPricesRepository
  let bosses: BossesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new CrystalPricesRepository(db)
    bosses = new BossesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    await bosses.setRules({
      weeklyBossSelectionLimit: 12,
      weeklyCrystalSaleLimit: 90,
      defaultMaxPartySize: 6,
    })
    await bosses.createBoss({
      key: 'lotus',
      name: '스우',
      alias: '스우',
      cycle: 'weekly',
      portraitSlug: 'lotus',
      difficulties: [{ difficulty: 'hard', requiredLevel: 190, maxPartySize: null }],
    })
    await bosses.createBoss({
      key: 'black_mage',
      name: '검은 마법사',
      alias: '검은 마법사',
      cycle: 'monthly',
      portraitSlug: 'black_mage',
      difficulties: [{ difficulty: 'hard', requiredLevel: 255, maxPartySize: null }],
    })
  })
  afterAll(() => close())

  it('빈 표는 updatedAt 이 null 이고 조합은 보스 표 그대로 선다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, prices: [] })
    const pairs = await repo.pairs()
    expect(pairs.map((p) => `${p.boss}/${p.difficulty}`)).toEqual(['lotus/hard', 'black_mage/hard'])
    expect(pairs[0]?.prices).toEqual([])
  })

  it('첫 줄은 시작 없이 열리고, 새 가격은 지금 줄을 닫고 새 줄을 연다', async () => {
    await repo.addPrice('lotus', 'hard', { priceMeso: 100, from: null })
    await repo.addPrice('lotus', 'hard', { priceMeso: 200, from: '2026-10-22' })

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.prices).toEqual([
      { boss: 'lotus', difficulty: 'hard', priceMeso: 100, from: null, until: '2026-10-22' },
      { boss: 'lotus', difficulty: 'hard', priceMeso: 200, from: '2026-10-22', until: null },
    ])
  })

  it('지금 줄이 있는데 시작이 없거나, 시작이 지금 줄보다 앞이거나, 경계가 아니면 던진다', async () => {
    await repo.addPrice('lotus', 'hard', { priceMeso: 100, from: '2026-10-22' })

    await expect(
      repo.addPrice('lotus', 'hard', { priceMeso: 1, from: null }),
    ).rejects.toBeInstanceOf(NotAfterCurrent)
    await expect(
      repo.addPrice('lotus', 'hard', { priceMeso: 1, from: '2026-10-15' }),
    ).rejects.toBeInstanceOf(NotAfterCurrent)
    await expect(
      repo.addPrice('lotus', 'hard', { priceMeso: 1, from: '2026-10-23' }),
    ).rejects.toBeInstanceOf(NotBoundary)
    await expect(
      repo.addPrice('black_mage', 'hard', { priceMeso: 1, from: '2026-10-22' }),
    ).rejects.toBeInstanceOf(NotBoundary)
    const monthly = await repo.addPrice('black_mage', 'hard', { priceMeso: 1, from: '2026-11-01' })
    expect(typeof monthly.id).toBe('string')
  })

  it('지금 줄을 거두면 바로 앞 줄이 다시 열리고, 지난 줄은 못 거둔다', async () => {
    const first = await repo.addPrice('lotus', 'hard', { priceMeso: 100, from: null })
    const second = await repo.addPrice('lotus', 'hard', { priceMeso: 200, from: '2026-10-22' })

    await expect(repo.removeLatest(first.id)).rejects.toBeInstanceOf(NotLatest)
    expect(await repo.removeLatest(second.id)).toBe(true)
    expect((await repo.section()).prices).toEqual([
      { boss: 'lotus', difficulty: 'hard', priceMeso: 100, from: null, until: null },
    ])
    expect(await repo.removeLatest(second.id)).toBe(false)
  })

  it('파티 인원 상한은 난이도 칸이고 보스 표의 updatedAt 을 민다', async () => {
    const before = (await bosses.catalog()).updatedAt
    await new Promise((r) => setTimeout(r, 5))
    expect(await bosses.setMaxPartySize('lotus', 'hard', 2)).toBe(true)
    expect(await bosses.setMaxPartySize('lotus', 'easy', 2)).toBe(false)

    const catalog = await bosses.catalog()
    expect(catalog.bosses[0]?.difficulties[0]?.maxPartySize).toBe(2)
    expect(catalog.rules.defaultMaxPartySize).toBe(6)
    expect(catalog.updatedAt).not.toBe(before)
    expect((await repo.pairs())[0]?.maxPartySize).toBe(2)
  })
})
