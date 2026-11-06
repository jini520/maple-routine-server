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

  const event = (
    type: 'visit' | 'screen' | 'action',
    at: string,
    name = '',
    durationMs: number | null = null,
  ) => ({ type, name, durationMs, at: new Date(at) })
  // 한국 시각 11월 3일 하루. 오늘(11월 4일)은 대시보드가 빼므로 until 은 11월 4일 0시(KST)다.
  const nov3 = { since: new Date('2026-11-02T15:00:00Z'), until: new Date('2026-11-03T15:00:00Z') }

  // UTC 로 자르면 한국 시각 오전 9시 전의 방문이 전날로 간다.
  it('날마다 방문자 · 방문 · 화면 조회를 한국 시각으로 자르고, 기간 끝 뒤의 사건은 뺀다', async () => {
    await repo.insert(batchOf(me), [
      event('visit', '2026-11-02T15:30:00Z'),
      event('screen', '2026-11-02T15:31:00Z', 'Boss', 1000),
      event('visit', '2026-11-03T03:00:00Z'),
      event('visit', '2026-11-03T15:10:00Z'),
    ])
    await repo.insert(batchOf(other, 'android'), [event('visit', '2026-11-03T05:00:00Z')])

    expect(await repo.dailyCounts(nov3)).toEqual([
      { day: '2026-11-03', visitors: 2, visits: 3, views: 1 },
    ])
    expect(await repo.dailyCounts(nov3, { platform: 'android' })).toEqual([
      { day: '2026-11-03', visitors: 1, visits: 1, views: 0 },
    ])
  })

  it('동작은 날마다 이름별로 센다', async () => {
    await repo.insert(batchOf(me), [
      event('action', '2026-11-03T01:00:00Z', 'drop-save'),
      event('action', '2026-11-03T02:00:00Z', 'drop-save'),
      event('action', '2026-11-03T02:00:00Z', 'cashbook-add'),
    ])

    const rows = await repo.dailyActions(nov3)

    expect(rows).toHaveLength(2)
    expect(rows).toEqual(
      expect.arrayContaining([
        { day: '2026-11-03', name: 'drop-save', count: 2 },
        { day: '2026-11-03', name: 'cashbook-add', count: 1 },
      ]),
    )
  })

  // 날마다의 방문자를 더하면 이틀 온 사람이 둘로 잡힌다.
  it('기간 방문자는 서로 다른 사람이다', async () => {
    const twoDays = { since: new Date('2026-11-01T15:00:00Z'), until: nov3.until }
    await repo.insert(batchOf(me), [
      event('visit', '2026-11-02T01:00:00Z'),
      event('visit', '2026-11-03T01:00:00Z'),
    ])
    await repo.insert(batchOf(other, 'android'), [event('visit', '2026-11-03T01:00:00Z')])

    expect(await repo.visitorCount(twoDays)).toBe(2)
    expect(await repo.visitorCount(twoDays, { platform: 'ios' })).toBe(1)
  })

  // 둘 다 쓴 사람을 양쪽에 세면 나눈 합이 방문자보다 커진다.
  it('구성은 그 사람의 기간 안 마지막 사건 하나로 한 번만 센다', async () => {
    await repo.insert({ ...batchOf(me, 'ios'), appVersion: '1.0.13' }, [
      event('visit', '2026-11-03T01:00:00Z'),
    ])
    await repo.insert(
      { ...batchOf(me, 'android'), identifiedBy: 'login', appVersion: '1.0.13+1' },
      [event('visit', '2026-11-03T05:00:00Z')],
    )
    await repo.insert(batchOf(other, 'ios'), [event('visit', '2026-11-03T02:00:00Z')])

    const parts = await repo.composition(nov3)

    expect(parts.platform).toEqual(
      expect.arrayContaining([
        { name: 'android', value: 1 },
        { name: 'ios', value: 1 },
      ]),
    )
    expect(parts.identity).toEqual(
      expect.arrayContaining([
        { name: 'login', value: 1 },
        { name: 'key', value: 1 },
      ]),
    )
    expect(parts.version).toEqual(
      expect.arrayContaining([
        { name: '1.0.13+1', value: 1 },
        { name: '1.0.13', value: 1 },
      ]),
    )
  })

  it('방문 시각을 한국 시각의 요일(월요일 0)과 시로 센다', async () => {
    // 2026-11-03 은 화요일이다. 03:00Z 는 한국 시각 12시다.
    await repo.insert(batchOf(me), [
      event('visit', '2026-11-03T03:00:00Z'),
      event('visit', '2026-11-03T03:20:00Z'),
      event('screen', '2026-11-03T03:21:00Z', 'Boss', 1000),
    ])

    expect(await repo.visitHours(nov3)).toEqual([{ weekday: 1, hour: 12, visits: 2 }])
  })

  it('화면마다 방문자 · 본 횟수 · 체류 중앙값을 내고, 방문자가 많은 화면부터다', async () => {
    const at = '2026-11-03T05:00:00Z'
    await repo.insert(batchOf(me), [
      event('screen', at, 'Boss', 1000),
      event('screen', at, 'Boss', 3000),
    ])
    await repo.insert(batchOf(other), [
      event('screen', at, 'Boss', 5000),
      event('screen', at, 'Today', 2000),
    ])

    expect(await repo.screenStats(nov3)).toEqual([
      { name: 'Boss', visitors: 2, views: 3, medianMs: 3000 },
      { name: 'Today', visitors: 1, views: 1, medianMs: 2000 },
    ])
  })

  it('화면 하나의 날마다 방문자를 낸다', async () => {
    const twoDays = { since: new Date('2026-11-01T15:00:00Z'), until: nov3.until }
    await repo.insert(batchOf(me), [
      event('screen', '2026-11-02T01:00:00Z', 'Boss', 1000),
      event('screen', '2026-11-03T01:00:00Z', 'Boss', 1000),
      event('screen', '2026-11-03T02:00:00Z', 'Boss', 1000),
      event('screen', '2026-11-03T02:00:00Z', 'Today', 1000),
    ])
    await repo.insert(batchOf(other), [event('screen', '2026-11-03T01:00:00Z', 'Boss', 1000)])

    expect(await repo.screenDaily('Boss', twoDays)).toEqual([
      { day: '2026-11-02', visitors: 1 },
      { day: '2026-11-03', visitors: 2 },
    ])
  })
})
