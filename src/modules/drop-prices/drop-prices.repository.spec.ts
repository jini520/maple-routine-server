import { eq } from 'drizzle-orm'

import { dropPrices, users } from '../../database/schema'
import { BossesRepository } from '../bosses/bosses.repository'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { type DropPriceInput, DropPricesRepository } from './drop-prices.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('DropPricesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: DropPricesRepository
  let me: string
  let other: string

  const input = (over: Partial<DropPriceInput> = {}): DropPriceInput => ({
    userId: me,
    identifiedBy: 'key',
    dropRecordId: RECORD,
    itemKey: 'ring',
    priceMeso: 100,
    periodKey: '2026-10-08',
    worldKey: 'scania',
    ringLevel: 4,
    bossDifficultyId: null,
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new DropPricesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    const rows = await db
      .insert(users)
      .values([{ nexonUid: 'me' }, { nexonUid: 'other' }])
      .returning({ id: users.id })
    me = rows[0].id
    other = rows[1].id
  })
  afterAll(() => close())

  it('처음은 줄을 만들고 같은 기록을 다시 적으면 값만 덮는다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ priceMeso: 250, identifiedBy: 'login' }))

    const rows = await db.select().from(dropPrices)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.priceMeso).toBe(250)
    expect(rows[0]?.identifiedBy).toBe('login')
    expect(rows[0]?.updatedAt.getTime()).toBeGreaterThanOrEqual(rows[0]?.createdAt.getTime() ?? 0)
  })

  it('남의 기록 id 로 적어도 남의 줄은 안 건드리고 내 줄이 따로 생긴다', async () => {
    await repo.upsert(input({ userId: other, priceMeso: 999 }))

    await repo.upsert(input({ priceMeso: 1 }))

    const rows = await db.select().from(dropPrices).orderBy(dropPrices.priceMeso)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.userId, r.priceMeso])).toEqual([
      [me, 1],
      [other, 999],
    ])
  })

  it('보스 난이도 줄을 가리킬 수 있고 recent 가 보스 key 와 난이도를 함께 낸다', async () => {
    const bosses = new BossesRepository(db)
    await bosses.createBoss({
      key: 'lucid',
      name: '루시드',
      alias: '루시드',
      cycle: 'weekly',
      portraitSlug: 'lucid',
      difficulties: [{ difficulty: 'hard', requiredLevel: 220 }],
    })
    const found = await bosses.findDifficulty('lucid', 'hard')
    expect(found).not.toBeNull()
    expect(await bosses.findDifficulty('lucid', 'chaos')).toBeNull()
    expect(await bosses.findDifficulty('nobody', 'hard')).toBeNull()
    expect(await bosses.findDifficulty('lucid', 'ultra')).toBeNull()

    await repo.upsert(input({ bossDifficultyId: found?.id ?? null }))
    await repo.upsert(input({ dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a52', priceMeso: 5 }))

    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.priceMeso, r.boss, r.difficulty])).toEqual([
      [5, null, null],
      [100, 'lucid', 'hard'],
    ])
  })

  it('markDeleted 는 내 줄만 deleted_at 을 채우고 다시 적으면 비워진다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ userId: other }))

    await repo.markDeleted(me, RECORD)

    const mine = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    const theirs = await db.select().from(dropPrices).where(eq(dropPrices.userId, other))
    expect(mine[0]?.deletedAt).not.toBeNull()
    expect(theirs[0]?.deletedAt).toBeNull()

    await repo.upsert(input())
    const revived = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    expect(revived[0]?.deletedAt).toBeNull()
  })

  it('markDeleted 는 없는 줄이면 조용하고 처음 뺀 시각을 안 덮는다', async () => {
    await expect(repo.markDeleted(me, RECORD)).resolves.toBeUndefined()

    await repo.upsert(input())
    await db
      .update(dropPrices)
      .set({ deletedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(dropPrices.userId, me))
    await repo.markDeleted(me, RECORD)

    const [row] = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    expect(row?.deletedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('recent 는 필터대로 최근 것부터 내고 뺀 가격도 deleted_at 과 함께 보인다', async () => {
    await repo.upsert(
      input({ dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a51', priceMeso: 10 }),
    )
    await repo.upsert(
      input({
        dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a52',
        priceMeso: 20,
        itemKey: 'cape',
      }),
    )
    await repo.upsert(
      input({
        dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a53',
        priceMeso: 30,
        periodKey: '2026-10',
      }),
    )
    await repo.markDeleted(me, '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a51')

    const all = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(all).toHaveLength(3)
    expect(all.map((r) => r.priceMeso)).toEqual([10, 30, 20])
    expect(all[0]?.deletedAt).not.toBeNull()
    expect(all[0]).toMatchObject({
      identifiedBy: 'key',
      userId: me,
      itemKey: 'ring',
      worldKey: 'scania',
    })

    expect(
      (await repo.recent({ itemKey: 'ring', periodKey: null }, 10)).map((r) => r.priceMeso),
    ).toEqual([10, 30])
    expect(
      (await repo.recent({ itemKey: 'ring', periodKey: '2026-10' }, 10)).map((r) => r.priceMeso),
    ).toEqual([30])
    expect(await repo.recent({ itemKey: null, periodKey: null }, 1)).toHaveLength(1)
  })

  it('summary 는 아이템 × 기간의 개수 · 최소 · 중앙값 · 최대이고 뺀 가격은 안 센다', async () => {
    const ids = ['51', '52', '53', '54', '55'].map((t) => `0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a${t}`)
    await repo.upsert(input({ dropRecordId: ids[0], priceMeso: 100 }))
    await repo.upsert(input({ dropRecordId: ids[1], priceMeso: 300 }))
    await repo.upsert(input({ dropRecordId: ids[2], priceMeso: 1_000_000 }))
    await repo.upsert(input({ dropRecordId: ids[3], priceMeso: 7, userId: other }))
    await repo.upsert(
      input({ dropRecordId: ids[4], priceMeso: 50, itemKey: 'cape', periodKey: '2026-10' }),
    )
    await repo.markDeleted(me, ids[2])

    const summary = await repo.summary({ itemKey: null, periodKey: null })

    // 기간 key 는 문자열 역순이라 '2026-10-08' 이 '2026-10' 앞이다
    expect(summary).toEqual([
      { itemKey: 'ring', periodKey: '2026-10-08', count: 3, min: 7, median: 100, max: 300 },
      { itemKey: 'cape', periodKey: '2026-10', count: 1, min: 50, median: 50, max: 50 },
    ])
    expect(await repo.summary({ itemKey: 'ring', periodKey: null })).toHaveLength(1)
    expect(await repo.summary({ itemKey: 'none', periodKey: null })).toEqual([])
  })
})
