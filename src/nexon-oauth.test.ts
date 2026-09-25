// 넥슨 Open ID 로그인. 여기서 막는 사고는 남의 세션을 얻는 것이다.
//
// 안드로이드에서는 같은 스킴을 선언한 다른 앱이 콜백의 code 와 state 를 가로챌 수 있다.
// 넥슨이 안드로이드 등록에서 서명 해시를 안 받아 그것을 막아 주지 않는다. 가로챈 앱이 그 둘을
// 이 서버에 넘기면 사용자의 캐릭터 목록·확률 기록·스케줄러를 읽는다. 검증값이 그 길을 끊는다.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import {
  NEXON_AUTHORIZE_URL,
  NEXON_TOKEN_URL,
  authorizeUrl,
  hashSession,
  newAttempt,
  newSession,
  type LoginAttempt,
} from './nexon-oauth.ts'

const 원래 = { ...process.env }

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('hex')
  process.env.NEXON_IOS_CLIENT_ID = 'ios-클라이언트id'
  process.env.NEXON_IOS_CLIENT_SECRET = 'ios-비밀'
  process.env.NEXON_ANDROID_CLIENT_ID = 'android-클라이언트id'
  process.env.NEXON_ANDROID_CLIENT_SECRET = 'android-비밀'
})

afterEach(() => {
  process.env = { ...원래 }
})

test('로그인 시작은 state 와 검증값을 새로 만든다', () => {
  const a = newAttempt('ios')
  const b = newAttempt('ios')

  assert.notEqual(a.state, b.state, 'state 가 겹치면 짝이 덮인다')
  assert.notEqual(a.verifier, b.verifier)
})

test('state 와 검증값은 추측할 수 없을 만큼 길다', () => {
  // 짧으면 가로챈 앱이 검증값을 맞혀 볼 수 있다. 맞히면 검증값을 둔 의미가 없다.
  const { state, verifier } = newAttempt('ios')

  assert.ok(state.length >= 32, `state 가 짧다: ${state.length}`)
  assert.ok(verifier.length >= 43, `검증값이 짧다: ${verifier.length}`)
})

test('짝은 짧게 산다', () => {
  // 로그인 한 번이 끝날 만큼이면 된다. 길게 두면 가로챈 code 를 나중에 쓸 창이 넓어진다.
  const { createdAt, expiresAt } = newAttempt('ios')
  const 수명분 = (expiresAt.getTime() - createdAt.getTime()) / 60_000

  assert.ok(수명분 > 0 && 수명분 <= 15, `수명이 ${수명분}분이다`)
})

test('authorize 주소에 state 와 등록한 redirect 가 실린다', () => {
  const { state } = newAttempt('ios')
  const url = new URL(authorizeUrl(state, 'ios'))

  assert.equal(`${url.origin}${url.pathname}`, NEXON_AUTHORIZE_URL)
  assert.equal(url.searchParams.get('state'), state)
  assert.equal(url.searchParams.get('client_id'), 'ios-클라이언트id')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('redirect_uri'), 'com.mapleroutine.app://oauth/callback')
})

test('authorize 주소에 client_secret 이 안 실린다', () => {
  // 실리면 브라우저 주소창과 넥슨 로그에 남는다. 앱에 두지 않는 이유가 그대로 여기도 적용된다.
  const url = authorizeUrl(newAttempt('ios').state, 'ios')
  assert.equal(url.includes('ios-비밀'), false)
  assert.equal(url.includes('client_secret'), false)
})

test('등록 화면에서 켠 스코프만 요청한다', () => {
  // 넥슨 등록 화면에서 켠 것과 같아야 한다. 안 켠 것을 달라고 하면 거절된다.
  const scope = new URL(authorizeUrl(newAttempt('ios').state, 'ios')).searchParams.get('scope') ?? ''

  for (const 하나 of ['characterlist', 'cube', 'scheduler', 'soulpotential']) {
    assert.ok(scope.includes(하나), `스코프에 ${하나} 가 없다: ${scope}`)
  }
})

/** 짝 하나. 교환 판정에 넘기는 모양이다. */
function 짝(덮어쓸것: Partial<LoginAttempt> = {}): LoginAttempt {
  return { ...newAttempt('ios'), ...덮어쓸것 }
}

test('세션은 원본을 주고 DB 에는 해시로 둔다', () => {
  // DB 가 새도 그것으로 남의 세션을 쓸 수 없어야 한다.
  const { session, sessionHash } = newSession()

  assert.ok(session.length >= 32)
  assert.deepEqual(sessionHash, hashSession(session))
  assert.equal(sessionHash.includes(Buffer.from(session, 'utf8')), false, '해시에 원본이 비친다')
})

test('세션 원본이 다르면 해시도 다르다', () => {
  const a = newSession()
  const b = newSession()

  assert.notEqual(a.session, b.session)
  assert.notDeepEqual(a.sessionHash, b.sessionHash)
})

test('같은 세션 원본은 언제나 같은 해시다', () => {
  // 앱이 보낸 세션으로 행을 찾는 길이 이것 하나다.
  const { session, sessionHash } = newSession()
  assert.deepEqual(hashSession(session), sessionHash)
})

test('검증값이 다르면 교환을 안 한다', async () => {
  const { verifyAttempt } = await import('./nexon-oauth.ts')
  const 저장된 = 짝({ verifier: '진짜검증값' })

  assert.equal(verifyAttempt(저장된, '진짜검증값'), null, '맞으면 통과')
  assert.ok(verifyAttempt(저장된, '가짜검증값'), '다르면 거절')
  assert.ok(verifyAttempt(저장된, ''), '비어도 거절')
})

test('만료된 짝은 안 받는다', async () => {
  const { verifyAttempt } = await import('./nexon-oauth.ts')
  const 지난 = 짝({ verifier: 'v', expiresAt: new Date(Date.now() - 1000) })

  assert.ok(verifyAttempt(지난, 'v'), '수명이 지났으면 검증값이 맞아도 거절')
})

test('짝이 아예 없으면 거절한다', async () => {
  const { verifyAttempt } = await import('./nexon-oauth.ts')
  // 이미 쓴 짝이거나 우리가 안 만든 state 다. 둘 다 교환하면 안 된다.
  assert.ok(verifyAttempt(null, '아무값'))
})

/** 넥슨 대신 답한다. 무엇을 보냈는지 남겨 둔다. */
function 가짜넥슨(답: unknown, status = 200): {
  보낸것: { url?: string; body?: string; headers?: Record<string, string> }
  fetcher: typeof fetch
} {
  const 보낸것: { url?: string; body?: string; headers?: Record<string, string> } = {}
  const fetcher = (async (url: string, init?: RequestInit) => {
    보낸것.url = url
    보낸것.body = init?.body as string
    보낸것.headers = init?.headers as Record<string, string>
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => 답,
    }
  }) as unknown as typeof fetch
  return { 보낸것, fetcher }
}

const 넥슨답 = { access_token: '액세스', refresh_token: '갱신', expires_in: 1800 }

test('code 를 토큰으로 바꾼다', async () => {
  const { exchangeCode } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨(넥슨답)

  const 받은것 = await exchangeCode('받은code', 'ios', 넥슨.fetcher)

  assert.equal(받은것.accessToken, '액세스')
  assert.equal(받은것.refreshToken, '갱신')
  assert.equal(넥슨.보낸것.url, NEXON_TOKEN_URL)
})

test('교환에는 client_secret 과 등록한 redirect 를 보낸다', async () => {
  // redirect_uri 가 등록값과 다르면 넥슨이 거절한다. 커스텀 스킴 그대로 보낸다.
  const { exchangeCode } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨(넥슨답)

  await exchangeCode('받은code', 'ios', 넥슨.fetcher)
  const 보낸 = new URLSearchParams(넥슨.보낸것.body ?? '')

  assert.equal(보낸.get('grant_type'), 'authorization_code')
  assert.equal(보낸.get('code'), '받은code')
  assert.equal(보낸.get('client_secret'), 'ios-비밀')
  assert.equal(보낸.get('redirect_uri'), 'com.mapleroutine.app://oauth/callback')
})

test('액세스 토큰 만료 시각을 넥슨이 준 초로 잰다', async () => {
  // 30분이라고 우리가 박아 두면 넥슨이 바꿀 때 갱신이 늦거나 일찍 돈다.
  const { exchangeCode } = await import('./nexon-oauth.ts')
  const 지금 = new Date('2026-09-26T00:00:00.000Z')
  const 넥슨 = 가짜넥슨({ ...넥슨답, expires_in: 600 })

  const 받은것 = await exchangeCode('code', 'ios', 넥슨.fetcher, 지금)
  assert.equal(받은것.accessExpiresAt.toISOString(), '2026-09-26T00:10:00.000Z')
})

test('넥슨이 거절하면 던진다', async () => {
  // 조용히 빈 토큰을 저장하면 그 사용자는 영영 401 을 받고 원인이 안 보인다.
  const { exchangeCode } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨({ error: 'invalid_grant' }, 400)

  await assert.rejects(() => exchangeCode('이미쓴code', 'ios', 넥슨.fetcher))
})

test('토큰이 빠진 응답도 던진다', async () => {
  const { exchangeCode } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨({ expires_in: 1800 })

  await assert.rejects(() => exchangeCode('code', 'ios', 넥슨.fetcher))
})

test('갱신은 갱신 토큰으로 부른다', async () => {
  const { refreshTokens } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨(넥슨답)

  await refreshTokens('옛갱신토큰', 'ios', 넥슨.fetcher)
  const 보낸 = new URLSearchParams(넥슨.보낸것.body ?? '')

  assert.equal(보낸.get('grant_type'), 'refresh_token')
  assert.equal(보낸.get('refresh_token'), '옛갱신토큰')
})

test('갱신이 새 갱신 토큰을 안 주면 옛것을 그대로 쓴다', async () => {
  // 넥슨이 갱신 토큰을 돌려주는지 아직 실측 전이다. 안 주는데 빈 값으로 덮으면 그 사용자는
  // 다음 갱신에서 죽는다.
  const { refreshTokens } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨({ access_token: '새액세스', expires_in: 1800 })

  const 받은것 = await refreshTokens('옛갱신토큰', 'ios', 넥슨.fetcher)
  assert.equal(받은것.accessToken, '새액세스')
  assert.equal(받은것.refreshToken, '옛갱신토큰')
})

test('플랫폼마다 다른 자격 쌍을 쓴다', () => {
  // 넥슨 애플리케이션이 iOS 와 Android 로 따로 등록돼 client_id 와 secret 이 갈린다
  // (2026-09-26 등록 화면 확인). 한 쌍만 쓰면 한 플랫폼만 로그인이 된다.
  const ios = new URL(authorizeUrl('state1', 'ios'))
  const android = new URL(authorizeUrl('state2', 'android'))

  assert.equal(ios.searchParams.get('client_id'), 'ios-클라이언트id')
  assert.equal(android.searchParams.get('client_id'), 'android-클라이언트id')
})

test('교환도 그 플랫폼의 secret 을 쓴다', async () => {
  // 시작과 교환의 쌍이 어긋나면 넥슨이 거절한다.
  const { exchangeCode } = await import('./nexon-oauth.ts')
  const 넥슨 = 가짜넥슨(넥슨답)

  await exchangeCode('code', 'android', 넥슨.fetcher)
  const 보낸 = new URLSearchParams(넥슨.보낸것.body ?? '')

  assert.equal(보낸.get('client_id'), 'android-클라이언트id')
  assert.equal(보낸.get('client_secret'), 'android-비밀')
})

test('자격이 없는 플랫폼은 던진다', () => {
  // 한 쪽만 채운 배포에서 조용히 다른 쪽으로 새면, 그 사용자는 넥슨 거절만 보고 원인을 모른다.
  delete process.env.NEXON_ANDROID_CLIENT_ID
  assert.throws(() => authorizeUrl('state', 'android'), /NEXON_ANDROID_CLIENT_ID/)
})
