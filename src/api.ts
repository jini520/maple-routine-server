/**
 * 조회 API 와 운영자 창구. 계약은 앱 저장소의 결정 문서가 소유한다.
 *
 * ```
 * GET /v1/notices?limit=20&cursor=…&kind=game,update  → { items, nextCursor }
 * GET /v1/notices/{id}                                → Notice (blocks 포함)
 * GET /v1/sunday-maple?limit=20                       → { items: SundayRecord[] }
 * GET /v1/settlement                                  → { settling, startedAt }
 * GET /v1/manual-completion                           → { bosses }
 * ```
 *
 * **목록은 `blocks` 를 안 준다.** 업데이트 한 건이 블록 797개 · JSON 57KB라 20건에 실으면 한
 * 응답이 MB 단위가 된다. 상세에서만 온다.
 *
 * **`/v1` 에는 인증이 없다.** 공개 정보라서다. 대신 누구나 부를 수 있으므로 `limit` 에 상한을
 * 두고, 그 밖의 속도 제한은 앞단 nginx 가 건다.
 *
 * **DB 를 인자로 받는다.** 직접 import 하면 이 파일을 부르는 테스트가 전부 DB 를 요구해서,
 * 라우팅에 테스트가 하나도 못 붙는다. 고리들(`poll` · `schedule` · `settlement`)이 이미 쓰는
 * 모양과 같다.
 */
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply } from 'fastify'

import {
  handleCancelSchedule,
  handleCreate,
  handleDelete,
  handleList,
  handleManualCompletionClose,
  handleManualCompletionList,
  handleManualCompletionOpen,
  handleUpdate,
  isAuthorized,
} from './admin.ts'
import { registerAuthRoutes, type AuthDeps } from './auth-routes.ts'
import { registerFriendsProxy, type NexonFetch } from './friends-proxy.ts'
import { ADMIN_MANUAL_HTML } from './admin-manual-page.ts'
import { ADMIN_LIST_HTML } from './admin-list-page.ts'
import { ADMIN_HTML } from './admin-page.ts'
import type { getNotice, listEventRows, listNotices, listOpenManualCompletionBosses } from './db.ts'
import { isNoticeKind, sundayRecordsFrom, type NoticeKind } from './notice.ts'
import type { Settlement } from './settlement.ts'

/** 한 번에 주는 상한. 넘겨 부르면 이 값으로 깎는다. */
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

/**
 * 본문 상한. 넘으면 Fastify 가 413 으로 끊는다.
 *
 * 운영자 공지 하나가 아무리 길어도 이 정도면 넉넉하다. 상한이 없으면 메모리를 먹이는 길이 된다.
 */
const BODY_LIMIT_BYTES = 256 * 1024

const NOT_SETTLING: Settlement = { settling: false, startedAt: null }

/**
 * 이 파일이 DB 에서 읽는 것 전부. 진짜 구현은 `db.ts` 에 있고 테스트는 가짜를 넣는다.
 */
export interface ApiDeps {
  /** 결산 판정을 꺼내는 함수. 밤 고리가 소유하고 이 파일은 읽기만 한다. */
  settlement?: () => Settlement
  listNotices: typeof listNotices
  getNotice: typeof getNotice
  listEventRows: typeof listEventRows
  listOpenManualCompletionBosses: typeof listOpenManualCompletionBosses
  /** 넥슨 로그인. 안 주면 그 경로를 안 연다(키만 쓰는 배포에서 표가 없어도 선다). */
  auth?: AuthDeps
  /** 프렌즈 프록시가 넥슨을 부르는 함수. 테스트가 갈아끼운다. */
  nexonFetch?: NexonFetch
}

/**
 * 앱이 목록을 자주 연다. 짧게 캐시하면 같은 화면을 두 번 열 때 서버를 안 깨운다.
 */
function cached(reply: FastifyReply): FastifyReply {
  return reply.header('cache-control', 'public, max-age=60')
}

/** 캐시를 안 거는 응답. 값이 자주 갈리는 자리가 쓴다. */
function fresh(reply: FastifyReply): FastifyReply {
  return reply.header('cache-control', 'no-store')
}

/** 관리자 화면 한 장. 고친 화면이 다음 방문에 바로 서야 해서 캐시를 안 건다. */
function html(reply: FastifyReply, page: string): FastifyReply {
  return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(page)
}

/** `?limit=` 을 읽어 상한 안으로 깎는다. NaN 도 여기서 걸려 기본값으로 간다. */
function limitOf(raw: unknown): number {
  const n = Number(typeof raw === 'string' ? raw : DEFAULT_LIMIT)
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT) : DEFAULT_LIMIT
}

/**
 * `?kind=game,update` 를 분류 목록으로. 모르는 값은 버린다.
 *
 * 빈 목록이면 전 분류다. 앱이 켠 토글만 물어 올 수 있고, 아무 것도 안 주면 지금까지처럼 전부
 * 준다(옛 앱이 그 모양으로 부른다).
 */
function parseKinds(raw: unknown): NoticeKind[] {
  if (typeof raw !== 'string' || raw === '') return []
  return [...new Set(raw.split(',').map((one) => one.trim()))].filter(isNoticeKind)
}

interface ListQuery {
  limit?: string
  cursor?: string
  kind?: string
}

export function createApi(deps: ApiDeps): FastifyInstance {
  const settlement = deps.settlement ?? ((): Settlement => NOT_SETTLING)

  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    // 요청 로그가 없어서 사용자 수를 앞단 nginx 로그에서 UA 로 세고 있었다. 여기서 남기면
    // 서버가 자기 숫자를 든다. UA 와 IP 를 함께 적는 것은 그 계산에 둘 다 필요해서다.
    logger: {
      // 테스트가 `silent` 로 끈다. 운영에서 시끄러우면 이 값으로 줄인다.
      level: process.env.LOG_LEVEL ?? 'info',
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          ua: req.headers['user-agent'],
          // nginx 가 넣어 준다. 안 넣으면 보이는 IP 가 nginx 하나뿐이다.
          ip: req.headers['x-real-ip'] ?? req.ip,
        }),
      },
    },
  })

  /**
   * 관리자 경로를 라우팅보다 먼저 막는다. **없는 `/admin` 경로도 여기서 걸린다.**
   *
   * 앞단 nginx 가 `auth_basic` 으로 막고 토큰 헤더를 넣어 주며, 여기서 그 토큰을 한 번 더 본다.
   * nginx 설정이 깨져도 이쪽이 혼자 거부한다.
   */
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/admin')) return
    if (isAuthorized(req.headers)) return
    return fresh(reply).code(403).send({ error: 'forbidden' })
  })

  /**
   * 안 맞는 경로. **GET 이 아니면 405 다.**
   *
   * 이 서버의 `/v1` 은 전부 GET 이라, 다른 메서드로 온 것은 **없는 주소**가 아니라 **못 하는
   * 일**이다. 옛 라우터가 내던 답과 같게 둔다.
   */
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method === 'GET') return fresh(reply).code(404).send({ error: 'not_found' })
    return fresh(reply).code(405).send({ error: 'method_not_allowed' })
  })

  // 살아 있는지 묻는 자리. nginx 와 도커가 본다.
  app.get('/healthz', async (_req, reply) => cached(reply).send({ ok: true }))

  app.get<{ Querystring: ListQuery }>('/v1/notices', async (req, reply) =>
    cached(reply).send(
      await deps.listNotices(
        limitOf(req.query.limit),
        req.query.cursor ?? null,
        parseKinds(req.query.kind),
      ),
    ),
  )

  /**
   * 썬데이 메이플 기록. **넥슨이 안 들고 있는 것을 우리가 든다.**
   *
   * 썬데이는 일요일 하루만 `notice-event` 목록에 뜨고, 지나면 상세도 400 이라 지난 회차를
   * 받아 올 길이 없다. 폴러가 그날 잡아 둔 것이 유일한 사본이고 이 경로가 그것을 돌려준다.
   *
   * **목록인데 `blocks` 를 싣는다.** 다른 목록은 안 싣지만(업데이트 한 건이 57KB다) 썬데이
   * 본문은 이미지 한두 장이라 가볍고, 빼면 기록이 제목만 남아 볼 것이 없어진다.
   */
  app.get<{ Querystring: ListQuery }>('/v1/sunday-maple', async (req, reply) => {
    const items = sundayRecordsFrom(await deps.listEventRows()).slice(0, limitOf(req.query.limit))
    return cached(reply).send({ items })
  })

  /**
   * 넥슨이 지금 스케줄러 기록을 결산 중인가. 판정은 `settlement.ts` 의 밤 고리가 들고 있다.
   *
   * **`startedAt` 이 계약의 핵심이다.** 앱이 안내 줄을 닫을 때 이 값을 기억하고, 다음에 받은
   * 값이 같으면 안 세운다. 다음 날 밤이면 값이 달라 다시 선다.
   *
   * 캐시를 안 건다. 판정이 1분마다 갈리는데 60초 캐시를 두면 앱이 최대 2분 낡은 값을 본다.
   */
  app.get('/v1/settlement', async (_req, reply) => fresh(reply).send(settlement()))

  /**
   * 직접 완료를 열어 둔 보스. 앱은 today 진입과 보스 수익 진입에서 물어 간다.
   *
   * **보스 key 와 여는 날만 준다.** 난이도로는 안 가르고 닫는 날은 없다. 닫으면 목록에서 빠진다.
   * 그 날이 든 기간부터 열린다는 판정은 앱이 한다.
   *
   * 캐시를 안 건다. 운영자가 열거나 닫은 것이 그 다음 진입에 바로 닿아야 한다. 60초를 걸었더니
   * 열고 들어가도 닫힌 응답이 돌아와 단추가 안 섰다(시뮬레이터 실측).
   */
  app.get('/v1/manual-completion', async (_req, reply) =>
    fresh(reply).send({ bosses: await deps.listOpenManualCompletionBosses() }),
  )

  app.get<{ Params: { id: string } }>('/v1/notices/:id', async (req, reply) => {
    const notice = await deps.getNotice(req.params.id)
    if (notice === null) return fresh(reply).code(404).send({ error: 'not_found' })
    return cached(reply).send(notice)
  })

  if (deps.auth !== undefined) {
    registerAuthRoutes(app, deps.auth)
    registerFriendsProxy(app, deps.auth, deps.nexonFetch)
  }

  app.get('/admin', async (_req, reply) => html(reply, ADMIN_HTML))
  app.get('/admin/', async (_req, reply) => html(reply, ADMIN_HTML))
  app.get('/admin/list', async (_req, reply) => html(reply, ADMIN_LIST_HTML))
  app.get('/admin/manual-completion', async (_req, reply) => html(reply, ADMIN_MANUAL_HTML))
  app.get('/admin/manual-completion/rows', async (_req, reply) => handleManualCompletionList(reply))
  app.post('/admin/manual-completion', async (req, reply) =>
    handleManualCompletionOpen(req.body, reply),
  )
  app.delete<{ Params: { boss: string } }>('/admin/manual-completion/:boss', async (req, reply) =>
    handleManualCompletionClose(reply, req.params.boss),
  )

  app.get('/admin/notices', async (_req, reply) => handleList(reply))
  app.post('/admin/notices', async (req, reply) => handleCreate(req.body, reply))

  // 옛 라우터에서는 이 경로가 수정·삭제보다 **먼저** 와야 했다. 뒤에 두면 `/admin/notices/` 뒤를
  // 전부 id 로 읽어서 예약 취소가 공지 삭제로 들어갔다. 이제는 경로 모양이 달라 순서가 상관없다.
  app.delete<{ Params: { id: string } }>('/admin/notices/:id/schedule', async (req, reply) =>
    handleCancelSchedule(reply, req.params.id),
  )
  app.patch<{ Params: { id: string } }>('/admin/notices/:id', async (req, reply) =>
    handleUpdate(req.body, reply, req.params.id),
  )
  app.delete<{ Params: { id: string } }>('/admin/notices/:id', async (req, reply) =>
    handleDelete(reply, req.params.id),
  )

  /**
   * 실패 사유를 밖으로 안 흘린다. 안에서만 남긴다.
   *
   * **부른 쪽 잘못은 그대로 알린다.** 본문이 상한을 넘었거나 JSON 이 깨진 것은 고칠 수 있는
   * 쪽이 부른 쪽이라, 500 으로 덮으면 무엇이 잘못됐는지 못 본다. 이 코드들은 Fastify 가
   * 정한 것이라 우리 내부 사정을 안 담는다.
   */
  app.setErrorHandler(async (error: FastifyError, _req, reply) => {
    const status = error.statusCode ?? 500
    if (status >= 400 && status < 500) {
      return fresh(reply).code(status).send({ error: error.code ?? 'bad_request' })
    }
    app.log.error(error)
    return fresh(reply).code(500).send({ error: 'internal' })
  })

  return app
}
