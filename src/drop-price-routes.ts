/**
 * 드롭 가격 표본의 두 창구와 관리 화면(이슈 #610).
 *
 * ```
 * POST   /v1/drop-prices              ← 가격 한 건         → { ok: true }
 * DELETE /v1/drop-prices/{id}         ← 가격 빼기           → { ok: true }
 * DELETE /v1/me                       ← 탈퇴                 → { ok: true }
 * GET    /admin/drop-prices           → 화면 한 장
 * GET    /admin/drop-prices/rows      → { stats, recent }
 * ```
 *
 * **이 서버의 첫 쓰기 경로다.** 그래서 인증을 드는 첫 자리이고, `callerFor` 한 겹을 쓴다.
 *
 * `registerAuthRoutes` 와 같은 모양으로 갈라 둔다. `api.ts` 가 deps 를 받았을 때만 이 경로를
 * 열어, 표가 없는 배포에서도 서버가 선다.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { callerFor, type CallerDeps } from './caller.ts'
import {
  deleteDropPrice,
  parseDropPrice,
  saveDropPrice,
  type DropPriceDeps,
} from './drop-prices.ts'
import type { DropPriceEntry, DropPriceStat } from './db.ts'

/** 관리 화면에 한 번에 싣는 줄 수. 노이즈를 눈으로 짚는 용도라 이 정도면 넉넉하다. */
const STAT_LIMIT = 200
const RECENT_LIMIT = 100

export interface DropPriceRouteDeps extends CallerDeps, DropPriceDeps {
  listDropPriceStats: (limit: number) => Promise<DropPriceStat[]>
  listRecentDropPrices: (limit: number) => Promise<DropPriceEntry[]>
  /** 탈퇴 표시를 적는다. 행도 표본도 안 지운다. */
  deleteUser: (userId: string) => Promise<void>
  /** 그 사람의 세션 전부를 지운다. 자격 증명이라 이것만 예외로 지운다. */
  deleteSessionsOfUser: (userId: string) => Promise<void>
}

/** 캐시를 안 거는 답. 인증에 걸리는 것은 어디에도 안 남아야 한다. */
function json(reply: FastifyReply, status: number, body: unknown): FastifyReply {
  return reply.header('cache-control', 'no-store').code(status).send(body)
}

export function registerDropPriceRoutes(app: FastifyInstance, deps: DropPriceRouteDeps): void {
  /**
   * 가격 한 건을 적는다. 사용자가 가격을 넣거나 고쳐 저장하는 그 순간 앱이 부른다.
   *
   * **남의 기록이어도 `ok` 로 답한다.** 앱이 할 수 있는 일이 없어 다시 보내 봐야 같은 답이고,
   * 거절을 알려 주면 그 uuid 가 남의 것이라는 사실을 떠보는 길이 된다. 서버 로그에만 남긴다.
   */
  app.post('/v1/drop-prices', async (req: FastifyRequest, reply) => {
    const caller = await callerFor(deps, req.headers)
    if ('error' in caller) return json(reply, 401, { error: caller.error })

    const one = parseDropPrice(req.body)
    if (one === null) return json(reply, 400, { error: 'bad_request' })

    const outcome = await saveDropPrice(deps, caller.userId, one)
    if (outcome === 'not_mine') {
      app.log.warn({ dropRecordId: one.dropRecordId }, '남의 기록에 가격이 들어왔다')
    }
    return json(reply, 200, { ok: true })
  })

  /**
   * 가격을 뺀다. 기기에서 그 기록이 사라졌거나 기록 안함으로 바뀐 경우다.
   *
   * **줄을 지우지 않는다.** `deleted_at` 이 차고, 다시 적으면 그 칸이 `NULL` 로 돌아간다.
   * 없는 기록으로 불러도 성공으로 답한다 - 앱이 하려던 일은 이미 이뤄진 상태다.
   */
  app.delete<{ Params: { dropRecordId: string } }>(
    '/v1/drop-prices/:dropRecordId',
    async (req, reply) => {
      const caller = await callerFor(deps, req.headers)
      if ('error' in caller) return json(reply, 401, { error: caller.error })

      await deleteDropPrice(deps, caller.userId, req.params.dropRecordId)
      return json(reply, 200, { ok: true })
    },
  )

  /**
   * **탈퇴.** 앱의 `연결 해제` 가 부른다.
   *
   * **행을 지우지 않는다**(사용자 지정 2026-10-10). `users.deleted_at` 을 적고 **시세 표본은
   * 안 건드린다** - 시세 추이가 사람이 들어왔다 나갔다고 흔들리지 않아야 한다.
   *
   * **세션만 예외로 지운다.** 그 행은 기록이 아니라 살아 있는 자격 증명이라, 남기면 기기 둘에서
   * 로그인해 둔 사용자의 다른 쪽 토큰이 계속 먹는다.
   *
   * 같은 열쇠로 다시 오면 `users.ts` 가 표시를 지워 그 사람을 되살린다. 그래서 서버에서 보면
   * 탈퇴한 사람의 늦은 요청과 키를 다시 넣은 요청이 구별되지 않는다 - 앞쪽이 그 사람을 되살린다.
   *
   * 없는 사람으로 불러도 성공으로 답한다. 있고 없고를 알려 주면 해시를 떠보는 길이 된다.
   */
  app.delete('/v1/me', async (req: FastifyRequest, reply) => {
    const caller = await callerFor(deps, req.headers)
    if ('error' in caller) return json(reply, 401, { error: caller.error })

    await deps.deleteUser(caller.userId)
    await deps.deleteSessionsOfUser(caller.userId)
    return json(reply, 200, { ok: true })
  })

  app.get('/admin/drop-prices/rows', async (_req, reply) =>
    json(reply, 200, {
      stats: await deps.listDropPriceStats(STAT_LIMIT),
      recent: await deps.listRecentDropPrices(RECENT_LIMIT),
    }),
  )
}
