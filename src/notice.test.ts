// 계약이 실제로 지켜지는지 본다. FCM 은 `data` 값이 전부 문자열이어야 하고, 하나라도
// 아니면 발송이 거부된다. 그 실패는 보내 봐야 드러나므로 여기서 막는다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toPushData, type Notice } from './notice.ts'

const 공지: Notice = {
  id: 'a',
  title: '점검 안내',
  body: '9월 9일 새벽 2시부터 점검합니다.',
  publishedAt: '2026-09-08T12:00:00.000Z',
}

test('네 필드를 계약대로 넘긴다', () => {
  assert.deepEqual(toPushData(공지), {
    noticeId: 'a',
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
