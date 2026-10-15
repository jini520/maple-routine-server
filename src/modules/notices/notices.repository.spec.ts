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
})
