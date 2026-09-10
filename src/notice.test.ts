// 계약이 실제로 지켜지는지 본다. FCM 은 `data` 값이 전부 문자열이어야 하고, 하나라도
// 아니면 발송이 거부된다. 그 실패는 보내 봐야 드러나므로 여기서 막는다.
import assert from 'node:assert/strict'
import { describe, it, test } from 'node:test'

import {
  nexonNoticeId,
  sundayRecordsFrom,
  pushTextFor,
  shouldNotify,
  toPushData,
  TOPIC_BY_KIND,
  type Notice,
} from './notice.ts'

const 공지: Notice = {
  id: 'a',
  kind: 'app',
  title: '점검 안내',
  body: '9월 9일 새벽 2시부터 점검합니다.',
  publishedAt: '2026-09-08T12:00:00.000Z',
}

test('다섯 필드를 계약대로 넘긴다', () => {
  assert.deepEqual(toPushData(공지), {
    noticeId: 'a',
    kind: 'app',
    title: '점검 안내',
    body: '9월 9일 새벽 2시부터 점검합니다.',
    publishedAt: '2026-09-08T12:00:00.000Z',
  })
})

test('값이 전부 문자열이다', () => {
  for (const v of Object.values(toPushData({ ...공지, link: 'https://x.test' }))) {
    assert.equal(typeof v, 'string')
  }
})

// link 가 없을 때 `undefined` 를 실으면 FCM 이 거부한다. 키째 빠져야 한다.
test('link 가 없으면 키째 없다', () => {
  assert.equal('link' in toPushData(공지), false)
})

test('link 가 있으면 담는다', () => {
  assert.equal(toPushData({ ...공지, link: 'https://x.test' }).link, 'https://x.test')
})

// blocks 는 4KB 에 절대 안 들어간다. 실수로 실리면 발송 자체가 막힌다.
test('blocks 는 푸시에 안 실린다', () => {
  const withBlocks: Notice = { ...공지, blocks: [{ type: 'text', text: '본문' }] }

  assert.equal('blocks' in toPushData(withBlocks), false)
})

test('앱 공지의 토픽 이름은 notice 그대로다', () => {
  // 이미 나간 바이너리가 이것을 구독한다. 바꾸면 켠 적 없는 알림이 간다.
  assert.equal(TOPIC_BY_KIND.app, 'notice')
})

// 이벤트로 나가는 것이 썬데이뿐이라 «업데이트·이벤트» 묶음이 뜻을 잃었다. 토글 한 줄이
// 두 가지를 말해야 했다.
test('업데이트와 이벤트가 서로 다른 토픽이다', () => {
  assert.notEqual(TOPIC_BY_KIND.update, TOPIC_BY_KIND.event)
})

test('다섯 분류가 다 다른 토픽이다', () => {
  const topics = new Set(Object.values(TOPIC_BY_KIND))

  assert.equal(topics.size, 5)
})

// notice_id 번호 체계가 분류마다 달라서(공지 149862 · 업데이트 811 · 이벤트 1374 · 캐시샵 642)
// 번호만으로는 어느 글인지 모른다.
test('id 는 분류를 앞에 붙인다', () => {
  assert.equal(nexonNoticeId('event', 1374), 'event-1374')
  assert.notEqual(nexonNoticeId('event', 811), nexonNoticeId('update', 811))
})

test('이벤트는 썬데이만 알림으로 나간다', () => {
  assert.equal(shouldNotify('event', '썬데이 메이플'), true)
  assert.equal(shouldNotify('event', '스페셜 썬데이 메이플'), true)
  assert.equal(shouldNotify('event', '스페셜 썬데이'), true)
  assert.equal(shouldNotify('event', '울티마 유물 탐사'), false)
  assert.equal(shouldNotify('event', '[보스 격파 이벤트] - 광신도의 자격'), false)
})

test('띄어쓰기가 달라도 썬데이를 잡는다', () => {
  assert.equal(shouldNotify('event', '[이벤트]썬데이메이플'), true)
})

test('이벤트가 아닌 분류는 전부 나간다', () => {
  assert.equal(shouldNotify('game', '9/10(목) 넥슨 정기점검 안내'), true)
  assert.equal(shouldNotify('update', '클라이언트 1.2.418 업데이트 안내'), true)
  assert.equal(shouldNotify('cashshop', '8월 20일 캐시아이템 업데이트'), true)
})

// 알림 제목은 분류마다 고정이고 내용이 실제 공지 제목이다(사용자 지정). 공지 제목을 알림
// 제목에 넣으면 트레이에서 한 줄로 잘려 무엇이 왔는지가 안 남는다.
describe('넥슨 공지의 알림 문구', () => {
  const 공지로 = (kind: Notice['kind'], title: string): Notice => ({ ...공지, kind, title })

  it('게임 공지', () => {
    assert.deepEqual(pushTextFor(공지로('game', '9/10(목) 넥슨 정기점검 안내')), {
      title: '새 공지 사항이 올라왔어요.',
      body: '9/10(목) 넥슨 정기점검 안내',
    })
  })

  it('업데이트', () => {
    assert.deepEqual(pushTextFor(공지로('update', '클라이언트 1.2.418 업데이트 안내')), {
      title: '새 업데이트를 확인해보세요.',
      body: '클라이언트 1.2.418 업데이트 안내',
    })
  })

  it('이벤트', () => {
    assert.deepEqual(pushTextFor(공지로('event', '스페셜 썬데이 메이플')), {
      title: '새로운 이벤트가 시작돼요.',
      body: '스페셜 썬데이 메이플',
    })
  })

  // 캐시샵 제목은 앞이 전부 같아서 그대로 두면 알림 스무 개가 «8월 20일 캐시아이템
  // 업데이트 - » 로 시작한다. 다른 것은 뒤쪽뿐이다.
  it('캐시샵은 날짜 접두어를 뗀다', () => {
    assert.deepEqual(pushTextFor(공지로('cashshop', '8월 20일 캐시아이템 업데이트 - 마스터라벨 플러스')), {
      title: '캐시 아이템이 업데이트 됐어요.',
      body: '마스터라벨 플러스',
    })
  })

  it('캐시샵 접두어의 띄어쓰기가 달라도 뗀다', () => {
    assert.equal(pushTextFor(공지로('cashshop', '1월 15일  캐시아이템 업데이트-성별 변경 쿠폰')).body, '성별 변경 쿠폰')
  })

  // 넥슨이 제목 꼴을 바꾸면 못 뗀다. 그때 빈 알림을 보내느니 통째로 보낸다.
  it('접두어가 없으면 제목을 그대로 쓴다', () => {
    assert.equal(pushTextFor(공지로('cashshop', '캐시샵 임시 점검 안내')).body, '캐시샵 임시 점검 안내')
  })

  // 본문이 이미지 한 장이라 평문이 0자여도 알림에는 제목이 실린다.
  it('본문이 비어도 알림 내용이 빈칸이 아니다', () => {
    assert.equal(pushTextFor({ ...공지로('event', '썬데이 메이플'), body: '' }).body, '썬데이 메이플')
  })
})

// 운영자 공지는 이 함수를 안 탄다. `/admin` 과 CLI 가 문구를 직접 받는다.
test('앱 공지는 제목과 본문 첫 줄을 그대로 쓴다', () => {
  const 여러줄: Notice = { ...공지, body: '첫 줄\n둘째 줄' }

  assert.deepEqual(pushTextFor(여러줄), { title: '점검 안내', body: '첫 줄' })
})

describe('썬데이 기록', () => {
  const 기록 = (id: string, title: string, startsAt: string | null, publishedAt: string) => ({
    id,
    title,
    publishedAt,
    startsAt,
    endsAt: null,
  })

  it('썬데이만 고른다', () => {
    const rows = [
      기록('event-1', '울티마 유물 탐사', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
      기록('event-2', '스페셜 썬데이 메이플', '2026-09-06T00:00:00.000Z', '2026-09-05T00:00:00.000Z'),
    ]

    assert.deepEqual(
      sundayRecordsFrom(rows).map((row) => row.id),
      ['event-2'],
    )
  })

  // 기록의 이름은 «어느 일요일이었나» 다. 등록일은 그보다 며칠 앞설 수 있다.
  it('이벤트 시작일 기준 최근 순이다', () => {
    const rows = [
      기록('event-1', '썬데이 메이플', '2026-08-30T00:00:00.000Z', '2026-08-29T00:00:00.000Z'),
      기록('event-2', '썬데이 메이플', '2026-09-06T00:00:00.000Z', '2026-08-28T00:00:00.000Z'),
    ]

    assert.deepEqual(
      sundayRecordsFrom(rows).map((row) => row.id),
      ['event-2', 'event-1'],
    )
  })

  it('기간이 없으면 등록일로 줄 세운다', () => {
    const rows = [
      기록('event-1', '썬데이 메이플', null, '2026-08-30T00:00:00.000Z'),
      기록('event-2', '썬데이 메이플', null, '2026-09-06T00:00:00.000Z'),
    ]

    assert.deepEqual(
      sundayRecordsFrom(rows).map((row) => row.id),
      ['event-2', 'event-1'],
    )
  })
})
