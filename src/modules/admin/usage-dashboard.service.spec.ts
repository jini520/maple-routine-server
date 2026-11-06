import { UsageDashboardService } from './usage-dashboard.service'

// 지금은 한국 시각 11월 5일 12시다. 이틀 기간이면 11월 3일 · 4일이고 앞 기간은 1일 · 2일이다.
const NOW = new Date('2026-11-05T03:00:00Z')
const PERIOD = { since: new Date('2026-11-02T15:00:00Z'), until: new Date('2026-11-04T15:00:00Z') }
const PREVIOUS = {
  since: new Date('2026-10-31T15:00:00Z'),
  until: new Date('2026-11-02T15:00:00Z'),
}

function makeService() {
  const usage = {
    dailyCounts: jest.fn().mockResolvedValue([]),
    dailyActions: jest.fn().mockResolvedValue([]),
    visitorCount: jest.fn().mockResolvedValue(0),
    composition: jest.fn().mockResolvedValue({ platform: [], identity: [], version: [] }),
    visitHours: jest.fn().mockResolvedValue([]),
    screenStats: jest.fn().mockResolvedValue([]),
    screenDaily: jest.fn().mockResolvedValue([]),
  }
  const users = {
    countActive: jest.fn().mockResolvedValue(0),
    createdDaily: jest.fn().mockResolvedValue([]),
  }
  const notices = { sentDaily: jest.fn().mockResolvedValue([]) }
  const service = new UsageDashboardService(usage as never, users as never, notices as never)
  return { service, usage, users, notices }
}

const sameRange = (range: { since: Date; until: Date }): unknown =>
  expect.objectContaining({ since: range.since, until: range.until })

describe('사용자 대시보드', () => {
  it('사건이 없는 날도 0 으로 채우고, 그 날 보낸 알림을 앱 공지와 게임 알림으로 나눈다', async () => {
    const { service, usage, users, notices } = makeService()
    usage.dailyCounts.mockResolvedValue([{ day: '2026-11-04', visitors: 5, visits: 7, views: 9 }])
    users.createdDaily.mockResolvedValue([{ day: '2026-11-03', created: 2, active: 2 }])
    notices.sentDaily.mockResolvedValue([
      { day: '2026-11-04', kind: 'app', count: 1 },
      { day: '2026-11-04', kind: 'game', count: 2 },
      { day: '2026-11-04', kind: 'cashshop', count: 3 },
    ])

    const result = await service.forUsers(2, undefined, NOW)

    expect(result.daily).toEqual([
      { day: '2026-11-03', visitors: 0, fresh: 2, alerts: { app: 0, game: 0, kinds: {} } },
      {
        day: '2026-11-04',
        visitors: 5,
        fresh: 0,
        alerts: { app: 1, game: 5, kinds: { game: 2, cashshop: 3 } },
      },
    ])
  })

  // 사건은 2026-11-06 부터 쌓였다. 그 전 기간과 맞대면 모든 칸이 늘어난 것처럼 보인다.
  it('앞 기간에 방문자가 없으면 증감을 모두 비운다', async () => {
    const { service, usage, users } = makeService()
    usage.visitorCount.mockImplementation(async (range: { since: Date }) =>
      range.since.getTime() === PERIOD.since.getTime() ? 8 : 0,
    )
    users.countActive.mockResolvedValue(10)

    const { tiles } = await service.forUsers(2, undefined, NOW)

    expect(tiles.period).toEqual({ value: 8, delta: null })
    expect(tiles.total.delta).toBeNull()
    expect(tiles.fresh.delta).toBeNull()
  })

  it('전체 사용자의 증감은 기간 첫날 앞에 만든 사람과 맞댄다', async () => {
    const { service, usage, users } = makeService()
    usage.visitorCount.mockResolvedValue(3)
    users.countActive.mockImplementation(async (before?: Date) => (before ? 7 : 10))

    const { tiles } = await service.forUsers(2, undefined, NOW)

    expect(tiles.total.value).toBe(10)
    expect(tiles.total.delta).toBe(3)
    expect(users.countActive).toHaveBeenCalledWith(PERIOD.since)
  })

  // users 에는 플랫폼이 없다. 사건으로 세는 값만 그 플랫폼으로 센다.
  it('플랫폼을 고르면 사건으로 세는 질의에만 넘긴다', async () => {
    const { service, usage, users } = makeService()

    await service.forUsers(2, 'ios', NOW)

    expect(usage.dailyCounts).toHaveBeenCalledWith(sameRange(PERIOD), { platform: 'ios' })
    expect(usage.visitorCount).toHaveBeenCalledWith(sameRange(PREVIOUS), { platform: 'ios' })
    expect(usage.composition).toHaveBeenCalledWith(sameRange(PERIOD), { platform: 'ios' })
    expect(usage.visitHours).toHaveBeenCalledWith(sameRange(PERIOD), { platform: 'ios' })
    expect(users.createdDaily).toHaveBeenCalledWith(sameRange(PERIOD))
  })
})

describe('사용 로그 대시보드', () => {
  it('동작 칸은 두 기간에 나온 이름을 모두 싣고, 앞 기간에 없던 동작의 증감은 지금 횟수다', async () => {
    const { service, usage } = makeService()
    usage.visitorCount.mockResolvedValue(4)
    usage.dailyActions.mockImplementation(async (range: { since: Date }) =>
      range.since.getTime() === PERIOD.since.getTime()
        ? [{ day: '2026-11-04', name: 'drop-save', count: 3 }]
        : [{ day: '2026-11-02', name: 'cashbook-add', count: 2 }],
    )

    const result = await service.forUsage(2, NOW)

    expect(result.metrics.filter((m) => m.key.startsWith('action:'))).toEqual([
      { key: 'action:cashbook-add', label: 'cashbook-add', total: 0, delta: -2 },
      { key: 'action:drop-save', label: 'drop-save', total: 3, delta: 3 },
    ])
    expect(result.daily[1].actions).toEqual({ 'drop-save': 3 })
  })

  it('화면에 머리 줄 제목을 붙이고, 지난 7일 방문자를 그 전 7일과 맞댄 비율로 낸다', async () => {
    const { service, usage } = makeService()
    const recent = new Date('2026-10-28T15:00:00Z')
    const before = new Date('2026-10-21T15:00:00Z')
    usage.screenStats.mockImplementation(async (range: { since: Date }) => {
      if (range.since.getTime() === recent.getTime())
        return [
          { name: 'Boss', visitors: 12, views: 20, medianMs: 1000 },
          { name: 'NewScreen', visitors: 3, views: 3, medianMs: 500 },
        ]
      if (range.since.getTime() === before.getTime())
        return [{ name: 'Boss', visitors: 10, views: 15, medianMs: 1000 }]
      return [
        { name: 'Boss', visitors: 30, views: 50, medianMs: 1200 },
        { name: 'NewScreen', visitors: 3, views: 3, medianMs: 500 },
      ]
    })

    const { screens } = await service.forUsage(2, NOW)

    expect(screens).toEqual([
      {
        name: 'Boss',
        label: '보스 스케줄러',
        visitors: 30,
        views: 50,
        medianMs: 1200,
        recentChange: 20,
      },
      { name: 'NewScreen', label: null, visitors: 3, views: 3, medianMs: 500, recentChange: null },
    ])
  })
})
