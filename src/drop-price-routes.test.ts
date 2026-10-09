// 드롭 가격 두 창구의 라우팅과 인증. 이 서버의 첫 쓰기 경로라, 여기서 막는 사고는 인증이
// 뚫리는 것과 남의 표본을 덮는 것이다.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import { createApi, type ApiDeps } from './api.ts'
import { KEY_HASH_HEADER } from './caller.ts'
import { SESSION_HEADER } from './auth-routes.ts'
import type { DropPriceRouteDeps } from './drop-price-routes.ts'
import type { Notice } from './notice.ts'

const ME = '11111111-1111-4111-8111-111111111111'
const SOMEONE = '22222222-2222-4222-8222-222222222222'
const RECORD = '33333333-3333-4333-8333-333333333333'
const HASH = createHash('sha256').update('어떤 키', 'utf8').digest('hex')

const 공지: Notice = {
  id: 'notice-20260916-120000',
  kind: 'app',
  title: '점검 안내',
  body: '점검합니다.',
  publishedAt: '2026-09-16T03:00:00.000Z',
}

function 본문(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dropRecordId: RECORD,
    itemKey: 'ring-restraint',
    priceMeso: 10_000_000_000,
    periodKey: '2026-10-15',
    worldKey: 'challengers_2',
    ringLevel: 4,
    slot: 'ring',
    ...over,
  }
}

function 가짜(over: Partial<DropPriceRouteDeps> = {}): {
  넣은것: unknown[]
  덮은것: unknown[]
  deps: ApiDeps
} {
  const 넣은것: unknown[] = []
  const 덮은것: unknown[] = []
  const dropPrices: DropPriceRouteDeps = {
    userIdForSession: async () => null,
    userIdForApiKey: async () => null,
    currentDropPrice: async () => null,
    supersedeDropPrice: async () => undefined,
    insertDropPrice: async () => undefined,
    listDropPriceStats: async () => [],
    listRecentDropPrices: async () => [],
    ...over,
  }
  return {
    넣은것,
    덮은것,
    deps: {
      listNotices: async () => ({ items: [공지], nextCursor: null }),
      getNotice: async () => 공지,
      listEventRows: async () => [],
      listOpenManualCompletionBosses: async () => [],
      dropPrices: {
        ...dropPrices,
        insertDropPrice: async (userId, one) => {
          넣은것.push({ userId, one })
          return dropPrices.insertDropPrice(userId, one)
        },
        supersedeDropPrice: async (dropRecordId) => {
          덮은것.push(dropRecordId)
          return dropPrices.supersedeDropPrice(dropRecordId)
        },
      },
    },
  }
}

process.env.LOG_LEVEL = 'silent'

const 원래토큰 = process.env.ADMIN_TOKEN

beforeEach(() => {
  process.env.ADMIN_TOKEN = '비밀'
})

afterEach(() => {
  if (원래토큰 === undefined) delete process.env.ADMIN_TOKEN
  else process.env.ADMIN_TOKEN = 원래토큰
})

test('열쇠가 없으면 401 이고 DB 를 안 건드린다', async () => {
  const 짝 = 가짜()
  const app = createApi(짝.deps)

  const res = await app.inject({ method: 'POST', url: '/v1/drop-prices', payload: 본문() })

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.json(), { error: 'unauthorized' })
  assert.deepEqual(짝.넣은것, [])
})

test('키 해시로 들어온 사람의 가격을 넣는다', async () => {
  const 짝 = 가짜({ userIdForApiKey: async () => ME })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/drop-prices',
    headers: { [KEY_HASH_HEADER]: HASH },
    payload: 본문(),
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { ok: true })
  assert.deepEqual(짝.넣은것, [
    {
      userId: ME,
      one: {
        dropRecordId: RECORD,
        itemKey: 'ring-restraint',
        priceMeso: 10_000_000_000,
        periodKey: '2026-10-15',
        worldKey: 'challengers_2',
        ringLevel: 4,
        slot: 'ring',
      },
    },
  ])
})

test('세션이 죽었으면 재로그인을 요구하고 키 해시로 안 넘어간다', async () => {
  // 넘어가면 그 사람의 기록이 두 열쇠로 갈라진다.
  const 짝 = 가짜({ userIdForApiKey: async () => SOMEONE })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/drop-prices',
    headers: { [SESSION_HEADER]: '죽은세션', [KEY_HASH_HEADER]: HASH },
    payload: 본문(),
  })

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.json(), { error: 'signin_required' })
  assert.deepEqual(짝.넣은것, [])
})

test('계약을 어긴 본문은 400 이다', async () => {
  const 짝 = 가짜({ userIdForApiKey: async () => ME })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/drop-prices',
    headers: { [KEY_HASH_HEADER]: HASH },
    payload: 본문({ priceMeso: -1 }),
  })

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.json(), { error: 'bad_request' })
  assert.deepEqual(짝.넣은것, [])
})

test('남의 기록이어도 ok 로 답하고 아무것도 안 넣는다', async () => {
  // 거절을 알려 주면 그 uuid 가 남의 것이라는 사실을 떠보는 길이 된다.
  const 짝 = 가짜({
    userIdForApiKey: async () => ME,
    currentDropPrice: async () => ({ userId: SOMEONE, priceMeso: 1 }),
  })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/drop-prices',
    headers: { [KEY_HASH_HEADER]: HASH },
    payload: 본문(),
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { ok: true })
  assert.deepEqual(짝.넣은것, [])
  assert.deepEqual(짝.덮은것, [])
})

test('거두기는 유효한 줄을 덮고 줄을 안 지운다', async () => {
  const 짝 = 가짜({
    userIdForApiKey: async () => ME,
    currentDropPrice: async () => ({ userId: ME, priceMeso: 1 }),
  })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'DELETE',
    url: `/v1/drop-prices/${RECORD}`,
    headers: { [KEY_HASH_HEADER]: HASH },
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(짝.덮은것, [RECORD])
})

test('거두기도 열쇠가 없으면 401 이다', async () => {
  const 짝 = 가짜({ currentDropPrice: async () => ({ userId: ME, priceMeso: 1 }) })
  const app = createApi(짝.deps)

  const res = await app.inject({ method: 'DELETE', url: `/v1/drop-prices/${RECORD}` })

  assert.equal(res.statusCode, 401)
  assert.deepEqual(짝.덮은것, [])
})

test('쓰기 응답은 캐시되지 않는다', async () => {
  const 짝 = 가짜({ userIdForApiKey: async () => ME })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/drop-prices',
    headers: { [KEY_HASH_HEADER]: HASH },
    payload: 본문(),
  })

  assert.equal(res.headers['cache-control'], 'no-store')
})

test('deps 를 안 주면 그 경로를 안 연다', async () => {
  // 표가 없는 배포에서도 서버가 선다. `auth` 와 같은 모양이다.
  const { dropPrices: _빼고, ...나머지 } = 가짜().deps
  const app = createApi(나머지)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/drop-prices',
    headers: { [KEY_HASH_HEADER]: HASH },
    payload: 본문(),
  })

  // 등록 안 된 주소에 POST 가 오면 그 주소에서 못 하는 일이다.
  assert.equal(res.statusCode, 405)
})

test('관리 화면과 그 자료는 토큰 없이는 막힌다', async () => {
  const app = createApi(가짜().deps)

  const 화면 = await app.inject({ method: 'GET', url: '/admin/drop-prices' })
  assert.equal(화면.statusCode, 403)

  const 자료 = await app.inject({ method: 'GET', url: '/admin/drop-prices/rows' })
  assert.equal(자료.statusCode, 403)
})

test('관리 화면의 자료는 분포와 최근 줄을 함께 준다', async () => {
  const 짝 = 가짜({
    listDropPriceStats: async () => [
      {
        itemKey: 'ring-restraint',
        samples: 3,
        people: 2,
        minMeso: 1,
        medianMeso: 2,
        maxMeso: 3,
        lastReceivedAt: new Date('2026-10-09T00:00:00Z'),
      },
    ],
    listRecentDropPrices: async () => [
      {
        itemKey: 'ring-restraint',
        priceMeso: 3,
        periodKey: '2026-10-15',
        worldKey: null,
        ringLevel: null,
        receivedAt: new Date('2026-10-09T00:00:00Z'),
        supersededAt: null,
      },
    ],
  })
  const app = createApi(짝.deps)

  const res = await app.inject({
    method: 'GET',
    url: '/admin/drop-prices/rows',
    headers: { 'x-admin-token': '비밀' },
  })

  assert.equal(res.statusCode, 200)
  const body = res.json() as { stats: unknown[]; recent: unknown[] }
  assert.equal(body.stats.length, 1)
  assert.equal(body.recent.length, 1)
})
