import { eq } from 'drizzle-orm'

import { bossDifficulties, bosses, manualCompletionBosses } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import type { BossesImport } from './bosses.dto'
import { BossesRepository } from './bosses.repository'

const lotus: BossesImport['bosses'][number] = {
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
const meirin: BossesImport['bosses'][number] = {
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
const input = (list = [lotus, meirin]): BossesImport => ({
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 },
  bosses: list,
})

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

  it('import 는 보스 · 난이도 · 규칙을 넣고 catalog 가 순서대로 돌려준다', async () => {
    const result = await repo.import(input())

    expect(result).toEqual({ bosses: 2, difficulties: 5, leftover: [] })
    const catalog = await repo.catalog()
    expect(catalog.updatedAt).not.toBeNull()
    expect(catalog.rules).toEqual({ weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 })
    expect(catalog.bosses.map((b) => b.key)).toEqual(['lotus', 'meirin'])
    // 난이도는 넣은 순서가 아니라 ENUM 순서다
    expect(catalog.bosses[0]?.difficulties.map((d) => d.difficulty)).toEqual([
      'normal',
      'hard',
      'extreme',
    ])
    expect(catalog.bosses[1]).toEqual({ ...meirin })
  })

  it('다시 넣으면 값을 덮고 빠진 난이도는 지우며 순서를 따라간다', async () => {
    await repo.import(input())

    const result = await repo.import(
      input([
        { ...meirin, name: '메이린' },
        { ...lotus, difficulties: [{ difficulty: 'hard', requiredLevel: 200 }] },
      ]),
    )

    expect(result).toEqual({ bosses: 2, difficulties: 3, leftover: [] })
    const catalog = await repo.catalog()
    expect(catalog.bosses.map((b) => b.key)).toEqual(['meirin', 'lotus'])
    expect(catalog.bosses[0]?.name).toBe('메이린')
    expect(catalog.bosses[1]?.difficulties).toEqual([{ difficulty: 'hard', requiredLevel: 200 }])
    expect(await db.select().from(bosses)).toHaveLength(2)
    expect(await db.select().from(bossDifficulties)).toHaveLength(3)
  })

  it('JSON 에 없는 보스는 지우지 않고 leftover 로 알린다', async () => {
    await repo.import(input())
    const [row] = await db.select({ id: bosses.id }).from(bosses).where(eq(bosses.key, 'meirin'))
    await db.insert(manualCompletionBosses).values({ bossId: row.id, fromDate: '2026-10-01' })

    const result = await repo.import(input([lotus]))

    expect(result.leftover).toEqual(['meirin'])
    expect(await repo.findByKey('meirin')).not.toBeNull()
  })

  it('도중에 실패하면 아무것도 안 바뀐다', async () => {
    await repo.import(input())
    const before = await repo.catalog()

    // DTO 가 막는 값이지만 리포지토리만 놓고 보면 DB 의 ENUM 이 거절해 트랜잭션이 되돌아간다
    const broken = { ...lotus, difficulties: [{ difficulty: 'hell' as 'easy', requiredLevel: 1 }] }
    await expect(repo.import(input([{ ...meirin, name: '바뀐 이름' }, broken]))).rejects.toThrow()

    expect(await repo.catalog()).toEqual(before)
  })

  it('options 는 드롭다운용 셋만 순서대로 준다', async () => {
    await repo.import(input())

    const options = await repo.options()

    expect(options.map((o) => [o.key, o.name])).toEqual([
      ['lotus', '스우'],
      ['meirin', '시즌 보스 메이린'],
    ])
    expect(options[0]?.id).toBeDefined()
  })
})
