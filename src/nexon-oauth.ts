/**
 * 넥슨 Open ID 로그인. **토큰을 드는 쪽이 이 서버다.**
 *
 * 토큰 교환이 `client_secret` 을 필수로 받고 네이티브 앱용 대안인 PKCE 는 규격에 없다. 앱
 * 번들에 넣으면 그대로 뜯기므로 교환은 여기서 한다. 앱이 받는 것은 이 서버가 발급한 세션 하나다.
 *
 * ```
 * 앱      로그인 시작을 요청한다. 서버가 state 와 검증값을 만들어 짝지어 두고 앱에 준다
 * 앱      인증 세션으로 openid.nexon.com/oauth2/authorize 를 연다 (state)
 * 넥슨    로그인 · 동의
 * 넥슨    com.mapleroutine.app://oauth/callback?code=&state=   앱에 돌려준다
 * 앱      state 가 받은 값과 같은지 확인하고 code · state · 검증값을 서버에 넘긴다
 * 서버    검증값이 맞을 때만 교환해 보관하고 세션을 응답으로 준다
 * ```
 *
 * **검증값이 필요한 것은 안드로이드 때문이다.** 넥슨이 안드로이드 등록에서 서명 해시를 안 받아,
 * 같은 스킴을 선언한 다른 앱이 콜백의 code 와 state 를 가로챌 수 있다. 검증값은 콜백 URL 에
 * 안 실리고 앱과 서버 사이 https 로만 오간다. 가로챈 앱에는 그 값이 없다.
 *
 * **앱이 아니라 서버가 만드는 것은** 앱의 Hermes 에 `crypto` 가 없어서다.
 */
import { createHash, randomBytes } from 'node:crypto'

/** 넥슨이 로그인 창을 여는 자리. */
export const NEXON_AUTHORIZE_URL = 'https://openid.nexon.com/oauth2/authorize'

/** code 를 토큰으로 바꾸는 자리. `client_secret` 이 여기로만 나간다. */
export const NEXON_TOKEN_URL = 'https://openid.nexon.com/oauth2/token'

/** 로그인한 사용자가 누구인지 묻는 자리. 넥슨 문서에 없지만 실재한다(실측 2026-09-26). */
export const NEXON_USERINFO_URL = 'https://openid.nexon.com/oauth2/userinfo'

/**
 * 넥슨에 등록한 redirect URI. **두 플랫폼 모두 앱의 커스텀 스킴이다.**
 *
 * 등록 화면이 iOS 와 안드로이드를 받아서 https 콜백이 필요 없다. 그래서 **넥슨이 이 서버를
 * 부르는 일이 없다.**
 */
export const REDIRECT_URI = 'com.mapleroutine.app://oauth/callback'

/**
 * 앱이 로그인하는 플랫폼. **넥슨 애플리케이션이 플랫폼마다 따로 등록된다.**
 *
 * iOS 는 Bundle ID 를, Android 는 Package Name 을 받고 **`client_id` 와 secret 이 쌍으로 갈린다**
 * (2026-09-26 등록 화면 확인). 그래서 서버가 요청마다 어느 쌍을 쓸지 골라야 한다.
 */
export type Platform = 'ios' | 'android'

export function isPlatform(value: unknown): value is Platform {
  return value === 'ios' || value === 'android'
}

/**
 * 받는 스코프. **넥슨 등록 화면에서 켠 것과 정확히 같아야 한다.**
 *
 * 안 켠 스코프를 달라고 하면 넥슨이 거절한다. 지금 켜져 있는 것이 이 여섯이고, 두 플랫폼이
 * 같다(2026-09-26 확인). `maplestory.achievement` 는 꺼져 있어 여기 없다. 앱이 그것을 쓰게
 * 되면 등록 화면에서 먼저 켜고 여기 한 줄을 더한다.
 *
 * 이 여섯이 Open ID 로 열리는 전부다. 앱이 쓰는 나머지(`character/basic` 계열)는 이 목록에
 * 없고 API 키를 요구한다. 그래서 로그인이 키를 대체하지 못한다.
 */
export const SCOPES = [
  'maplestory.characterlist',
  'maplestory.starforce',
  'maplestory.potential',
  'maplestory.scheduler',
  'maplestory.cube',
  'maplestory.soulpotential',
] as const

/**
 * 짝이 사는 시간. **로그인 한 번이 끝날 만큼이면 된다.**
 *
 * 길게 두면 가로챈 code 를 나중에 쓸 창이 그만큼 넓어진다. 사용자가 넥슨 로그인 화면에서
 * 아이디와 비밀번호를 넣고 동의까지 누르는 시간을 넉넉히 덮는다.
 */
const ATTEMPT_TTL_MS = 10 * 60 * 1000

/** 로그인 시작과 code 교환 사이를 잇는 짝. */
export interface LoginAttempt {
  /** 넥슨에 넘기고 콜백으로 돌아오는 값. */
  state: string
  /** 콜백 URL 에 안 실린다. 앱과 서버 사이 https 로만 오간다. */
  verifier: string
  /**
   * 어느 쌍으로 시작했나. **교환도 같은 쌍을 써야 한다.**
   *
   * 앱이 교환에서 보낸 값을 안 믿고 여기 적힌 것을 쓴다. 시작과 교환의 쌍이 어긋나면
   * 넥슨이 거절하는데, 그 실패는 사용자에게 `로그인이 안 된다` 로만 보인다.
   */
  platform: Platform
  createdAt: Date
  expiresAt: Date
}

/** 새 짝. 로그인 시작 요청마다 하나씩 만든다. */
export function newAttempt(platform: Platform, now: Date = new Date()): LoginAttempt {
  return {
    state: randomBytes(24).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    platform,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ATTEMPT_TTL_MS),
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} 이 없다`)
  return value
}

/** 그 플랫폼의 넥슨 자격 한 쌍. 이름을 여기 한 자리에 모은다. */
function credentials(platform: Platform): { clientId: string; clientSecret: string } {
  const prefix = platform === 'ios' ? 'NEXON_IOS' : 'NEXON_ANDROID'
  return {
    clientId: required(`${prefix}_CLIENT_ID`),
    clientSecret: required(`${prefix}_CLIENT_SECRET`),
  }
}

/**
 * 앱이 열 주소. **`client_secret` 은 안 싣는다.**
 *
 * 실으면 브라우저 주소창과 넥슨 로그에 남는다. 앱 번들에 안 두는 이유가 그대로 여기도 걸린다.
 */
export function authorizeUrl(state: string, platform: Platform): string {
  const url = new URL(NEXON_AUTHORIZE_URL)
  url.searchParams.set('client_id', credentials(platform).clientId)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  // **콤마로 잇는다.** 표준 OAuth2 는 공백이지만 넥슨은 콤마를 받는다. 공백으로 보내면
  // `유효하지 않은 요청입니다` 로 거절한다(실측 2026-09-26). 넥슨이 등록 화면에서 만들어
  // 주는 주소도 콤마다.
  url.searchParams.set('scope', SCOPES.join(','))
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * 교환해도 되는가. **되면 `null`, 안 되면 거절 사유.**
 *
 * 사유를 돌려주는 것은 서버 로그에 남기기 위해서다. 응답 본문에는 안 싣는다. 무엇이 틀렸는지
 * 알려 주면 가로챈 앱이 검증값을 맞혀 볼 때 힌트가 된다.
 *
 * @param stored `state` 로 찾은 짝. 없으면 `null`
 * @param verifier 앱이 보낸 검증값
 */
export function verifyAttempt(
  stored: LoginAttempt | null,
  verifier: string,
  now: Date = new Date(),
): string | null {
  // 이미 쓴 짝이거나 우리가 안 만든 state 다.
  if (stored === null) return '짝이 없다'
  if (stored.expiresAt.getTime() <= now.getTime()) return '짝의 수명이 지났다'
  if (verifier === '' || verifier !== stored.verifier) return '검증값이 다르다'
  return null
}

/** 앱에 주는 세션과 DB 에 둘 해시. */
export interface NewSession {
  /** 앱이 받는 값. 서버는 이것을 저장하지 않는다. */
  session: string
  /** DB 에 두는 값. 새도 이것으로 남의 세션을 쓸 수 없다. */
  sessionHash: Buffer
}

/**
 * 세션 해시. 앱이 보낸 원본으로 행을 찾는 길이 이것 하나다.
 *
 * 비밀번호가 아니라 **추측할 수 없는 난수**라 느린 해시를 쓸 이유가 없다. 사전 공격의 대상이
 * 아니고, 요청마다 한 번 도는 자리라 빠른 쪽이 맞다.
 */
export function hashSession(session: string): Buffer {
  return createHash('sha256').update(session, 'utf8').digest()
}

export function newSession(): NewSession {
  const session = randomBytes(32).toString('base64url')
  return { session, sessionHash: hashSession(session) }
}

/** 테스트가 넥슨 대신 답하려고 갈아끼운다. `nexon.ts` 의 `Fetcher` 와 같은 뜻이다. */
type Fetcher = typeof fetch

/** 한 요청이 이만큼 넘게 걸리면 끊는다. 사용자가 로그인 버튼 앞에서 기다리는 자리다. */
const TOKEN_TIMEOUT_MS = 10_000

/**
 * 넥슨이 준 토큰 한 벌. 저장하기 직전의 모양이다.
 *
 * **이 응답에는 사용자 식별자가 없다.** 실측(2026-09-26)에서 키는 `token_type` ·
 * `access_token` · `expires_in` · `refresh_token` · `refresh_token_expires_in` 다섯뿐이고
 * `id_token` 도 없다. 식별자는 `fetchUserInfo` 가 따로 받아 온다.
 */
export interface NexonTokens {
  accessToken: string
  refreshToken: string
  /** 넥슨이 준 `expires_in` 으로 잰다. 30분이라고 박아 두지 않는다. */
  accessExpiresAt: Date
  /** 넥슨이 준 `refresh_token_expires_in` 으로 잰다. 안 오면 `REFRESH_TTL_MS`. */
  refreshExpiresAt: Date
}

interface TokenWire {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  refresh_token_expires_in?: unknown
}

/**
 * 넥슨이 갱신 토큰 수명을 안 줄 때만 쓰는 값. **문서상 14일이다.**
 *
 * 실측(2026-09-26)에서 넥슨은 `refresh_token_expires_in` 을 준다. 그래서 이 값은 그것이
 * 빠졌을 때의 대비일 뿐이다. 실제보다 길게 잡히면 앱이 재로그인을 늦게 띄우고, 그때 사용자는
 * 조회 실패를 먼저 본다.
 */
export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000

async function postToken(body: URLSearchParams, fetcher: Fetcher, now: Date): Promise<NexonTokens> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS)

  try {
    const res = await fetcher(NEXON_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
    const wire = (await res.json().catch(() => null)) as TokenWire | null

    // 사유를 밖으로 안 흘린다. 넥슨이 준 문구에 우리 설정이 비칠 수 있다.
    if (!res.ok) throw new Error(`넥슨 토큰 교환이 거절됐다 (status: ${res.status})`)

    const accessToken = typeof wire?.access_token === 'string' ? wire.access_token : ''
    if (accessToken === '') throw new Error('넥슨 응답에 액세스 토큰이 없다')

    const seconds = typeof wire?.expires_in === 'number' ? wire.expires_in : 1800
    const refreshSeconds =
      typeof wire?.refresh_token_expires_in === 'number'
        ? wire.refresh_token_expires_in * 1000
        : REFRESH_TTL_MS
    return {
      accessToken,
      refreshToken: typeof wire?.refresh_token === 'string' ? wire.refresh_token : '',
      accessExpiresAt: new Date(now.getTime() + seconds * 1000),
      refreshExpiresAt: new Date(now.getTime() + refreshSeconds),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 콜백으로 받은 `code` 를 토큰으로 바꾼다. **`client_secret` 이 여기로만 나간다.**
 *
 * `redirect_uri` 는 등록값을 그대로 보낸다. 다르면 넥슨이 거절한다.
 */
export async function exchangeCode(
  code: string,
  platform: Platform,
  fetcher: Fetcher = fetch,
  now: Date = new Date(),
): Promise<NexonTokens> {
  const { clientId, clientSecret } = credentials(platform)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: REDIRECT_URI,
  })

  const tokens = await postToken(body, fetcher, now)
  // 교환에서는 갱신 토큰이 반드시 와야 한다. 없으면 30분 뒤 그 세션이 죽는다.
  if (tokens.refreshToken === '') throw new Error('넥슨 응답에 갱신 토큰이 없다')
  return tokens
}

/**
 * 액세스 토큰을 다시 받는다. 갱신은 서버가 알아서 하고 앱은 모른다.
 *
 * **새 갱신 토큰이 안 오면 옛것을 그대로 쓴다.** 넥슨이 갱신 토큰을 돌려주는지 아직 실측 전이고,
 * 안 주는데 빈 값으로 덮으면 그 사용자는 다음 갱신에서 죽는다.
 */
export async function refreshTokens(
  refreshToken: string,
  platform: Platform,
  fetcher: Fetcher = fetch,
  now: Date = new Date(),
): Promise<NexonTokens> {
  const { clientId, clientSecret } = credentials(platform)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  const tokens = await postToken(body, fetcher, now)
  return tokens.refreshToken === '' ? { ...tokens, refreshToken } : tokens
}

/** `userinfo` 가 주는 것. **`uid` 가 사용자 식별자다.** */
export interface NexonUserInfo {
  uid: string
  scope: readonly string[]
}

interface UserInfoWire {
  result?: { uid?: unknown; scope?: unknown }
}

/**
 * 로그인한 사용자가 누구인지 묻는다.
 *
 * **문서에 안 적혀 있지만 실재한다**(실측 2026-09-26). 토큰 응답에는 식별자가 없고 `id_token`
 * 도 없어서 한때 **넥슨은 식별자를 안 준다** 고 적었는데, 표준 위치인 이 경로를 찔러 보니
 * `{ result: { uid, scope } }` 를 준다.
 *
 * `uid` 는 code 문자열 안에 보이는 숫자와 **다른 값**이다. 그쪽은 계약이 아니므로 쓰지 않는다.
 *
 * 실패해도 던지지 않고 `null` 이다. **로그인 자체는 uid 없이도 돌아야 한다** - 세션을 찾는
 * 열쇠는 세션 해시이고, uid 는 같은 사람을 알아보는 데만 쓴다.
 */
export async function fetchUserInfo(
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<NexonUserInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS)

  try {
    const res = await fetcher(NEXON_USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    if (!res.ok) return null

    const wire = (await res.json().catch(() => null)) as UserInfoWire | null
    const uid = wire?.result?.uid
    if (typeof uid !== 'string' || uid === '') return null

    const scope = wire?.result?.scope
    return { uid, scope: Array.isArray(scope) ? scope.filter((s) => typeof s === 'string') : [] }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
