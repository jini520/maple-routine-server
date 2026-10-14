// 넥슨 응답을 우리 모양으로 접는 규칙. 표본은 실제 응답에서 잘라 왔다(2026-09-10).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NexonClient, toIso, type Fetcher } from './nexon.ts'

function stub(routes: Record<string, { status?: number; body: unknown }>): Fetcher {
  return (url) => {
    const path = url.replace('https://open.api.nexon.com', '')
    const hit = routes[path] ?? { status: 404, body: { error: { name: 'NOT_STUBBED' } } }
    return Promise.resolve(
      new Response(JSON.stringify(hit.body), {
        status: hit.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

test('KST 오프셋을 UTC 로 옮긴다', () => {
  // 넥슨은 초가 없고 +09:00 이 붙은 값을 준다.
  assert.equal(toIso('2026-09-09T16:24+09:00'), '2026-09-09T07:24:00.000Z')
})

test('없는 날짜와 깨진 날짜는 null 이다', () => {
  assert.equal(toIso(null), null)
  assert.equal(toIso(''), null)
  assert.equal(toIso('어제'), null)
})

test('분류마다 다른 배열 키를 하나로 접는다', async () => {
  const client = new NexonClient(
    'k',
    stub({
      '/maplestory/v1/notice': {
        body: { notice: [{ title: '점검', url: 'https://x.test/1', notice_id: 149862, date: '2026-09-09T16:24+09:00' }] },
      },
      '/maplestory/v1/notice-cashshop': {
        body: {
          cashshop_notice: [
            { title: '캐시', url: 'https://x.test/2', notice_id: 642, date: '2026-08-20T08:14+09:00' },
          ],
        },
      },
    }),
  )

  assert.deepEqual(await client.list('game'), [
    { sourceId: 149862, title: '점검', url: 'https://x.test/1', publishedAt: '2026-09-09T07:24:00.000Z' },
  ])
  assert.equal((await client.list('cashshop'))[0]?.sourceId, 642)
})

test('계약을 어긴 항목만 버리고 나머지는 준다', async () => {
  const client = new NexonClient(
    'k',
    stub({
      '/maplestory/v1/notice': {
        body: {
          notice: [
            { title: '멀쩡', notice_id: 1, date: '2026-09-09T16:24+09:00' },
            { title: '날짜 없음', notice_id: 2 },
            { notice_id: 3, date: '2026-09-09T16:24+09:00' },
            { title: 'id 없음', date: '2026-09-09T16:24+09:00' },
          ],
        },
      },
    }),
  )

  const items = await client.list('game')

  assert.equal(items.length, 1)
  assert.equal(items[0]?.title, '멀쩡')
})

test('배열이 아니면 빈 목록이다', async () => {
  const client = new NexonClient('k', stub({ '/maplestory/v1/notice': { body: {} } }))

  assert.deepEqual(await client.list('game'), [])
})

const 목록항목 = {
  sourceId: 1374,
  title: '울티마 유물 탐사',
  url: 'https://maplestory.nexon.com/News/Event/1374',
  publishedAt: '2026-08-19T23:14:00.000Z',
}

test('상세에 없는 notice_id 를 목록에서 채운다', async () => {
  // 넥슨 상세 응답에는 notice_id 가 없다.
  const client = new NexonClient(
    'k',
    stub({
      '/maplestory/v1/notice-event/detail?notice_id=1374': {
        body: {
          title: '울티마 유물 탐사',
          url: 'https://maplestory.nexon.com/News/Event/1374',
          contents: '<div><img src="https://lwi.nexon.com/a.png"></div>',
          date: '2026-08-20T08:14+09:00',
          date_event_start: '2026-08-20T10:00+09:00',
          date_event_end: '2026-09-16T23:59+09:00',
        },
      },
    }),
  )

  const detail = await client.detail('event', 목록항목)

  assert.equal(detail?.sourceId, 1374)
  assert.equal(detail?.startsAt, '2026-08-20T01:00:00.000Z')
  assert.equal(detail?.endsAt, '2026-09-16T14:59:00.000Z')
})

test('캐시샵 판매 기간도 같은 두 필드로 온다', async () => {
  const client = new NexonClient(
    'k',
    stub({
      '/maplestory/v1/notice-cashshop/detail?notice_id=642': {
        body: {
          title: '마스터라벨 플러스',
          contents: '',
          date: '2026-08-20T08:14+09:00',
          date_sale_start: null,
          date_sale_end: null,
          ongoing_flag: 'true',
        },
      },
    }),
  )

  const detail = await client.detail('cashshop', { ...목록항목, sourceId: 642 })

  assert.equal(detail?.startsAt, null)
  assert.equal(detail?.ongoing, true)
})

// 이 400 은 고쳐지지 않는다. 목록에서 빠진 글은 다시 부른다고 오지 않는다.
test('목록에서 빠진 글은 null 이다', async () => {
  const client = new NexonClient(
    'k',
    stub({
      '/maplestory/v1/notice-event/detail?notice_id=1374': {
        status: 400,
        body: { error: { name: 'OPENAPI00004', message: 'Please input valid parameter' } },
      },
    }),
  )

  assert.equal(await client.detail('event', 목록항목), null)
})

// 429 와 5xx 는 다음 회차에 될 수도 있다. null 로 접으면 그것을 «없는 글» 로 읽는다.
test('400 이 아닌 실패는 던진다', async () => {
  const client = new NexonClient(
    'k',
    stub({
      '/maplestory/v1/notice-event/detail?notice_id=1374': {
        status: 429,
        body: { error: { name: 'OPENAPI00007' } },
      },
    }),
  )

  await assert.rejects(() => client.detail('event', 목록항목), /429/)
})
