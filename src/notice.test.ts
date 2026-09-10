// 계약이 실제로 지켜지는지 본다. FCM 은 `data` 값이 전부 문자열이어야 하고, 하나라도
// 아니면 발송이 거부된다. 그 실패는 보내 봐야 드러나므로 여기서 막는다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  nexonNoticeId,
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

test('업데이트와 이벤트가 한 토픽을 쓴다', () => {
  assert.equal(TOPIC_BY_KIND.update, TOPIC_BY_KIND.event)
})

test('네 토글이 서로 다른 토픽이다', () => {
  const topics = new Set(Object.values(TOPIC_BY_KIND))

  assert.equal(topics.size, 4)
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

// 이벤트·캐시샵 본문은 이미지 한 장이라 평문이 0자다. 그대로 두면 알림 둘째 줄이 빈칸이다.
test('본문이 비면 알림 문구가 제목을 쓴다', () => {
  const 이미지만: Notice = { ...공지, kind: 'event', title: '썬데이 메이플', body: '' }

  assert.deepEqual(pushTextFor(이미지만), { title: '썬데이 메이플', body: '썬데이 메이플' })
})

test('알림 본문은 첫 줄만 쓴다', () => {
  const 여러줄: Notice = { ...공지, body: '첫 줄\n둘째 줄\n셋째 줄' }

  assert.equal(pushTextFor(여러줄).body, '첫 줄')
})
