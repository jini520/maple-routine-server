// 로그인 세 경로. 여기서 막는 사고는 남의 세션을 얻는 것이다.
//
// 안드로이드에서 콜백을 가로챈 앱은 code 와 state 를 갖는다. 검증값이 없어야 거절되고,
// 그 판정이 실제로 라우트까지 이어지는지를 본다.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import { createApi } from './api.ts'
import { SESSION_HEADER, type AuthDeps } from './auth-routes.ts'
import { hashSession, type LoginAttempt, type NexonTokens } from './nexon-oauth.ts'
import type { StoredSession } from './nexon-session.ts'

process.env.LOG_LEVEL = 'silent'
const 원래 = { ...process.env }

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('hex')
  process.env.NEXON_CLIENT_ID = '클라이언트id'
  process.env.NEXON_CLIENT_SECRET = '비밀'
  process.env.LOG_LEVEL = 'silent'
})

afterEach(() => {
  process.env = { ...원래 }
})

const 지금 = new Date('2026-09-26T12:00:00.000Z')

const 넥슨토큰: NexonTokens = {
  accessToken: '새액세스',
  refreshToken: '새갱신',
  accessExpiresAt: new Date('2026-09-26T12:30:00.000Z'),
}

/** DB 를 안 탄다. 무엇이 저장됐는지 남긴다. */
function 가짜인증(덮어쓸것: Partial<AuthDeps> = {}): {
  짝: LoginAttempt[]
  저장된세션: { sessionHash: Buffer; accessToken: string }[]
  지운세션: Buffer[]
  갱신된: Buffer[]
  deps: AuthDeps
} {
  const 짝: LoginAttempt[] = []
  const 저장된세션: { sessionHash: Buffer; accessToken: string }[] = []
  const 지운세션: Buffer[] = []
  const 갱신된: Buffer[] = []

  const deps: AuthDeps = {
    saveLoginAttempt: async (a) => {
      짝.push(a)
    },
    takeLoginAttempt: async (state, verifier) => {
      // 둘 다 맞을 때만 꺼내면서 지운다. 진짜 DB 도 한 문장으로 그렇게 한다.
      const i = 짝.findIndex((one) => one.state === state && one.verifier === verifier)
      return i === -1 ? null : (짝.splice(i, 1)[0] ?? null)
    },
    insertNexonSession: async (s) => {
      저장된세션.push({ sessionHash: s.sessionHash, accessToken: s.accessToken })
    },
    findNexonSession: async () => null,
    updateNexonTokens: async (h) => {
      갱신된.push(h)
    },
    deleteNexonSession: async (h) => {
      지운세션.push(h)
    },
    exchangeCode: async () => 넥슨토큰,
    refreshTokens: async () => 넥슨토큰,
    now: () => 지금,
    ...덮어쓸것,
  }

  return { 짝, 저장된세션, 지운세션, 갱신된, deps }
}

function 앱(auth: AuthDeps) {
  return createApi({
    listNotices: async () => ({ items: [], nextCursor: null }),
    getNotice: async () => null,
    listEventRows: async () => [],
    listOpenManualCompletionBosses: async () => [],
    auth,
  })
}

async function 로그인시작(app: ReturnType<typeof 앱>) {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/nexon/start' })
  return res.json() as { authorizeUrl: string; state: string; verifier: string }
}

test('로그인 시작이 authorize 주소와 검증값을 준다', async () => {
  const 가짜 = 가짜인증()
  const 받은것 = await 로그인시작(앱(가짜.deps))

  assert.ok(받은것.authorizeUrl.startsWith('https://openid.nexon.com/oauth2/authorize'))
  assert.ok(받은것.state.length >= 32)
  assert.ok(받은것.verifier.length >= 43)
  assert.equal(가짜.짝.length, 1, '짝을 저장해 둬야 교환 때 찾는다')
})

test('검증값이 맞으면 세션을 준다', async () => {
  const 가짜 = 가짜인증()
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: '받은code', state: 시작.state, verifier: 시작.verifier },
  })

  assert.equal(res.statusCode, 200)
  const { session } = res.json() as { session: string }
  assert.ok(session.length >= 32)
  assert.equal(가짜.저장된세션.length, 1)
  assert.deepEqual(가짜.저장된세션[0]?.sessionHash, hashSession(session), 'DB 에는 해시로 둔다')
  assert.equal(가짜.저장된세션[0]?.accessToken, '새액세스')
})

test('검증값이 틀리면 넥슨을 부르지도 않는다', async () => {
  // 가로챈 앱이 code 와 state 만 들고 오는 자리다.
  let 불렀나 = false
  const 가짜 = 가짜인증({
    exchangeCode: async () => {
      불렀나 = true
      return 넥슨토큰
    },
  })
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: '가로챈code', state: 시작.state, verifier: '지어낸검증값' },
  })

  assert.equal(res.statusCode, 400)
  assert.equal(불렀나, false, '검증값이 틀리면 넥슨에 요청조차 안 한다')
  assert.equal(가짜.저장된세션.length, 0)
})

test('검증값이 비어도 거절한다', async () => {
  const 가짜 = 가짜인증()
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: 'code', state: 시작.state, verifier: '' },
  })
  assert.equal(res.statusCode, 400)
})

test('같은 code 로 두 번 교환하면 뒤엣것이 거절된다', async () => {
  // 짝은 찾는 그 자리에서 지워진다. 가로챈 앱이 뒤늦게 같은 것을 들고 와도 못 쓴다.
  const 가짜 = 가짜인증()
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)
  const 본문 = { code: 'code', state: 시작.state, verifier: 시작.verifier }

  const 첫번째 = await app.inject({ method: 'POST', url: '/v1/auth/nexon/session', payload: 본문 })
  const 두번째 = await app.inject({ method: 'POST', url: '/v1/auth/nexon/session', payload: 본문 })

  assert.equal(첫번째.statusCode, 200)
  assert.equal(두번째.statusCode, 400)
  assert.equal(가짜.저장된세션.length, 1)
})

test('가로챈 앱이 먼저 찔러도 진짜 사용자의 로그인이 안 막힌다', async () => {
  // 실측에서 찾은 결함이다. state 만으로 짝을 지우면, 가로챈 앱이 아무 검증값이나 들고 먼저
  // 찔러 짝을 태워 버린다. 세션을 뺏기지는 않지만 그 사용자는 로그인이 막히고 원인도 안 보인다.
  const 가짜 = 가짜인증()
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)

  const 가로챈쪽 = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: '가로챈code', state: 시작.state, verifier: '지어낸값' },
  })
  assert.equal(가로챈쪽.statusCode, 400)

  const 진짜쪽 = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: '진짜code', state: 시작.state, verifier: 시작.verifier },
  })
  assert.equal(진짜쪽.statusCode, 200, '짝이 살아 있어야 진짜 사용자가 마저 쓴다')
  assert.equal(가짜.저장된세션.length, 1)
})

test('거절 사유를 응답에 안 싣는다', async () => {
  // 무엇이 틀렸는지 알려 주면 검증값을 맞혀 볼 때 힌트가 된다.
  const 가짜 = 가짜인증()
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: 'code', state: 시작.state, verifier: '틀린값' },
  })

  const 본문 = JSON.stringify(res.json())
  assert.equal(본문.includes('검증값'), false, `사유가 샜다: ${본문}`)
  assert.equal(본문.includes(시작.verifier), false)
})

test('code 나 state 가 없으면 400 이다', async () => {
  const app = 앱(가짜인증().deps)

  for (const payload of [{}, { code: 'a' }, { state: 'b' }]) {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/nexon/session', payload })
    assert.equal(res.statusCode, 400)
  }
})

test('넥슨 교환이 실패하면 502 이고 세션을 안 만든다', async () => {
  const 가짜 = 가짜인증({
    exchangeCode: async () => {
      throw new Error('넥슨이 거절했다')
    },
  })
  const app = 앱(가짜.deps)
  const 시작 = await 로그인시작(app)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/nexon/session',
    payload: { code: 'code', state: 시작.state, verifier: 시작.verifier },
  })

  assert.equal(res.statusCode, 502)
  assert.equal(가짜.저장된세션.length, 0)
})

test('연결 해제는 그 세션을 지운다', async () => {
  const 가짜 = 가짜인증()
  const app = 앱(가짜.deps)

  const res = await app.inject({
    method: 'DELETE',
    url: '/v1/auth/nexon/session',
    headers: { [SESSION_HEADER]: '어떤세션' },
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(가짜.지운세션[0], hashSession('어떤세션'))
})

test('없는 세션으로 해제해도 성공으로 답한다', async () => {
  // 있고 없고를 알려 주면 세션 값을 떠보는 길이 된다. 앱이 하려던 일은 이미 이뤄진 상태다.
  const app = 앱(가짜인증().deps)

  const res = await app.inject({ method: 'DELETE', url: '/v1/auth/nexon/session' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { ok: true })
})

test('로그인을 안 붙인 배포에서는 그 경로가 없다', async () => {
  // 키만 쓰는 서버가 표 없이도 서야 한다.
  const app = createApi({
    listNotices: async () => ({ items: [], nextCursor: null }),
    getNotice: async () => null,
    listEventRows: async () => [],
    listOpenManualCompletionBosses: async () => [],
  })

  const res = await app.inject({ method: 'POST', url: '/v1/auth/nexon/start' })
  // 이 서버의 `/v1` 은 전부 GET 이라 안 맞는 경로에 POST 가 오면 405 다. 요점은 200 이
  // 아니라는 것, 곧 세션이 안 나간다는 것이다.
  assert.equal(res.statusCode, 405)
})

// ── 세션 해석 ───────────────────────────────────────────────────────────

function 저장된세션(덮어쓸것: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionHash: hashSession('세션값'),
    nexonUid: null,
    accessToken: '옛액세스',
    accessExpiresAt: new Date('2026-09-26T12:20:00.000Z'),
    refreshToken: '옛갱신',
    refreshExpiresAt: new Date('2026-10-05T00:00:00.000Z'),
    ...덮어쓸것,
  }
}

test('액세스가 살아 있으면 갱신 없이 그대로 쓴다', async () => {
  const { resolveSession } = await import('./auth-routes.ts')
  const 가짜 = 가짜인증({ findNexonSession: async () => 저장된세션() })

  const 푼것 = await resolveSession(가짜.deps, '세션값')

  assert.equal(푼것?.accessToken, '옛액세스')
  assert.equal(가짜.갱신된.length, 0)
})

test('액세스가 곧 죽으면 갱신하고 새것을 쓴다', async () => {
  // 앱은 이것을 모른다. 세션 값은 그대로다.
  const { resolveSession } = await import('./auth-routes.ts')
  const 가짜 = 가짜인증({
    findNexonSession: async () => 저장된세션({ accessExpiresAt: new Date('2026-09-26T12:00:10.000Z') }),
  })

  const 푼것 = await resolveSession(가짜.deps, '세션값')

  assert.equal(푼것?.accessToken, '새액세스')
  assert.equal(가짜.갱신된.length, 1, '갱신한 토큰을 저장해 둬야 다음 요청이 안 부른다')
})

test('갱신 토큰까지 만료되면 행을 지우고 재로그인으로 답한다', async () => {
  const { resolveSession } = await import('./auth-routes.ts')
  const 가짜 = 가짜인증({
    findNexonSession: async () =>
      저장된세션({ refreshExpiresAt: new Date('2026-09-20T00:00:00.000Z') }),
  })

  assert.equal(await resolveSession(가짜.deps, '세션값'), null)
  assert.equal(가짜.지운세션.length, 1, '붙잡고 있을 이유가 없다')
})

test('넥슨이 갱신을 거절하면 세션을 접는다', async () => {
  const { resolveSession } = await import('./auth-routes.ts')
  const 가짜 = 가짜인증({
    findNexonSession: async () =>
      저장된세션({ accessExpiresAt: new Date('2026-09-26T11:00:00.000Z') }),
    refreshTokens: async () => {
      throw new Error('넥슨이 거절했다')
    },
  })

  assert.equal(await resolveSession(가짜.deps, '세션값'), null)
  assert.equal(가짜.지운세션.length, 1)
})

test('없는 세션과 빈 세션은 재로그인이다', async () => {
  const { resolveSession } = await import('./auth-routes.ts')
  const 가짜 = 가짜인증()

  assert.equal(await resolveSession(가짜.deps, ''), null)
  assert.equal(await resolveSession(가짜.deps, '모르는세션'), null)
  assert.equal(가짜.지운세션.length, 0, '없는 것을 지우러 가지 않는다')
})
