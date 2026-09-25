// 프렌즈 API 를 세션으로 대신 부르는 자리. 여기서 막는 사고는 둘이다.
//
// ① 열린 프록시가 되는 것. 경로를 와일드카드로 열면 아무 넥슨 경로나 사용자 토큰으로 부를 수
//    있다. 그래서 여는 경로를 표에 못박고 그 밖은 안 연다.
// ② 남의 자료를 받는 것. 세션이 없거나 죽었으면 넥슨을 부르지도 않는다.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import { createApi } from './api.ts'
import { SESSION_HEADER, type AuthDeps } from './auth-routes.ts'
import { FRIENDS_PATHS } from './friends-proxy.ts'
import { hashSession, type NexonTokens } from './nexon-oauth.ts'
import type { StoredSession } from './nexon-session.ts'

process.env.LOG_LEVEL = 'silent'
const 원래 = { ...process.env }

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('hex')
  process.env.NEXON_IOS_CLIENT_ID = 'ios-id'
  process.env.NEXON_IOS_CLIENT_SECRET = 'ios-secret'
  process.env.LOG_LEVEL = 'silent'
})

afterEach(() => {
  process.env = { ...원래 }
})

const 지금 = new Date('2026-09-26T12:00:00.000Z')

function 세션(덮어쓸것: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionHash: hashSession('내세션'),
    platform: 'ios',
    nexonUid: null,
    accessToken: '액세스토큰',
    accessExpiresAt: new Date('2026-09-26T12:20:00.000Z'),
    refreshToken: '갱신토큰',
    refreshExpiresAt: new Date('2026-10-05T00:00:00.000Z'),
    ...덮어쓸것,
  }
}

const 빈넥슨토큰: NexonTokens = {
  accessToken: '새액세스',
  refreshToken: '새갱신',
  accessExpiresAt: new Date('2026-09-26T12:30:00.000Z'),
  refreshExpiresAt: new Date('2026-10-10T12:00:00.000Z'),
}

interface 부른것 {
  url?: string
  headers?: Record<string, string>
}

/** 넥슨 대신 답한다. 무엇을 보냈는지 남긴다. */
function 가짜넥슨(답: unknown = { ok: true }, status = 200): { 본것: 부른것; fetcher: typeof fetch } {
  const 본것: 부른것 = {}
  const fetcher = (async (url: string, init?: RequestInit) => {
    본것.url = url
    본것.headers = init?.headers as Record<string, string>
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => 답,
    }
  }) as unknown as typeof fetch
  return { 본것, fetcher }
}

function 앱(옵션: { session?: StoredSession | null; fetcher?: typeof fetch } = {}) {
  const auth: AuthDeps = {
    saveLoginAttempt: async () => {},
    takeLoginAttempt: async () => null,
    insertNexonSession: async () => {},
    findNexonSession: async () => 옵션.session ?? null,
    updateNexonTokens: async () => {},
    deleteNexonSession: async () => {},
    exchangeCode: async () => 빈넥슨토큰,
    refreshTokens: async () => 빈넥슨토큰,
    now: () => 지금,
  }

  return createApi({
    listNotices: async () => ({ items: [], nextCursor: null }),
    getNotice: async () => null,
    listEventRows: async () => [],
    listOpenManualCompletionBosses: async () => [],
    auth,
    ...(옵션.fetcher === undefined ? {} : { nexonFetch: 옵션.fetcher }),
  })
}

test('여는 경로는 프렌즈 API 여섯뿐이다', () => {
  // 늘리려면 넥슨 등록의 활용 데이터 항목도 함께 켜야 한다. 그 둘이 어긋나면 401 이 온다.
  assert.deepEqual([...FRIENDS_PATHS].sort(), [
    '/maplestory/v1/character/list',
    '/maplestory/v1/history/cube',
    '/maplestory/v1/history/potential',
    '/maplestory/v1/history/soul-potential',
    '/maplestory/v1/history/starforce',
    '/maplestory/v1/scheduler/character-state',
  ])
})

test('세션으로 부르면 넥슨 경로를 그대로 비춘다', async () => {
  // 앱의 nexon/http.ts 가 경로 문자열을 그대로 들고 앞에 붙일 주소만 가른다.
  const 넥슨 = 가짜넥슨({ account_list: [] })
  const app = 앱({ session: 세션(), fetcher: 넥슨.fetcher })

  const res = await app.inject({
    method: 'GET',
    url: '/v1/nexon/maplestory/v1/character/list',
    headers: { [SESSION_HEADER]: '내세션' },
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { account_list: [] })
  assert.equal(넥슨.본것.url, 'https://open.api.nexon.com/maplestory/v1/character/list')
})

test('넥슨에는 Bearer 로 나가고 API 키는 안 실린다', async () => {
  // 프렌즈 API 는 Authorization: Bearer 로 따로 문서화돼 있다.
  const 넥슨 = 가짜넥슨()
  const app = 앱({ session: 세션(), fetcher: 넥슨.fetcher })

  await app.inject({
    method: 'GET',
    url: '/v1/nexon/maplestory/v1/character/list',
    headers: { [SESSION_HEADER]: '내세션' },
  })

  assert.equal(넥슨.본것.headers?.authorization, 'Bearer 액세스토큰')
  assert.equal(넥슨.본것.headers?.['x-nxopen-api-key'], undefined, '서버 키가 새면 안 된다')
})

test('물음표 뒤 값을 그대로 넘긴다', async () => {
  // 확률 기록이 날짜로, 스케줄러가 ocid 로 걸러 온다.
  const 넥슨 = 가짜넥슨()
  const app = 앱({ session: 세션(), fetcher: 넥슨.fetcher })

  await app.inject({
    method: 'GET',
    url: '/v1/nexon/maplestory/v1/history/cube?count=100&date=2026-09-25',
    headers: { [SESSION_HEADER]: '내세션' },
  })

  assert.equal(
    넥슨.본것.url,
    'https://open.api.nexon.com/maplestory/v1/history/cube?count=100&date=2026-09-25',
  )
})

test('세션이 없으면 넥슨을 부르지도 않는다', async () => {
  let 불렀나 = false
  const fetcher = (async () => {
    불렀나 = true
    return { ok: true, status: 200, json: async () => ({}) }
  }) as unknown as typeof fetch
  const app = 앱({ session: null, fetcher })

  const res = await app.inject({ method: 'GET', url: '/v1/nexon/maplestory/v1/character/list' })

  assert.equal(res.statusCode, 401)
  assert.equal(불렀나, false)
})

test('모르는 세션도 401 이다', async () => {
  const app = 앱({ session: null, fetcher: 가짜넥슨().fetcher })

  const res = await app.inject({
    method: 'GET',
    url: '/v1/nexon/maplestory/v1/character/list',
    headers: { [SESSION_HEADER]: '아무값' },
  })

  assert.equal(res.statusCode, 401)
  // 앱이 이것을 보고 재로그인을 띄운다. 키 무효화와는 다른 문구여야 한다.
  assert.deepEqual(res.json(), { error: 'signin_required' })
})

test('목록에 없는 넥슨 경로는 안 연다', async () => {
  // 와일드카드로 열면 사용자 토큰으로 아무 넥슨 경로나 부르는 문이 된다.
  const 넥슨 = 가짜넥슨()
  const app = 앱({ session: 세션(), fetcher: 넥슨.fetcher })

  for (const path of [
    '/v1/nexon/maplestory/v1/character/basic',
    '/v1/nexon/maplestory/v1/user/union-raider',
    '/v1/nexon/maplestory/v1/notice',
  ]) {
    const res = await app.inject({
      method: 'GET',
      url: path,
      headers: { [SESSION_HEADER]: '내세션' },
    })
    assert.equal(res.statusCode, 404, `${path} 가 열렸다`)
  }
  assert.equal(넥슨.본것.url, undefined, '안 여는 경로로는 넥슨을 안 부른다')
})

test('넥슨이 준 상태 코드를 그대로 넘긴다', async () => {
  // 앱이 429 와 401 을 가려 다뤄야 한다. 전부 500 으로 덮으면 그 판단을 못 한다.
  for (const status of [400, 429, 503]) {
    const app = 앱({ session: 세션(), fetcher: 가짜넥슨({ error: { name: 'X' } }, status).fetcher })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nexon/maplestory/v1/character/list',
      headers: { [SESSION_HEADER]: '내세션' },
    })
    assert.equal(res.statusCode, status)
  }
})

test('프록시 응답은 캐시를 안 건다', async () => {
  // 사용자마다 다른 자료다. 앞단이나 중간에서 캐시되면 남의 것이 간다.
  const app = 앱({ session: 세션(), fetcher: 가짜넥슨().fetcher })

  const res = await app.inject({
    method: 'GET',
    url: '/v1/nexon/maplestory/v1/character/list',
    headers: { [SESSION_HEADER]: '내세션' },
  })

  assert.equal(res.headers['cache-control'], 'no-store')
})

test('액세스가 죽어 가면 갱신한 토큰으로 부른다', async () => {
  const 넥슨 = 가짜넥슨()
  const app = 앱({
    session: 세션({ accessExpiresAt: new Date('2026-09-26T12:00:10.000Z') }),
    fetcher: 넥슨.fetcher,
  })

  await app.inject({
    method: 'GET',
    url: '/v1/nexon/maplestory/v1/character/list',
    headers: { [SESSION_HEADER]: '내세션' },
  })

  assert.equal(넥슨.본것.headers?.authorization, 'Bearer 새액세스')
})

test('로그인을 안 붙인 배포에는 프록시가 없다', async () => {
  const app = createApi({
    listNotices: async () => ({ items: [], nextCursor: null }),
    getNotice: async () => null,
    listEventRows: async () => [],
    listOpenManualCompletionBosses: async () => [],
  })

  const res = await app.inject({ method: 'GET', url: '/v1/nexon/maplestory/v1/character/list' })
  assert.equal(res.statusCode, 404)
})
