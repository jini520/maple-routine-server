import type { NoticeDetailRow, NoticeRow, NoticesRepository } from './notices.repository'
import { NoticesService } from './notices.service'

function row(over: Partial<NoticeDetailRow>): NoticeDetailRow {
  return {
    id: 'uuid-1',
    noticeKey: 'game-1',
    kind: 'game',
    title: '점검',
    body: null,
    link: 'https://g/1',
    sourceId: 1,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    startsAt: null,
    endsAt: null,
    scheduledAt: null,
    sentAt: null,
    pushTitle: null,
    pushBody: null,
    blocks: null,
    ...over,
  }
}

function build() {
  const repo = {
    list: jest.fn<Promise<NoticeRow[]>, [readonly string[] | null, number]>(),
    findByKey: jest.fn<Promise<NoticeDetailRow | null>, [string]>(),
    recentEvents: jest.fn<Promise<NoticeDetailRow[]>, [number]>(),
  }
  const service = new NoticesService(repo as unknown as NoticesRepository)
  return { service, repo }
}

describe('NoticesService', () => {
  it('list 는 행을 계약 모양으로 바꾸고 body NULL 은 빈 문자열, link 는 있을 때만이다', async () => {
    const { service, repo } = build()
    repo.list.mockResolvedValue([
      row({}),
      row({ noticeKey: 'notice-1', kind: 'app', body: '본문', link: null, title: '운영' }),
    ])

    const items = await service.list(['game', 'app'], 20)

    expect(repo.list).toHaveBeenCalledWith(['game', 'app'], 20)
    expect(items).toEqual([
      {
        id: 'game-1',
        kind: 'game',
        title: '점검',
        body: '',
        publishedAt: '2026-10-01T00:00:00.000Z',
        link: 'https://g/1',
      },
      {
        id: 'notice-1',
        kind: 'app',
        title: '운영',
        body: '본문',
        publishedAt: '2026-10-01T00:00:00.000Z',
      },
    ])
  })

  it('detail 은 blocks 를 싣고 없으면 null 이다', async () => {
    const { service, repo } = build()
    repo.findByKey.mockResolvedValueOnce(row({ blocks: [{ type: 'text', text: '글' }] }))
    repo.findByKey.mockResolvedValueOnce(null)

    expect(await service.detail('game-1')).toMatchObject({
      id: 'game-1',
      blocks: [{ type: 'text', text: '글' }],
    })
    expect(await service.detail('nope')).toBeNull()
  })

  it('sunday 는 제목으로 가려 startsAt ?? publishedAt 순으로 limit 까지 낸다', async () => {
    const { service, repo } = build()
    repo.recentEvents.mockResolvedValue([
      row({
        noticeKey: 'event-3',
        kind: 'event',
        title: '썬데이 메이플',
        startsAt: new Date('2026-10-10T15:00:00Z'),
        endsAt: new Date('2026-10-11T14:59:00Z'),
        blocks: [{ type: 'image', src: 'x' }],
      }),
      row({ noticeKey: 'event-2', kind: 'event', title: '가을 이벤트' }),
      row({
        noticeKey: 'event-1',
        kind: 'event',
        title: '스페셜 썬데이 메이플',
        publishedAt: new Date('2026-09-26T00:00:00Z'),
      }),
    ])

    const items = await service.sunday(1)

    expect(repo.recentEvents).toHaveBeenCalled()
    expect(items).toEqual([
      {
        id: 'event-3',
        kind: 'event',
        title: '썬데이 메이플',
        body: '',
        publishedAt: '2026-10-01T00:00:00.000Z',
        link: 'https://g/1',
        startsAt: '2026-10-10T15:00:00.000Z',
        endsAt: '2026-10-11T14:59:00.000Z',
        blocks: [{ type: 'image', src: 'x' }],
      },
    ])
    expect(await service.sunday(5)).toHaveLength(2)
  })
})
