import { eq } from 'drizzle-orm'

import { bossDifficulties, bosses } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import type { BossInput } from './bosses.dto'
import { BossesRepository, BossExists, LastDifficulty } from './bosses.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['bosses/lotus.webp', 'bosses/maerin.webp']

const rules = { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 }

const noPeriod = { maxPartySize: null, validFrom: null, validUntil: null }

/** 줄 id 는 넣을 때 정해져 값을 미리 알 수 없다. 모양을 견줄 때 이 글자로 갈아 끼운다. id 자체는 따로 본다. */
const SOME_ID = 'some-id'

describeDb('BossesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: BossesRepository
  let assetIds: Record<string, string>

  const lotus = (): BossInput => ({
    key: 'lotus',
    name: '스우',
    shortName: '스우',
    isSeasonBoss: false,
    portraitAssetId: assetIds['bosses/lotus.webp'] ?? '',
    difficulties: [
      { difficulty: 'extreme', cycle: 'weekly', requiredLevel: 190, ...noPeriod },
      { difficulty: 'normal', cycle: 'weekly', requiredLevel: 190, ...noPeriod },
      { difficulty: 'hard', cycle: 'weekly', requiredLevel: 190, ...noPeriod },
    ],
  })
  const meirin = (): BossInput => ({
    key: 'meirin',
    name: '시즌 보스 메이린',
    shortName: '메이린',
    isSeasonBoss: true,
    portraitAssetId: assetIds['bosses/maerin.webp'] ?? '',
    difficulties: [
      { difficulty: 'normal', cycle: 'weekly', requiredLevel: 270, ...noPeriod },
      { difficulty: 'hard', cycle: 'weekly', requiredLevel: 280, ...noPeriod },
    ],
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new BossesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
  })
  afterAll(() => close())

  it('빈 표의 catalog 는 updatedAt 과 규칙이 null 이고 목록이 빈다', async () => {
    expect(await repo.catalog()).toEqual({
      updatedAt: null,
      rules: {
        weeklyBossSelectionLimit: null,
        weeklyCrystalSaleLimit: null,
        defaultMaxPartySize: null,
      },
      bosses: [],
    })
  })

  it('규칙을 적고 보스를 더하면 catalog 가 더한 순서로 돌려준다. 난이도는 ENUM 순이고 칸 이름을 그대로 낸다', async () => {
    await repo.setRules(rules)
    await repo.createBoss(lotus())
    await repo.createBoss(meirin())

    const catalog = await repo.catalog()
    expect(catalog.updatedAt).not.toBeNull()
    expect(catalog.rules).toEqual(rules)
    expect(catalog.bosses.map((b) => b.key)).toEqual(['lotus', 'meirin'])
    expect(catalog.bosses[0]?.difficulties.map((d) => d.difficulty)).toEqual([
      'normal',
      'hard',
      'extreme',
    ])
    const { difficulties, ...boss } = meirin()
    const view = catalog.bosses[1]
    expect(
      view && {
        ...view,
        id: SOME_ID,
        difficulties: view.difficulties.map((d) => ({ ...d, id: SOME_ID })),
      },
    ).toEqual({
      ...boss,
      id: SOME_ID,
      validFrom: null,
      validUntil: null,
      difficulties: difficulties.map((d) => ({ ...d, id: SOME_ID })),
    })
    const rows = await db.select().from(bosses).orderBy(bosses.sortOrder)
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1])
  })

  // 기기의 기록이 이 id 로 보스 · 난이도를 가리킨다. 응답의 id 가 표의 줄 id 와 다르면 올린 기록을 서버가 찾지 못한다.
  it('보스와 난이도마다 표의 줄 id 를 낸다', async () => {
    const { id } = await repo.createBoss(meirin())

    const view = (await repo.catalog()).bosses[0]
    const rows = await db.select().from(bossDifficulties).where(eq(bossDifficulties.bossId, id))
    expect(view?.id).toBe(id)
    expect(view?.difficulties.map((d) => [d.difficulty, d.id])).toEqual(
      expect.arrayContaining(rows.map((r) => [r.difficulty, r.id])),
    )
    expect(view?.difficulties).toHaveLength(rows.length)
  })

  // 앱이 받는 칸은 배열 이름이 표 이름이라 난이도 줄을 보스 줄 안에 넣지 않는다. 관리 화면은 catalog 의 묶은 꼴을 읽는다.
  it('게임 데이터 칸은 보스 줄과 난이도 줄을 표 이름의 배열 둘로 내고 난이도 줄이 보스 줄 id 를 든다', async () => {
    await repo.setRules(rules)
    const { id } = await repo.createBoss(meirin())

    const section = await repo.section()
    const catalog = await repo.catalog()
    expect(section.updatedAt).toBe(catalog.updatedAt)
    expect(section.rules).toEqual(catalog.rules)
    expect(section.bosses).toEqual(
      catalog.bosses.map((b) =>
        Object.fromEntries(Object.entries(b).filter(([key]) => key !== 'difficulties')),
      ),
    )
    expect(section.bossDifficulties).toEqual(
      (catalog.bosses[0]?.difficulties ?? []).map((d) => ({ ...d, bossId: id })),
    )
  })

  it('없는 그림 id 로 더하면 AssetNotFound 이고 아무것도 안 바뀐다', async () => {
    await expect(
      repo.createBoss({ ...lotus(), portraitAssetId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect(await db.select().from(bosses)).toHaveLength(0)
  })

  it('규칙을 다시 적으면 덮는다', async () => {
    await repo.setRules(rules)
    await repo.setRules({
      weeklyBossSelectionLimit: 14,
      weeklyCrystalSaleLimit: 90,
      defaultMaxPartySize: 6,
    })

    expect((await repo.catalog()).rules.weeklyBossSelectionLimit).toBe(14)
  })

  it('같은 key 를 다시 더하면 BossExists 이고 아무것도 안 바뀐다', async () => {
    await repo.createBoss(lotus())

    await expect(repo.createBoss({ ...lotus(), name: '다른 이름' })).rejects.toBeInstanceOf(
      BossExists,
    )
    expect(await db.select().from(bosses)).toHaveLength(1)
    expect(await db.select().from(bossDifficulties)).toHaveLength(3)
  })

  it('난이도 줄을 더하거나 레벨을 갈아 끼우면 보스의 updated_at 이 움직인다. 더한 난이도는 제 주기를 든다', async () => {
    const { id } = await repo.createBoss(meirin())
    await db
      .update(bosses)
      .set({ updatedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(bosses.id, id))

    expect(
      await repo.upsertDifficulty('meirin', {
        difficulty: 'extreme',
        cycle: 'monthly',
        requiredLevel: 290,
        maxPartySize: null,
      }),
    ).toBe(true)
    expect(
      await repo.upsertDifficulty('meirin', {
        difficulty: 'hard',
        cycle: 'weekly',
        requiredLevel: 285,
        maxPartySize: null,
      }),
    ).toBe(true)
    expect(
      await repo.upsertDifficulty('nobody', {
        difficulty: 'hard',
        cycle: 'weekly',
        requiredLevel: 1,
        maxPartySize: null,
      }),
    ).toBe(false)

    const catalog = await repo.catalog()
    expect(catalog.bosses[0]?.difficulties.map((d) => ({ ...d, id: SOME_ID }))).toEqual([
      { id: SOME_ID, difficulty: 'normal', cycle: 'weekly', requiredLevel: 270, ...noPeriod },
      { id: SOME_ID, difficulty: 'hard', cycle: 'weekly', requiredLevel: 285, ...noPeriod },
      { id: SOME_ID, difficulty: 'extreme', cycle: 'monthly', requiredLevel: 290, ...noPeriod },
    ])
    expect(new Date(catalog.updatedAt ?? 0).getTime()).toBeGreaterThan(
      Date.parse('2026-01-01T00:00:00Z'),
    )
  })

  it('난이도 줄을 지운다. 없으면 false, 마지막 줄이면 LastDifficulty 다', async () => {
    await repo.createBoss(meirin())

    expect(await repo.deleteDifficulty('meirin', 'hard')).toBe(true)
    expect(await repo.deleteDifficulty('meirin', 'hard')).toBe(false)
    expect(await repo.deleteDifficulty('nobody', 'hard')).toBe(false)
    await expect(repo.deleteDifficulty('meirin', 'normal')).rejects.toBeInstanceOf(LastDifficulty)

    expect((await repo.catalog()).bosses[0]?.difficulties.map((d) => d.difficulty)).toEqual([
      'normal',
    ])
  })

  it('options 는 드롭다운용 셋만 순서대로 준다', async () => {
    await repo.createBoss(lotus())
    await repo.createBoss(meirin())

    const options = await repo.options()

    expect(options.map((o) => [o.key, o.name])).toEqual([
      ['lotus', '스우'],
      ['meirin', '시즌 보스 메이린'],
    ])
    expect(options[0]?.id).toBeDefined()
  })

  it('유효 기간을 적으면 catalog 의 줄에 실리고 보스의 updated_at 이 움직인다. 모르는 보스는 false 다', async () => {
    await repo.setRules(rules)
    await repo.createBoss(meirin())
    const before = (await repo.catalog()).updatedAt
    await new Promise((r) => setTimeout(r, 5))

    expect(
      await repo.setPeriod('meirin', { validFrom: '2026-07-03', validUntil: '2026-11-05T10:00' }),
    ).toBe(true)
    expect(await repo.setPeriod('nobody', { validFrom: null, validUntil: null })).toBe(false)

    const catalog = await repo.catalog()
    expect(catalog.bosses[0]).toMatchObject({
      key: 'meirin',
      validFrom: '2026-07-03',
      validUntil: '2026-11-05T10:00',
    })
    expect(catalog.updatedAt).not.toBe(before)
  })

  it('줄인 이름을 적으면 catalog 의 줄에 실리고 보스의 updated_at 이 움직인다. 모르는 보스는 false 다', async () => {
    await repo.setRules(rules)
    await repo.createBoss(meirin())
    const before = (await repo.catalog()).updatedAt
    await new Promise((r) => setTimeout(r, 5))

    expect(await repo.setShortName('meirin', '메린')).toBe(true)
    expect(await repo.setShortName('nobody', '누구')).toBe(false)

    const catalog = await repo.catalog()
    expect(catalog.bosses[0]).toMatchObject({
      key: 'meirin',
      name: '시즌 보스 메이린',
      shortName: '메린',
    })
    expect(catalog.updatedAt).not.toBe(before)
  })

  it('난이도 줄의 유효 기간을 적으면 catalog 의 난이도 줄에 실리고 보스의 updated_at 이 움직인다', async () => {
    await repo.setRules(rules)
    await repo.createBoss(lotus())
    const before = (await repo.catalog()).updatedAt
    await new Promise((r) => setTimeout(r, 5))

    expect(
      await repo.setDifficultyPeriod('lotus', 'extreme', {
        validFrom: '2026-11-05T10:00',
        validUntil: null,
      }),
    ).toBe(true)
    expect(
      await repo.setDifficultyPeriod('lotus', 'easy', { validFrom: null, validUntil: null }),
    ).toBe(false)

    const catalog = await repo.catalog()
    expect(catalog.bosses[0]?.difficulties.find((d) => d.difficulty === 'extreme')).toMatchObject({
      validFrom: '2026-11-05T10:00',
      validUntil: null,
    })
    expect(catalog.bosses[0]?.difficulties.find((d) => d.difficulty === 'hard')).toMatchObject({
      validFrom: null,
      validUntil: null,
    })
    expect(catalog.updatedAt).not.toBe(before)
  })
})
