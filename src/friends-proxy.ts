/**
 * 프렌즈 API 를 **세션으로 대신 부르는 자리.**
 *
 * 앱은 넥슨 경로 문자열을 그대로 들고 앞에 붙일 주소만 가른다(앱 `nexon/http.ts`). 그래서 이
 * 프록시는 넥슨 경로를 그대로 비춘다.
 *
 * ```
 * GET /v1/nexon/maplestory/v1/character/list   →   open.api.nexon.com/maplestory/v1/character/list
 * ```
 *
 * **와일드카드로 안 연다.** `/v1/nexon/*` 를 통째로 열면 사용자 토큰으로 아무 넥슨 경로나
 * 부르는 문이 된다. 여는 것은 아래 표에 적힌 것뿐이고, 그 밖은 404 다.
 *
 * **키로 들어온 메이플 ID 는 여기로 안 온다.** 앱이 자기 API 키로 넥슨을 직접 부른다. 한 앱
 * 안에 전송 경로가 둘이고, 갈리는 자리는 앱의 `nexon/http.ts` 하나다.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'

import { resolveSession, SESSION_HEADER, type AuthDeps } from './auth-routes.ts'

/** 넥슨 공개 API 의 뿌리. `nexon.ts` 가 API 키로 부르는 곳과 같다. */
const NEXON_BASE = 'https://open.api.nexon.com'

/** 앞에 붙는 우리 주소. 이 뒤가 넥슨 경로 그대로다. */
const PROXY_PREFIX = '/v1/nexon'

/** 한 요청이 이만큼 넘게 걸리면 끊는다. 앱이 화면 앞에서 기다리는 자리다. */
const TIMEOUT_MS = 10_000

/**
 * 여는 경로. **Open ID 로 열리는 것이 이것뿐이다.**
 *
 * 넥슨 등록 화면에서 켠 활용 데이터 항목과 짝이 맞아야 한다. 여기를 늘리면서 등록을 안 켜면
 * 그 경로만 401 이 오고, 원인이 앱에서는 안 보인다.
 *
 * `user/achievement` 는 없다. 등록에서 메이플스토리 업적이 꺼져 있어 스코프를 안 받는다
 * (2026-09-26 확인). 쓰게 되면 등록을 먼저 켜고 여기 한 줄을 더한다.
 */
export const FRIENDS_PATHS: readonly string[] = [
  '/maplestory/v1/character/list',
  '/maplestory/v1/history/cube',
  '/maplestory/v1/history/starforce',
  '/maplestory/v1/history/potential',
  '/maplestory/v1/history/soul-potential',
  '/maplestory/v1/scheduler/character-state',
]

/** 테스트가 넥슨 대신 답하려고 갈아끼운다. */
export type NexonFetch = typeof fetch

/** 캐시를 안 거는 답. **사용자마다 다른 자료라 중간에 쌓이면 남의 것이 간다.** */
function fresh(reply: FastifyReply): FastifyReply {
  return reply.header('cache-control', 'no-store')
}

export function registerFriendsProxy(
  app: FastifyInstance,
  deps: AuthDeps,
  nexonFetch: NexonFetch = fetch,
): void {
  for (const path of FRIENDS_PATHS) {
    app.get(`${PROXY_PREFIX}${path}`, async (req, reply) => {
      const raw = req.headers[SESSION_HEADER]
      const session = await resolveSession(deps, typeof raw === 'string' ? raw.trim() : '')

      // 세션이 없거나 갱신 토큰까지 죽었다. **넥슨을 부르지 않는다.** 앱은 이것을 보고
      // 재로그인을 띄운다. 키 무효화와 다른 문구여야 해서 코드도 따로 둔다.
      if (session === null) return fresh(reply).code(401).send({ error: 'signin_required' })

      const query = req.url.slice(req.url.indexOf(path) + path.length)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        const res = await nexonFetch(`${NEXON_BASE}${path}${query}`, {
          // 프렌즈 API 는 이 헤더로 따로 문서화돼 있다. 서버의 API 키는 안 싣는다.
          headers: { authorization: `Bearer ${session.accessToken}` },
          signal: controller.signal,
        })
        const body: unknown = await res.json().catch(() => null)

        // 넥슨이 준 상태 코드를 그대로 넘긴다. 앱이 429 와 401 을 가려 다뤄야 하는데,
        // 전부 500 으로 덮으면 그 판단을 못 한다.
        return fresh(reply).code(res.status).send(body)
      } catch (error) {
        req.log.error(error, '[proxy] 넥슨 호출이 실패했다')
        return fresh(reply).code(502).send({ error: 'nexon_unreachable' })
      } finally {
        clearTimeout(timer)
      }
    })
  }
}
