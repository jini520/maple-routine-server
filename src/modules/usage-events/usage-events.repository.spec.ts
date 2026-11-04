import { usageEvents, users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { UsageEventsRepository } from './usage-events.repository'

describeDb('UsageEventsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: UsageEventsRepository
  let me: string
  let other: string

  const batchOf = (userId: string, platform: 'ios' | 'android' = 'ios') => ({
    userId,
    identifiedBy: 'key' as const,
    platform,
    appVersion: '1.0.13',
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new UsageEventsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    ;[{ id: me }, { id: other }] = await db
      .insert(users)
      .values([{}, {}])
      .returning({ id: users.id })
  })
  afterAll(() => close())

  it('기기 시각이 받은 시각보다 미래면 받은 시각으로 자른다', async () => {
    const future = new Date(Date.now() + 3_600_000)
    await repo.insert(batchOf(me), [{ type: 'visit', name: '', durationMs: null, at: future }])

    const [row] = await db.select().from(usageEvents)
    expect(row.occurredAt.getTime()).toBeLessThanOrEqual(row.receivedAt.getTime())
  })

  it('기준보다 오래된 줄만 지운다', async () => {
    const old = new Date('2026-01-01T00:00:00Z')
    const recent = new Date('2026-11-01T00:00:00Z')
    await repo.insert(batchOf(me), [
      { type: 'visit', name: '', durationMs: null, at: old },
      { type: 'visit', name: '', durationMs: null, at: recent },
    ])

    expect(await repo.deleteBefore(new Date('2026-06-01T00:00:00Z'))).toBe(1)
    expect((await db.select().from(usageEvents)).map((row) => row.occurredAt)).toEqual([recent])
  })

  // UTC 로 자르면 한국 시각 오전 9시 전의 방문이 전날로 간다.
  it('날짜는 한국 시각으로 자르고 방문자는 서로 다른 사람으로 센다', async () => {
    const visit = (at: string) => ({
      type: 'visit' as const,
      name: '',
      durationMs: null,
      at: new Date(at),
    })
    await repo.insert(batchOf(me), [visit('2026-11-02T15:30:00Z'), visit('2026-11-03T03:00:00Z')])
    await repo.insert(batchOf(other, 'android'), [
      visit('2026-11-03T05:00:00Z'),
      { type: 'action', name: 'drop-save', durationMs: null, at: new Date('2026-11-03T05:01:00Z') },
    ])

    const days = await repo.daily(new Date('2026-11-01T00:00:00Z'))

    expect(days).toEqual([
      {
        day: '2026-11-03',
        visitors: 2,
        visits: 3,
        ios: 1,
        android: 1,
        actions: { 'drop-save': 1 },
      },
    ])
  })

  it('화면마다 방문자 · 본 횟수 · 체류 중앙값을 낸다', async () => {
    const at = new Date('2026-11-03T05:00:00Z')
    const screen = (name: string, durationMs: number) => ({
      type: 'screen' as const,
      name,
      durationMs,
      at,
    })
    await repo.insert(batchOf(me), [screen('Boss', 1000), screen('Boss', 3000)])
    await repo.insert(batchOf(other), [screen('Boss', 5000), screen('Today', 2000)])

    expect(await repo.screens(new Date('2026-11-01T00:00:00Z'))).toEqual([
      { name: 'Boss', visitors: 2, views: 3, medianMs: 3000 },
      { name: 'Today', visitors: 1, views: 1, medianMs: 2000 },
    ])
  })
})
