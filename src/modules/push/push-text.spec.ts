import { messageFor, pushTextFor, TOPIC_BY_KIND, type PushableNotice } from './push-text'

function notice(over: Partial<PushableNotice>): PushableNotice {
  return {
    noticeKey: 'game-1',
    kind: 'game',
    title: '9/10(목) 넥슨 정기점검 안내',
    body: null,
    publishedAt: new Date('2026-09-10T07:00:00Z'),
    link: null,
    pushTitle: null,
    pushBody: null,
    ...over,
  }
}

describe('pushTextFor', () => {
  it('넥슨 공지는 분류가 제목을 정하고 내용은 공지 제목이다', () => {
    expect(pushTextFor(notice({ kind: 'game' }))).toEqual({
      title: '새 공지 사항이 올라왔어요.',
      body: '9/10(목) 넥슨 정기점검 안내',
    })
    expect(
      pushTextFor(notice({ kind: 'update', title: '클라이언트 1.2.418 업데이트 안내' })).title,
    ).toBe('새 업데이트를 확인해보세요.')
    expect(pushTextFor(notice({ kind: 'event', title: '스페셜 썬데이 메이플' })).title).toBe(
      '새로운 이벤트가 시작돼요.',
    )
  })

  it('캐시샵은 접두어를 떼고, 못 떼면 통째로 쓴다', () => {
    expect(
      pushTextFor(
        notice({ kind: 'cashshop', title: '8월 20일 캐시아이템 업데이트 - 마스터라벨 플러스' }),
      ),
    ).toEqual({
      title: '캐시 아이템이 업데이트 됐어요.',
      body: '마스터라벨 플러스',
    })
    expect(pushTextFor(notice({ kind: 'cashshop', title: '깜짝 세일' })).body).toBe('깜짝 세일')
  })

  it('운영자 공지는 push_title · push_body 를 쓰고 없으면 제목과 본문이다', () => {
    expect(
      pushTextFor(
        notice({
          kind: 'app',
          title: '점검 안내',
          body: '본문',
          pushTitle: '알림 제목',
          pushBody: '알림 내용',
        }),
      ),
    ).toEqual({ title: '알림 제목', body: '알림 내용' })
    expect(pushTextFor(notice({ kind: 'app', title: '점검 안내', body: '본문' }))).toEqual({
      title: '점검 안내',
      body: '본문',
    })
  })
})

describe('messageFor', () => {
  it('토픽은 분류마다 하나이고 app 은 notice 다', () => {
    expect(TOPIC_BY_KIND).toEqual({
      app: 'notice',
      game: 'notice-game',
      event: 'notice-event',
      update: 'notice-update',
      cashshop: 'notice-cashshop',
    })
  })

  it('data 는 전부 문자열이고 link 는 있을 때만이다. 4KB 를 넘지 않게 알림 본문은 200자, data 본문은 500자에서 자른다', () => {
    const long = 'x'.repeat(1_500)
    const message = messageFor(
      notice({ kind: 'app', title: '제목', body: long, link: 'https://a' }),
    )
    expect(message.topic).toBe('notice')
    expect(message.notification).toEqual({ title: '제목', body: 'x'.repeat(200) })
    expect(message.data).toEqual({
      noticeId: 'game-1',
      kind: 'app',
      title: '제목',
      body: 'x'.repeat(500),
      publishedAt: '2026-09-10T07:00:00.000Z',
      link: 'https://a',
    })
    expect(messageFor(notice({})).data).not.toHaveProperty('link')
    expect(messageFor(notice({})).data.body).toBe('')
  })
})
