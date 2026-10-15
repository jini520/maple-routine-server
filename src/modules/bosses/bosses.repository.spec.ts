import { eq } from 'drizzle-orm'

import { bossDifficulties, bosses } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import type { BossInput } from './bosses.dto'
import { BossesRepository, BossExists, LastDifficulty } from './bosses.repository'

const lotus: BossInput = {
  key: 'lotus',
  name: '스우',
  alias: '스우',
  cycle: 'weekly',
  portraitSlug: 'lotus',
  difficulties: [
    { difficulty: 'extreme', requiredLevel: 190 },
    { difficulty: 'normal', requiredLevel: 190 },
    { difficulty: 'hard', requiredLevel: 190 },
  ],
}
const meirin: BossInput = {
  key: 'meirin',
  name: '시즌 보스 메이린',
  alias: '메이린',
  cycle: 'event_weekly',
  portraitSlug: 'maerin',
  difficulties: [
    { difficulty: 'normal', requiredLevel: 270 },
    { difficulty: 'hard', requiredLevel: 280 },
  ],
}
const rules = { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 }

describeDb('BossesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: BossesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new BossesRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('빈 표의 catalog 는 updatedAt 과 규칙이 null 이고 목록이 빈다', async () => {
    expect(await repo.catalog()).toEqual({
      updatedAt: null,
      rules: { weeklyBossSelectionLimit: null, weeklyCrystalSaleLimit: null },
      bosses: [],
    })
  })

  it('규칙을 적고 보스를 더하면 catalog 가 더한 순서로 돌려준다. 난이도는 ENUM 순이다', async () => {
    await repo.setRules(rules)
    await repo.createBoss(lotus)
    await repo.createBoss(meirin)

    const catalog = await repo.catalog()
    expect(catalog.updatedAt).not.toBeNull()
    expect(catalog.rules).toEqual(rules)
    expect(catalog.bosses.map((b) => b.key)).toEqual(['lotus', 'meirin'])
    expect(catalog.bosses[0]?.difficulties.map((d) => d.difficulty)).toEqual([
      'normal',
      'hard',
      'extreme',
    ])
    expect(catalog.bosses[1]).toEqual({ ...meirin })
    const rows = await db.select().from(bosses).orderBy(bosses.sortOrder)
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1])
  })

  it('규칙을 다시 적으면 덮는다', async () => {
    await repo.setRules(rules)
    await repo.setRules({ weeklyBossSelectionLimit: 14, weeklyCrystalSaleLimit: 90 })

    expect((await repo.catalog()).rules.weeklyBossSelectionLimit).toBe(14)
  })

  it('같은 key 를 다시 더하면 BossExists 이고 아무것도 안 바뀐다', async () => {
    await repo.createBoss(lotus)

    await expect(repo.createBoss({ ...lotus, name: '다른 이름' })).rejects.toBeInstanceOf(
      BossExists,
    )
    expect(await db.select().from(bosses)).toHaveLength(1)
    expect(await db.select().from(bossDifficulties)).toHaveLength(3)
  })

  it('난이도 줄을 더하거나 레벨을 갈아 끼우면 보스의 updated_at 이 움직인다', async () => {
    const { id } = await repo.createBoss(meirin)
    await db
      .update(bosses)
      .set({ updatedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(bosses.id, id))

    expect(
      await repo.upsertDifficulty('meirin', { difficulty: 'extreme', requiredLevel: 290 }),
    ).toBe(true)
    expect(await repo.upsertDifficulty('meirin', { difficulty: 'hard', requiredLevel: 285 })).toBe(
      true,
    )
    expect(await repo.upsertDifficulty('nobody', { difficulty: 'hard', requiredLevel: 1 })).toBe(
      false,
    )

    const catalog = await repo.catalog()
    expect(catalog.bosses[0]?.difficulties).toEqual([
      { difficulty: 'normal', requiredLevel: 270 },
      { difficulty: 'hard', requiredLevel: 285 },
      { difficulty: 'extreme', requiredLevel: 290 },
    ])
    expect(new Date(catalog.updatedAt ?? 0).getTime()).toBeGreaterThan(
      Date.parse('2026-01-01T00:00:00Z'),
    )
  })

  it('난이도 줄을 지운다. 없으면 false, 마지막 줄이면 LastDifficulty 다', async () => {
    await repo.createBoss(meirin)

    expect(await repo.deleteDifficulty('meirin', 'hard')).toBe(true)
    expect(await repo.deleteDifficulty('meirin', 'hard')).toBe(false)
    expect(await repo.deleteDifficulty('nobody', 'hard')).toBe(false)
    await expect(repo.deleteDifficulty('meirin', 'normal')).rejects.toBeInstanceOf(LastDifficulty)

    expect((await repo.catalog()).bosses[0]?.difficulties).toEqual([
      { difficulty: 'normal', requiredLevel: 270 },
    ])
  })

  it('options 는 드롭다운용 셋만 순서대로 준다', async () => {
    await repo.createBoss(lotus)
    await repo.createBoss(meirin)

    const options = await repo.options()

    expect(options.map((o) => [o.key, o.name])).toEqual([
      ['lotus', '스우'],
      ['meirin', '시즌 보스 메이린'],
    ])
    expect(options[0]?.id).toBeDefined()
  })
})
