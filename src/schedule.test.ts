// 예약 알림 한 회차. DB 와 FCM 은 안 타고, 시각이 된 것을 받아 보내는 고리만 본다.
// 여기서 막는 사고는 «한 건이 실패해서 나머지가 안 나가는» 종류다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Notice, PushText } from './notice.ts'
import { sendDue, type DuePush } from './schedule.ts'

function 예약(id: string): DuePush {
  return {
    notice: {
      id,
      kind: 'app',
      title: '점검 안내',
      body: '9월 20일 새벽 2시부터 점검합니다.',
      publishedAt: '2026-09-19T05:00:00.000Z',
    },
    push: { title: '점검 안내', body: '새벽 2시부터 점검합니다.' },
  }
}

function 보낸것(): { calls: string[]; send: (notice: Notice, push: PushText) => Promise<void> } {
  const calls: string[] = []
  return {
    calls,
    send: (notice) => {
      calls.push(notice.id)
      return Promise.resolve()
    },
  }
}

test('시각이 된 예약을 보낸다', async () => {
  const sent = 보낸것()

  const result = await sendDue({ due: () => Promise.resolve([예약('a')]), send: sent.send })

  assert.deepEqual(result, { sent: 1, failed: 0 })
  assert.deepEqual(sent.calls, ['a'])
})

// 예약해 둔 문구를 그대로 보낸다. 분류 규칙이 만드는 넥슨 공지 문구와 달리, 운영자 공지는
// 예약할 때 적은 것이 곧 트레이에 뜰 글이다.
test('예약할 때 적어 둔 문구로 보낸다', async () => {
  const seen: PushText[] = []

  await sendDue({
    due: () => Promise.resolve([예약('a')]),
    send: (_notice, push) => {
      seen.push(push)
      return Promise.resolve()
    },
  })

  assert.deepEqual(seen, [{ title: '점검 안내', body: '새벽 2시부터 점검합니다.' }])
})

test('시각이 된 예약이 없으면 아무것도 안 보낸다', async () => {
  const sent = 보낸것()

  const result = await sendDue({ due: () => Promise.resolve([]), send: sent.send })

  assert.deepEqual(result, { sent: 0, failed: 0 })
  assert.deepEqual(sent.calls, [])
})

// FCM 이 한 건을 거절해도 나머지는 나가야 한다. 한 건에서 멈추면 같은 시각에 걸어 둔 예약이
// 앞 건의 실패에 발목을 잡힌다.
test('한 건이 실패해도 나머지를 보낸다', async () => {
  const calls: string[] = []

  const result = await sendDue({
    due: () => Promise.resolve([예약('a'), 예약('b'), 예약('c')]),
    send: (notice) => {
      calls.push(notice.id)
      return notice.id === 'b' ? Promise.reject(new Error('FCM 거절')) : Promise.resolve()
    },
  })

  assert.deepEqual(result, { sent: 2, failed: 1 })
  assert.deepEqual(calls, ['a', 'b', 'c'])
})
