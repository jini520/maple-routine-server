import type { ConfigService } from '@nestjs/config'
import type { SchedulerRegistry } from '@nestjs/schedule'

import type { NexonNoticeItem, NexonOpenApiClient } from '../../clients/nexon-open-api.client'
import type { Env } from '../../config/env.schema'
import type { PushService } from '../push/push.service'
import { DETAIL_REFRESH_MS, NoticePoller, RETAIN_MS, shouldNotify, STALE_MS } from './notice-poller'
import type { NewNotice, NoticeRow, NoticesRepository } from './notices.repository'

const NOW = new Date('2026-10-14T12:00:00Z')

function item(noticeId: number, title: string, minutesAgo = 5): NexonNoticeItem {
  return {
    noticeId,
    title,
    url: `https://n/${noticeId}`,
    date: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  }
}

function build() {
  const lists: Partial<Record<string, NexonNoticeItem[]>> = {}
  const nexon = {
    enabled: true,
    noticeList: jest.fn((kind: string) => Promise.resolve(lists[kind] ?? [])),
    noticeDetail: jest.fn(),
  }
  const stored: NewNotice[] = []
  const repo = {
    knownKeys: jest.fn((keys: readonly string[]) =>
      Promise.resolve(new Set(keys.filter((k) => stored.some((s) => s.noticeKey === k)))),
    ),
    hasAny: jest.fn((kind: string) => Promise.resolve(stored.some((s) => s.kind === kind))),
    insert: jest.fn((input: NewNotice) => {
      stored.push(input)
      return Promise.resolve({ id: `id-${input.noticeKey}` })
    }),
    markSent: jest.fn().mockResolvedValue(undefined),
    dueScheduled: jest.fn<Promise<NoticeRow[]>, [Date]>().mockResolvedValue([]),
    refresh: jest.fn().mockResolvedValue(undefined),
    purgeStale: jest.fn().mockResolvedValue(0),
    staleDetailKeys: jest
      .fn<Promise<Set<string>>, [readonly string[], Date]>()
      .mockResolvedValue(new Set()),
    updateDetail: jest.fn().mockResolvedValue(undefined),
  }
  const push = { sendNotice: jest.fn().mockResolvedValue('msg-1') }
  const config = { get: () => 60_000 } as unknown as ConfigService<Env, true>
  const scheduler = {
    addInterval: jest.fn(),
    deleteInterval: jest.fn(),
  } as unknown as SchedulerRegistry
  const poller = new NoticePoller(
    nexon as unknown as NexonOpenApiClient,
    repo as unknown as NoticesRepository,
    push as unknown as PushService,
    config,
    scheduler,
  )
  poller.clock = () => NOW
  return { poller, nexon, repo, push, stored, lists }
}

describe('shouldNotify', () => {
  it('이벤트는 썬데이만, 나머지 분류는 전부 알린다', () => {
    expect(shouldNotify('event', '가을 이벤트')).toBe(false)
    expect(shouldNotify('event', '썬데이 메이플')).toBe(true)
    expect(shouldNotify('game', '점검')).toBe(true)
    expect(shouldNotify('cashshop', '세일')).toBe(true)
  })
})

describe('NoticePoller', () => {
  it('새 id 만 저장하고 알림을 보내고 sent_at 을 적는다', async () => {
    const { poller, repo, push, stored, lists } = build()
    stored.push({ noticeKey: 'game-1', kind: 'game', title: '옛 글', publishedAt: NOW })
    lists.game = [item(2, '새 점검'), item(1, '옛 글')]

    const summary = await poller.tick()

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        noticeKey: 'game-2',
        kind: 'game',
        title: '새 점검',
        link: 'https://n/2',
        sourceId: 2,
      }),
    )
    expect(push.sendNotice).toHaveBeenCalledWith(
      expect.objectContaining({ noticeKey: 'game-2', kind: 'game' }),
    )
    expect(repo.markSent).toHaveBeenCalledWith('id-game-2', NOW)
    expect(summary).toEqual({ stored: 1, notified: 1, scheduled: 0 })
  })

  it('표가 빈 분류의 첫 회차는 저장만 한다', async () => {
    const { poller, repo, push, lists } = build()
    lists.update = [item(1, 'a'), item(2, 'b')]

    const summary = await poller.tick()

    expect(repo.insert).toHaveBeenCalledTimes(2)
    expect(push.sendNotice).not.toHaveBeenCalled()
    expect(summary).toEqual({ stored: 2, notified: 0, scheduled: 0 })
  })

  it('6시간 넘은 글은 저장만 한다', async () => {
    const { poller, push, stored, lists } = build()
    stored.push({ noticeKey: 'game-0', kind: 'game', title: '씨', publishedAt: NOW })
    lists.game = [item(1, '늦게 발견', STALE_MS / 60_000 + 1), item(2, '제때', 3)]

    await poller.tick()

    expect(push.sendNotice).toHaveBeenCalledTimes(1)
    expect(push.sendNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'game-2' }))
  })

  it('이벤트는 썬데이만 알리고, 썬데이는 상세를 받아 blocks 와 기간을 저장한다', async () => {
    const { poller, nexon, repo, push, stored, lists } = build()
    stored.push({ noticeKey: 'event-0', kind: 'event', title: '씨', publishedAt: NOW })
    lists.event = [item(1, '가을 이벤트'), item(2, '스페셜 썬데이 메이플')]
    nexon.noticeDetail.mockResolvedValue({
      title: '스페셜 썬데이 메이플',
      url: 'https://n/2',
      contents: '<div><img src="https://img/x.png"></div>',
      date: '2026-10-14T20:00+09:00',
      eventStart: '2026-10-18T00:00+09:00',
      eventEnd: '2026-10-18T23:59+09:00',
    })

    await poller.tick()

    expect(nexon.noticeDetail).toHaveBeenCalledTimes(1)
    expect(nexon.noticeDetail).toHaveBeenCalledWith('event', 2)
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        noticeKey: 'event-2',
        blocks: [{ type: 'image', src: 'https://img/x.png' }],
        startsAt: new Date('2026-10-17T15:00:00Z'),
        endsAt: new Date('2026-10-18T14:59:00Z'),
      }),
    )
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ noticeKey: 'event-1', blocks: null }),
    )
    expect(push.sendNotice).toHaveBeenCalledTimes(1)
    expect(push.sendNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'event-2' }))
  })

  const sunday = (contents: string) => ({
    title: '스페셜 썬데이 메이플',
    url: 'https://n/1',
    contents,
    date: '2026-10-14T20:00+09:00',
    eventStart: '2026-10-18T00:00+09:00',
    eventEnd: '2026-10-18T23:59+09:00',
  })

  // 제목이 빈 글은 제목 없는 알림이 되고, 날짜를 못 읽으면 저장이 터져 그 분류의 남은 새 글까지 그 회차에 빠진다.
  it('제목이나 날짜가 빈 글은 그 회차에 건너뛰고 나머지 새 글은 저장하고 알린다', async () => {
    const { poller, repo, push, stored, lists } = build()
    stored.push({ noticeKey: 'game-0', kind: 'game', title: '씨', publishedAt: NOW })
    lists.game = [
      { ...item(3, ''), title: '' },
      { ...item(4, '날짜 없음'), date: '' },
      item(5, '새 점검'),
    ]

    const summary = await poller.tick()

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'game-5' }))
    expect(push.sendNotice).toHaveBeenCalledTimes(1)
    expect(summary).toEqual({ stored: 1, notified: 1, scheduled: 0 })
  })

  it('빈 값이던 글이 다음 회차에 채워져 오면 새 글로 저장하고 알린다', async () => {
    const { poller, repo, push, stored, lists } = build()
    stored.push({ noticeKey: 'game-0', kind: 'game', title: '씨', publishedAt: NOW })
    lists.game = [{ ...item(3, ''), title: '' }]
    await poller.tick()

    lists.game = [item(3, '채워진 제목')]
    await poller.tick()

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ noticeKey: 'game-3', title: '채워진 제목' }),
    )
    expect(push.sendNotice).toHaveBeenCalledTimes(1)
  })

  it('썬데이 상세가 실패하면 그 글만 건너뛰고, 다른 새 글은 저장하며, 다음 회차에 다시 받는다', async () => {
    const { poller, nexon, repo, stored, lists } = build()
    stored.push({ noticeKey: 'event-0', kind: 'event', title: '씨', publishedAt: NOW })
    lists.event = [item(1, '스페셜 썬데이 메이플'), item(2, '가을 이벤트')]
    nexon.noticeDetail.mockRejectedValueOnce(new Error('timeout'))

    await poller.tick()

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'event-2' }))

    nexon.noticeDetail.mockResolvedValue(sunday('<div><img src="https://img/x.png"></div>'))
    await poller.tick()

    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'event-1' }))
  })

  it('썬데이 상세의 본문이 비면 저장하지 않고 다음 회차에 다시 받는다', async () => {
    const { poller, nexon, repo, stored, lists } = build()
    stored.push({ noticeKey: 'event-0', kind: 'event', title: '씨', publishedAt: NOW })
    lists.event = [item(1, '스페셜 썬데이 메이플')]
    nexon.noticeDetail.mockResolvedValueOnce(sunday(''))

    await poller.tick()
    expect(repo.insert).not.toHaveBeenCalled()

    nexon.noticeDetail.mockResolvedValue(sunday('<div><img src="https://img/x.png"></div>'))
    await poller.tick()
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'event-1' }))
  })

  it('새 글은 받은 시각을 함께 저장한다', async () => {
    const { poller, repo, stored, lists } = build()
    stored.push({ noticeKey: 'game-0', kind: 'game', title: '씨', publishedAt: NOW })
    lists.game = [item(1, '새 글')]

    await poller.tick()

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ noticeKey: 'game-1', fetchedAt: NOW }),
    )
  })

  // 넥슨 AI 에이전트 가이드의 30일 갱신. 목록에 있는 글은 회차마다 다시 받은 것으로 고친다.
  it('목록에 있는 아는 글은 제목 · 링크 · 날짜와 받은 시각을 고치고, 다시 알리지 않는다', async () => {
    const { poller, repo, push, stored, lists } = build()
    stored.push({ noticeKey: 'game-1', kind: 'game', title: '옛 제목', publishedAt: NOW })
    lists.game = [item(1, '고친 제목')]

    await poller.tick()

    expect(repo.refresh).toHaveBeenCalledWith(
      [
        {
          noticeKey: 'game-1',
          title: '고친 제목',
          link: 'https://n/1',
          publishedAt: new Date(item(1, '').date),
        },
      ],
      NOW,
    )
    expect(repo.insert).not.toHaveBeenCalled()
    expect(push.sendNotice).not.toHaveBeenCalled()
  })

  it('목록에 있는 썬데이 글은 상세를 받은 지 오래되면 다시 받는다', async () => {
    const { poller, nexon, repo, stored, lists } = build()
    stored.push({
      noticeKey: 'event-1',
      kind: 'event',
      title: '스페셜 썬데이 메이플',
      publishedAt: NOW,
    })
    lists.event = [item(1, '스페셜 썬데이 메이플'), item(2, '가을 이벤트')]
    repo.staleDetailKeys.mockImplementation((keys: readonly string[]) =>
      Promise.resolve(new Set(keys.filter((k) => k === 'event-1'))),
    )
    nexon.noticeDetail.mockResolvedValue(sunday('<div><img src="https://img/y.png"></div>'))

    await poller.tick()

    expect(repo.staleDetailKeys).toHaveBeenCalledWith(
      ['event-1'],
      new Date(NOW.getTime() - DETAIL_REFRESH_MS),
    )
    expect(repo.updateDetail).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ blocks: [{ type: 'image', src: 'https://img/y.png' }] }),
      NOW,
    )
  })

  it('받은 지 30일이 지난 넥슨 공지 줄을 지운다', async () => {
    const { poller, repo } = build()

    await poller.tick()

    expect(repo.purgeStale).toHaveBeenCalledWith(new Date(NOW.getTime() - RETAIN_MS))
  })

  it('알림 실패는 그 회차에서 끝나고 sent_at 은 비어 있다', async () => {
    const { poller, repo, push, stored, lists } = build()
    stored.push({ noticeKey: 'game-0', kind: 'game', title: '씨', publishedAt: NOW })
    lists.game = [item(1, '새 글')]
    push.sendNotice.mockRejectedValue(new Error('fcm down'))

    const summary = await poller.tick()

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.markSent).not.toHaveBeenCalled()
    expect(summary).toEqual({ stored: 1, notified: 0, scheduled: 0 })
  })

  it('분류 하나가 던져도 나머지는 돈다', async () => {
    const { poller, nexon, repo, lists } = build()
    lists.update = [item(1, 'u')]
    nexon.noticeList.mockImplementation((kind: string) =>
      kind === 'game' ? Promise.reject(new Error('429')) : Promise.resolve(lists[kind] ?? []),
    )

    const summary = await poller.tick()

    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ noticeKey: 'update-1' }))
    expect(summary?.stored).toBe(1)
  })

  it('예약 시각이 지난 운영자 공지를 쏘고 sent_at 을 적는다', async () => {
    const { poller, repo, push } = build()
    const due = {
      id: 'id-app',
      noticeKey: 'notice-20261014-000000',
      kind: 'app',
      title: '점검',
      body: '본문',
      link: null,
      sourceId: null,
      publishedAt: NOW,
      startsAt: null,
      endsAt: null,
      scheduledAt: new Date(NOW.getTime() - 1000),
      sentAt: null,
      pushTitle: null,
      pushBody: null,
    } satisfies NoticeRow
    repo.dueScheduled.mockResolvedValue([due])

    const summary = await poller.tick()

    expect(repo.dueScheduled).toHaveBeenCalledWith(NOW)
    expect(push.sendNotice).toHaveBeenCalledWith(due)
    expect(repo.markSent).toHaveBeenCalledWith('id-app', NOW)
    expect(summary?.scheduled).toBe(1)
  })

  it('넥슨 키가 없으면 목록을 안 부르고 예약만 본다', async () => {
    const { poller, nexon, repo } = build()
    nexon.enabled = false

    await poller.tick()

    expect(nexon.noticeList).not.toHaveBeenCalled()
    expect(repo.dueScheduled).toHaveBeenCalled()
  })

  it('회차가 겹치면 두 번째는 건너뛴다', async () => {
    const { poller, nexon, lists } = build()
    lists.game = []
    let release = () => {}
    nexon.noticeList.mockImplementationOnce(
      () =>
        new Promise<NexonNoticeItem[]>((resolve) => {
          release = () => resolve([])
        }),
    )

    const first = poller.tick()
    const second = await poller.tick()
    release()
    await first

    expect(second).toBeNull()
    expect(nexon.noticeList).toHaveBeenCalledTimes(4)
  })
})
