import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { type NewNotice, NoticesRepository } from './notices.repository'

function notice(over: Partial<NewNotice> & Pick<NewNotice, 'noticeKey'>): NewNotice {
  return {
    kind: 'game',
    title: `제목 ${over.noticeKey}`,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  }
}

describeDb('NoticesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: NoticesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new NoticesRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('list 는 분류를 거르고 published_at 역순으로 limit 까지 내며 blocks 는 안 싣는다', async () => {
    await repo.insert(
      notice({ noticeKey: 'game-1', publishedAt: new Date('2026-10-01T00:00:00Z') }),
    )
    await repo.insert(
      notice({
        noticeKey: 'game-2',
        publishedAt: new Date('2026-10-03T00:00:00Z'),
        blocks: [{ type: 'text', text: 'x' }],
      }),
    )
    await repo.insert(
      notice({
        noticeKey: 'notice-1',
        kind: 'app',
        body: '본문',
        publishedAt: new Date('2026-10-02T00:00:00Z'),
      }),
    )

    const all = await repo.list(null, 2)
    expect(all.map((r) => r.noticeKey)).toEqual(['game-2', 'notice-1'])
    expect(all[0]).not.toHaveProperty('blocks')

    const games = await repo.list(['game'], 10)
    expect(games.map((r) => r.noticeKey)).toEqual(['game-2', 'game-1'])
  })

  it('findByKey 는 blocks 까지 주고 없으면 null 이다', async () => {
    await repo.insert(
      notice({
        noticeKey: 'game-1',
        blocks: [{ type: 'image', src: 'x' }],
        sourceId: 1,
        link: 'https://g',
      }),
    )

    const row = await repo.findByKey('game-1')
    expect(row).toMatchObject({
      noticeKey: 'game-1',
      kind: 'game',
      sourceId: 1,
      link: 'https://g',
      blocks: [{ type: 'image', src: 'x' }],
    })
    expect(await repo.findByKey('nope')).toBeNull()
  })

  it('hasAny 와 knownKeys 는 분류와 열쇠로 있는 것을 가린다', async () => {
    await repo.insert(notice({ noticeKey: 'game-1' }))

    expect(await repo.hasAny('game')).toBe(true)
    expect(await repo.hasAny('update')).toBe(false)
    expect(await repo.knownKeys(['game-1', 'game-2'])).toEqual(new Set(['game-1']))
    expect(await repo.knownKeys([])).toEqual(new Set())
  })

  describe('넥슨 공지의 30일 갱신', () => {
    const T0 = new Date('2026-10-01T00:00:00Z')
    const T1 = new Date('2026-10-20T00:00:00Z')

    it('refresh 는 목록 값과 받은 시각을 고치고, 알림 시각은 건드리지 않는다', async () => {
      const { id } = await repo.insert(
        notice({ noticeKey: 'game-1', title: '옛 제목', link: 'https://old', fetchedAt: T0 }),
      )
      await repo.markSent(id, T0)

      await repo.refresh(
        [{ noticeKey: 'game-1', title: '새 제목', link: 'https://new', publishedAt: T1 }],
        T1,
      )

      const row = await repo.findByKey('game-1')
      expect(row).toEqual(
        expect.objectContaining({
          title: '새 제목',
          link: 'https://new',
          publishedAt: T1,
          sentAt: T0,
        }),
      )
      expect(await repo.staleDetailKeys(['game-1'], T1)).toEqual(new Set())
    })

    it('purgeStale 은 받은 시각이 기준보다 앞선 넥슨 공지만 지우고 운영자 공지는 남긴다', async () => {
      await repo.insert(notice({ noticeKey: 'game-old', fetchedAt: T0 }))
      await repo.insert(notice({ noticeKey: 'game-new', fetchedAt: T1 }))
      await repo.insert(notice({ noticeKey: 'notice-1', kind: 'app' }))

      expect(await repo.purgeStale(new Date('2026-10-10T00:00:00Z'))).toBe(1)

      expect(await repo.knownKeys(['game-old', 'game-new', 'notice-1'])).toEqual(
        new Set(['game-new', 'notice-1']),
      )
    })

    it('staleDetailKeys 는 상세를 받은 시각이 기준보다 앞선 열쇠만 주고, updateDetail 이 그것을 고친다', async () => {
      const blocks = [{ type: 'text' as const, text: 'x' }]
      await repo.insert(
        notice({ noticeKey: 'event-1', kind: 'event', blocks, fetchedAt: T0, detailFetchedAt: T0 }),
      )
      await repo.insert(
        notice({ noticeKey: 'event-2', kind: 'event', blocks, fetchedAt: T1, detailFetchedAt: T1 }),
      )
      const before = new Date('2026-10-10T00:00:00Z')

      expect(await repo.staleDetailKeys(['event-1', 'event-2'], before)).toEqual(
        new Set(['event-1']),
      )

      const fresh = [{ type: 'text' as const, text: 'y' }]
      await repo.updateDetail('event-1', { blocks: fresh, startsAt: T1, endsAt: null }, T1)

      expect(await repo.staleDetailKeys(['event-1', 'event-2'], before)).toEqual(new Set())
      expect((await repo.findByKey('event-1'))?.blocks).toEqual(fresh)
    })
  })

  it('같은 열쇠를 두 번 넣으면 던진다', async () => {
    await repo.insert(notice({ noticeKey: 'game-1' }))

    await expect(repo.insert(notice({ noticeKey: 'game-1' }))).rejects.toThrow()
  })

  it('dueScheduled 는 예약이 지났고 안 보낸 app 공지만 주고 markSent 가 그것을 뺀다', async () => {
    const now = new Date('2026-10-14T00:00:00Z')
    const { id } = await repo.insert(
      notice({ noticeKey: 'notice-1', kind: 'app', scheduledAt: new Date('2026-10-13T00:00:00Z') }),
    )
    await repo.insert(
      notice({ noticeKey: 'notice-2', kind: 'app', scheduledAt: new Date('2026-10-15T00:00:00Z') }),
    )
    await repo.insert(notice({ noticeKey: 'notice-3', kind: 'app' }))

    expect((await repo.dueScheduled(now)).map((r) => r.noticeKey)).toEqual(['notice-1'])

    await repo.markSent(id, now)
    expect(await repo.dueScheduled(now)).toEqual([])
    expect((await repo.findByKey('notice-1'))?.sentAt).toEqual(now)
  })

  it('recentEvents 는 이벤트만, starts_at 이 없으면 published_at 으로 정렬한다', async () => {
    await repo.insert(
      notice({
        noticeKey: 'event-1',
        kind: 'event',
        publishedAt: new Date('2026-10-01T00:00:00Z'),
        startsAt: new Date('2026-10-20T00:00:00Z'),
      }),
    )
    await repo.insert(
      notice({
        noticeKey: 'event-2',
        kind: 'event',
        publishedAt: new Date('2026-10-10T00:00:00Z'),
      }),
    )
    await repo.insert(
      notice({ noticeKey: 'game-1', publishedAt: new Date('2026-10-30T00:00:00Z') }),
    )

    const rows = await repo.recentEvents(10)
    expect(rows.map((r) => r.noticeKey)).toEqual(['event-1', 'event-2'])
    expect(rows[0]).toHaveProperty('blocks')
  })

  it('운영자 공지 다섯 메서드는 app 만 보고 넥슨 공지는 없는 것으로 친다', async () => {
    const { id: appId } = await repo.insert(
      notice({
        noticeKey: 'notice-1',
        kind: 'app',
        body: '본문',
        scheduledAt: new Date('2026-12-01T00:00:00Z'),
      }),
    )
    const { id: gameId } = await repo.insert(notice({ noticeKey: 'game-1' }))

    expect((await repo.listApp(10)).map((r) => r.noticeKey)).toEqual(['notice-1'])
    expect(await repo.findAppById(gameId)).toBeNull()
    expect((await repo.findAppById(appId))?.noticeKey).toBe('notice-1')

    expect(await repo.updateApp(gameId, { title: 'x', body: 'y', link: null })).toBe(false)
    expect(
      await repo.updateApp(appId, { title: '고친 제목', body: '고친 본문', link: 'https://l' }),
    ).toBe(true)
    const updated = await repo.findAppById(appId)
    expect(updated).toMatchObject({ title: '고친 제목', body: '고친 본문', link: 'https://l' })
    expect(updated?.publishedAt).toEqual(new Date('2026-10-01T00:00:00Z'))

    expect(await repo.cancelSchedule(appId)).toBe(true)
    expect((await repo.findAppById(appId))?.scheduledAt).toBeNull()
    expect(await repo.cancelSchedule(appId)).toBe(false)

    expect(await repo.deleteApp(gameId)).toBe(false)
    expect(await repo.deleteApp(appId)).toBe(true)
    expect(await repo.findByKey('game-1')).not.toBeNull()
    expect(await repo.findByKey('notice-1')).toBeNull()
  })

  it('이미 나간 예약은 취소할 수 없다', async () => {
    const { id } = await repo.insert(
      notice({ noticeKey: 'notice-2', kind: 'app', scheduledAt: new Date('2026-10-02T00:00:00Z') }),
    )
    await repo.markSent(id, new Date())

    expect(await repo.cancelSchedule(id)).toBe(false)
  })

  // 알림을 보낸 날 방문자가 뛰므로 대시보드가 날짜 아래에 놓는다. 보낸 시각이 없는 공지는 알림을 안 쏜 것이다.
  it('날마다 분류별 발송 수를 한국 시각으로 세고, 보내지 않은 공지는 뺀다', async () => {
    const sent = async (noticeKey: string, kind: NewNotice['kind'], at: string | null) => {
      const { id } = await repo.insert(notice({ noticeKey, kind }))
      if (at !== null) await repo.markSent(id, new Date(at))
    }
    await sent('app-1', 'app', '2026-11-02T15:30:00Z')
    await sent('game-1', 'game', '2026-11-03T03:00:00Z')
    await sent('game-2', 'game', '2026-11-03T04:00:00Z')
    await sent('cash-1', 'cashshop', '2026-11-03T04:00:00Z')
    await sent('event-1', 'event', null)
    await sent('game-3', 'game', '2026-11-03T15:10:00Z')

    const rows = await repo.sentDaily({
      since: new Date('2026-11-02T15:00:00Z'),
      until: new Date('2026-11-03T15:00:00Z'),
    })

    expect(rows).toHaveLength(3)
    expect(rows).toEqual(
      expect.arrayContaining([
        { day: '2026-11-03', kind: 'app', count: 1 },
        { day: '2026-11-03', kind: 'game', count: 2 },
        { day: '2026-11-03', kind: 'cashshop', count: 1 },
      ]),
    )
  })
})
