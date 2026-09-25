/**
 * 넥슨 로그인의 세 자리. 앱이 부르는 순서 그대로다.
 *
 * ```
 * POST   /v1/auth/nexon/start     → { authorizeUrl, state, verifier }
 * POST   /v1/auth/nexon/session   ← { code, state, verifier }   → { session }
 * DELETE /v1/auth/nexon/session   ← 헤더의 세션                 → { ok: true }
 * ```
 *
 * **검증값은 앱이 들고 있다가 교환 때 돌려준다.** 콜백 URL 에는 안 실린다. 안드로이드에서
 * 콜백을 가로챈 앱은 `code` 와 `state` 만 갖고 이 값이 없어, 교환을 요청해도 여기서 거절된다.
 *
 * **거절 사유는 응답에 안 싣는다.** 무엇이 틀렸는지 알려 주면 검증값을 맞혀 볼 때 힌트가 된다.
 * 사유는 서버 로그에만 남는다.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import {
  authorizeUrl,
  exchangeCode,
  hashSession,
  isPlatform,
  newAttempt,
  newSession,
  refreshTokens,
  verifyAttempt,
  REFRESH_TTL_MS,
  type LoginAttempt,
  type NexonTokens,
  type Platform,
} from './nexon-oauth.ts'
import { needsRefresh, sessionExpired, type StoredSession } from './nexon-session.ts'

/** 앱이 세션을 싣는 헤더. */
export const SESSION_HEADER = 'x-nexon-session'

/** 이 파일이 DB 에서 하는 일 전부. 테스트는 가짜를 넣는다. */
export interface AuthDeps {
  saveLoginAttempt: (attempt: LoginAttempt) => Promise<void>
  /** `state` 와 검증값이 둘 다 맞을 때만 꺼낸다. 틀리면 짝이 남아 진짜 사용자가 마저 쓴다. */
  takeLoginAttempt: (state: string, verifier: string) => Promise<LoginAttempt | null>
  insertNexonSession: (session: {
    sessionHash: Buffer
    platform: Platform
    nexonUid: string | null
    accessToken: string
    accessExpiresAt: Date
    refreshToken: string
    refreshExpiresAt: Date
  }) => Promise<void>
  findNexonSession: (sessionHash: Buffer) => Promise<StoredSession | null>
  updateNexonTokens: (
    sessionHash: Buffer,
    tokens: {
      accessToken: string
      accessExpiresAt: Date
      refreshToken: string
      refreshExpiresAt: Date
    },
  ) => Promise<void>
  deleteNexonSession: (sessionHash: Buffer) => Promise<void>
  /** 테스트가 넥슨 대신 답한다. */
  exchangeCode?: typeof exchangeCode
  refreshTokens?: typeof refreshTokens
  now?: () => Date
}

interface ExchangeBody {
  code?: unknown
  state?: unknown
  verifier?: unknown
}

interface StartBody {
  platform?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** 캐시를 안 거는 답. 인증에 걸리는 것은 어디에도 안 남아야 한다. */
function json(reply: FastifyReply, status: number, body: unknown): FastifyReply {
  return reply.header('cache-control', 'no-store').code(status).send(body)
}

/**
 * 앱이 보낸 세션으로 **넥슨을 부를 수 있는 상태**를 만든다. 갱신은 여기서 알아서 한다.
 *
 * 돌려주는 것은 살아 있는 액세스 토큰이거나 `null` 이다. `null` 은 **재로그인이 필요하다**는
 * 뜻이고, 세션이 없거나 갱신 토큰까지 만료된 경우다. 그때 행은 이미 지워져 있다.
 */
export async function resolveSession(
  deps: AuthDeps,
  sessionValue: string,
): Promise<StoredSession | null> {
  if (sessionValue === '') return null

  const now = (deps.now ?? (() => new Date()))()
  const hash = hashSession(sessionValue)
  const session = await deps.findNexonSession(hash)
  if (session === null) return null

  // 갱신 토큰까지 죽었다. 붙잡고 있을 이유가 없다.
  if (sessionExpired(session, now)) {
    await deps.deleteNexonSession(hash)
    return null
  }

  if (!needsRefresh(session, now)) return session

  const refresh = deps.refreshTokens ?? refreshTokens
  let fresh: NexonTokens
  try {
    // 세션을 만든 쌍으로 갱신한다. 다른 쌍으로 부르면 넥슨이 거절한다.
    fresh = await refresh(session.refreshToken, session.platform, fetch, now)
  } catch {
    // 넥슨이 갱신을 거절했다. 그 갱신 토큰으로는 다시 못 받으므로 세션을 접는다.
    await deps.deleteNexonSession(hash)
    return null
  }

  const refreshed = {
    accessToken: fresh.accessToken,
    accessExpiresAt: fresh.accessExpiresAt,
    refreshToken: fresh.refreshToken,
    // 넥슨이 갱신 토큰 수명을 따로 안 줘서 받은 시각부터 다시 잰다. 실제보다 길게 잡히면
    // 앱이 재로그인을 늦게 띄우고, 그때 사용자는 조회 실패를 먼저 본다.
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
  }
  await deps.updateNexonTokens(hash, refreshed)
  return { ...session, ...refreshed }
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const now = (): Date => (deps.now ?? (() => new Date()))()

  /**
   * 로그인 시작. 짝을 만들어 두고 앱에 준다.
   *
   * **검증값을 응답 본문으로 준다.** 앱이 들고 있다가 교환 때 돌려주는 값이고, 이 경로는
   * https 라 콜백 URL 과 달리 다른 앱이 볼 수 없다.
   */
  app.post('/v1/auth/nexon/start', async (req: FastifyRequest, reply) => {
    // 넥슨 애플리케이션이 플랫폼마다 따로 등록돼 client_id 와 secret 이 쌍으로 갈린다.
    // 어느 쌍으로 시작했는지를 짝에 적어 두고, 교환 때는 앱이 보낸 값이 아니라 그것을 쓴다.
    const platform = (req.body ?? {}) as StartBody
    if (!isPlatform(platform.platform)) {
      return json(reply, 400, { error: 'bad_request' })
    }

    const attempt = newAttempt(platform.platform, now())
    await deps.saveLoginAttempt(attempt)

    return json(reply, 200, {
      authorizeUrl: authorizeUrl(attempt.state, attempt.platform),
      state: attempt.state,
      verifier: attempt.verifier,
    })
  })

  /**
   * code 를 세션으로. **검증값이 맞을 때만 넥슨에 교환을 요청한다.**
   *
   * 짝은 찾는 그 자리에서 지워진다. 같은 `code` 로 두 번 들어와도 뒤엣것은 짝을 못 찾는다.
   */
  app.post('/v1/auth/nexon/session', async (req: FastifyRequest, reply) => {
    const body = (req.body ?? {}) as ExchangeBody
    const code = str(body.code)
    const state = str(body.state)
    const verifier = str(body.verifier)

    if (code === '' || state === '') {
      return json(reply, 400, { error: 'bad_request' })
    }

    const stored = await deps.takeLoginAttempt(state, verifier)
    const 거절 = verifyAttempt(stored, verifier, now())
    if (거절 !== null || stored === null) {
      req.log.warn({ 거절 }, '[auth] 교환을 거절했다')
      return json(reply, 400, { error: 'invalid_request' })
    }

    const exchange = deps.exchangeCode ?? exchangeCode
    let tokens: NexonTokens
    try {
      // 앱이 보낸 값이 아니라 짝에 적힌 쌍을 쓴다. 시작과 교환이 어긋나면 넥슨이 거절하고,
      // 그 실패는 사용자에게 `로그인이 안 된다` 로만 보인다.
      tokens = await exchange(code, stored.platform, fetch, now())
    } catch (error) {
      req.log.error(error, '[auth] 넥슨 교환이 실패했다')
      return json(reply, 502, { error: 'exchange_failed' })
    }

    const { session, sessionHash } = newSession()
    await deps.insertNexonSession({
      sessionHash,
      platform: stored.platform,
      // 넥슨이 사용자 식별자를 어디에 주는지 실측 전이다. 추측해서 채우지 않는다.
      nexonUid: null,
      accessToken: tokens.accessToken,
      accessExpiresAt: tokens.accessExpiresAt,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: new Date(now().getTime() + REFRESH_TTL_MS),
    })

    return json(reply, 200, { session })
  })

  /**
   * 연결 해제. **토큰도 함께 지운다.**
   *
   * 없는 세션으로 불러도 성공으로 답한다. 앱이 하려던 일(이 세션을 더 못 쓰게 하기)은 이미
   * 이뤄진 상태이고, 있고 없고를 알려 주면 세션 값을 떠보는 길이 된다.
   */
  app.delete('/v1/auth/nexon/session', async (req: FastifyRequest, reply) => {
    const raw = req.headers[SESSION_HEADER]
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value !== '') await deps.deleteNexonSession(hashSession(value))
    return json(reply, 200, { ok: true })
  })
}
