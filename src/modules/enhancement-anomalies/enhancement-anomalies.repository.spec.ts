import { enhancementAnomalies, nexonAccounts, users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import type { EnhancementAnomalyBody } from './enhancement-anomalies.dto'
import { EnhancementAnomaliesRepository } from './enhancement-anomalies.repository'

describeDb('EnhancementAnomaliesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: EnhancementAnomaliesRepository
  let me: string
  let accountA: string
  let accountB: string
  const as = (nexonAccountId: string) => ({ userId: me, source: 'key' as const, nexonAccountId })

  const item = (over: Partial<EnhancementAnomalyBody> = {}): EnhancementAnomalyBody => ({
    historyDate: '2026-10-20',
    enhancementType: 'starforce',
    anomalyType: 'no_level',
    itemKey: null,
    itemName: '왕푸',
    rowCount: 2,
    detail: null,
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new EnhancementAnomaliesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    ;[{ id: me }] = await db.insert(users).values({}).returning({ id: users.id })
    ;[{ id: accountA }, { id: accountB }] = await db
      .insert(nexonAccounts)
      .values([{ userId: me }, { userId: me }])
      .returning({ id: nexonAccounts.id })
  })
  afterAll(() => close())

  // 앱은 오늘처럼 굳지 않은 날을 받을 때마다 그 날 전체를 다시 센다. 쌓으면 같은 줄을 여러 번 센다.
  it('같은 날 · 종류 · 이유 · 장비는 한 줄을 받은 수로 덮는다', async () => {
    await repo.upsert(as(accountA), [item()])
    await repo.upsert(as(accountA), [item({ rowCount: 5 })])

    const rows = await db.select().from(enhancementAnomalies)
    expect(rows.map((row) => row.rowCount)).toEqual([5])
  })

  it('한 번에 같은 열쇠가 둘 와도 거절하지 않고 나중 것을 남긴다', async () => {
    await repo.upsert(as(accountA), [item({ rowCount: 1 }), item({ rowCount: 3 })])

    expect((await db.select().from(enhancementAnomalies)).map((row) => row.rowCount)).toEqual([3])
  })

  it('판정하지 못한 줄은 빈 장비 이름으로 날짜 · 종류마다 한 줄이다', async () => {
    const unknown = item({ anomalyType: 'event_world_unknown', itemName: '', detail: 'Error: 503' })
    await repo.upsert(as(accountA), [unknown, { ...unknown, enhancementType: 'cube' }])

    expect(await db.select().from(enhancementAnomalies)).toHaveLength(2)
  })

  // 강화 내역은 넥슨 계정마다 받는다. 사람으로 가리면 한 사람 밑의 두 계정이 같은 열쇠로 서로 덮는다.
  it('한 사람 밑의 두 넥슨 계정은 같은 날 · 종류 · 이유 · 장비라도 따로 한 줄씩이다', async () => {
    await repo.upsert(as(accountA), [item({ rowCount: 1 })])
    await repo.upsert(as(accountB), [item({ rowCount: 4 })])

    const rows = await db.select().from(enhancementAnomalies)
    expect(rows.map((row) => [row.nexonAccountId, row.userId, row.rowCount]).sort()).toEqual(
      [
        [accountA, me, 1],
        [accountB, me, 4],
      ].sort(),
    )
  })
})
