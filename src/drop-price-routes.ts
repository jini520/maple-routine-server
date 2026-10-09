/**
 * 드롭 가격 표본의 두 창구와 관리 화면(이슈 #610).
 *
 * ```
 * POST   /v1/drop-prices              ← 가격 한 건         → { ok: true }
 * DELETE /v1/drop-prices/{id}         ← 거두기             → { ok: true }
 * DELETE /v1/me                       ← 내 자리 전부 지우기 → { ok: true }
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
  parseDropPrice,
  saveDropPrice,
  withdrawDropPrice,
  type DropPriceDeps,
} from './drop-prices.ts'
import type { DropPriceEntry, DropPriceStat } from './db.ts'

/** 관리 화면에 한 번에 싣는 줄 수. 노이즈를 눈으로 짚는 용도라 이 정도면 넉넉하다. */
const STAT_LIMIT = 200
const RECENT_LIMIT = 100

export interface DropPriceRouteDeps extends CallerDeps, DropPriceDeps {
  listDropPriceStats: (limit: number) => Promise<DropPriceStat[]>
  listRecentDropPrices: (limit: number) => Promise<DropPriceEntry[]>
  /** 사람 행을 지운다. 매달린 표본과 세션이 `CASCADE` 로 함께 사라진다. */
  deleteUser: (userId: string) => Promise<void>
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
   * 가격을 거둔다. 기기에서 그 기록이 사라졌거나 기록 안함으로 바뀐 경우다.
   *
   * **줄을 지우지 않는다.** 유효한 줄이 없는 상태가 거둔 것이고, 거둔 사실이 노이즈 관찰의
   * 재료다. 없는 기록으로 불러도 성공으로 답한다 - 앱이 하려던 일은 이미 이뤄진 상태다.
   */
  app.delete<{ Params: { dropRecordId: string } }>(
    '/v1/drop-prices/:dropRecordId',
    async (req, reply) => {
      const caller = await callerFor(deps, req.headers)
      if ('error' in caller) return json(reply, 401, { error: caller.error })

      const outcome = await withdrawDropPrice(deps, caller.userId, req.params.dropRecordId)
      if (outcome === 'not_mine') {
        app.log.warn({ dropRecordId: req.params.dropRecordId }, '남의 기록을 거두려 했다')
      }
      return json(reply, 200, { ok: true })
    },
  )

  /**
   * **서버에 있는 내 자리를 지운다.** 앱의 `연결 해제` 가 부르고, 삭제 요구권을 행사하는 자리다.
   *
   * 지우는 것은 `users` 행 하나이고 표본과 세션은 `CASCADE` 로 따라 사라진다. 거두기
   * (`superseded_at`)와 다르다 - 그쪽은 가격을 물린 것이고 이쪽은 흔적을 없애는 것이다.
   *
   * 없는 사람으로 불러도 성공으로 답한다. 앱이 하려던 일은 이미 이뤄진 상태이고, 있고 없고를
   * 알려 주면 해시를 떠보는 길이 된다. 키 해시로 부르면 `userForApiKey` 가 행을 만든 뒤 바로
   * 지우는데, 남는 것이 없으니 그대로 둔다.
   */
  app.delete('/v1/me', async (req: FastifyRequest, reply) => {
    const caller = await callerFor(deps, req.headers)
    if ('error' in caller) return json(reply, 401, { error: caller.error })

    await deps.deleteUser(caller.userId)
    return json(reply, 200, { ok: true })
  })

  app.get('/admin/drop-prices/rows', async (_req, reply) =>
    json(reply, 200, {
      stats: await deps.listDropPriceStats(STAT_LIMIT),
      recent: await deps.listRecentDropPrices(RECENT_LIMIT),
    }),
  )
}
