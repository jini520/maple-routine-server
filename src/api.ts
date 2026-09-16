/**
 * 조회 API 둘. 계약은 앱 저장소의 결정 문서가 소유한다.
 *
 * ```
 * GET /v1/notices?limit=20&cursor=…&kind=game,update  → { items, nextCursor }
 * GET /v1/notices/{id}                                → Notice (blocks 포함)
 * GET /v1/sunday-maple?limit=20                       → { items: SundayRecord[] }
 * GET /v1/settlement                                  → { settling, startedAt }
 * ```
 *
 * **목록은 `blocks` 를 안 준다.** 업데이트 한 건이 블록 797개 · JSON 57KB라 20건에 실으면 한
 * 응답이 MB 단위가 된다. 상세에서만 온다.
 *
 * **인증이 없다.** 공개 정보라서다. 대신 누구나 부를 수 있으므로 `limit` 에 상한을 두고,
 * 그 밖의 속도 제한은 앞단 nginx 가 건다.
 *
 * 프레임워크를 안 쓴다. 경로가 둘뿐이고, 이 저장소는 public 이며 집 기계에서 도는 서버라
 * 의존성 하나가 곧 감사해야 할 표면이다.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { adminNoticeId, handleCreate, handleDelete, handleList, handleUpdate, isAuthorized } from './admin.ts'
import { ADMIN_LIST_HTML } from './admin-list-page.ts'
import { ADMIN_HTML } from './admin-page.ts'
import { getNotice, listEventRows, listNotices } from './db.ts'
import { isNoticeKind, sundayRecordsFrom, type NoticeKind } from './notice.ts'
import type { Settlement } from './settlement.ts'

/** 한 번에 주는 상한. 넘겨 부르면 이 값으로 깎는다. */
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

const NOT_SETTLING: Settlement = { settling: false, startedAt: null }

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    // 앱이 목록을 자주 연다. 짧게 캐시하면 같은 화면을 두 번 열 때 서버를 안 깨운다.
    'cache-control': 'public, max-age=60',
  })
  res.end(json)
}

/** 관리자 화면 한 장. 캐시를 안 건다. 고친 화면이 다음 방문에 바로 서야 한다. */
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(html)
}

/** 캐시를 안 거는 응답. 값이 자주 갈리는 자리가 쓴다. */
function sendFresh(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
  })
  res.end(json)
}

/**
 * `?kind=game,update` 를 분류 목록으로. 모르는 값은 버린다.
 *
 * 빈 목록이면 전 분류다. 앱이 켠 토글만 물어 올 수 있고, 아무 것도 안 주면 지금까지처럼 전부
 * 준다(옛 앱이 그 모양으로 부른다).
 */
function parseKinds(url: URL): NoticeKind[] {
  const raw = url.searchParams.get('kind')
  if (raw === null || raw === '') return []

  return [...new Set(raw.split(',').map((one) => one.trim()))].filter(isNoticeKind)
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  settlement: () => Settlement,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')

  // 관리자 경로가 먼저다. 앞단 nginx 가 auth_basic 으로 막고 토큰 헤더를 넣어 주며,
  // 여기서 그 토큰을 한 번 더 본다. nginx 설정이 깨져도 이쪽이 혼자 거부한다.
  if (url.pathname.startsWith('/admin')) {
    if (!isAuthorized(req)) {
      send(res, 403, { error: 'forbidden' })
      return
    }

    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
      sendHtml(res, ADMIN_HTML)
      return
    }

    if (req.method === 'GET' && url.pathname === '/admin/list') {
      sendHtml(res, ADMIN_LIST_HTML)
      return
    }

    if (url.pathname === '/admin/notices') {
      if (req.method === 'GET') await handleList(res)
      else if (req.method === 'POST') await handleCreate(req, res)
      else send(res, 405, { error: 'method_not_allowed' })
      return
    }

    // 수정과 삭제. 어느 쪽이든 운영자 공지가 아니면 핸들러가 404 로 떨어뜨린다.
    const id = adminNoticeId(url.pathname)
    if (id !== null) {
      if (req.method === 'PATCH') await handleUpdate(req, res, id)
      else if (req.method === 'DELETE') await handleDelete(res, id)
      else send(res, 405, { error: 'method_not_allowed' })
      return
    }

    send(res, 404, { error: 'not_found' })
    return
  }

  if (req.method !== 'GET') {
    send(res, 405, { error: 'method_not_allowed' })
    return
  }

  // 살아 있는지 묻는 자리. nginx 와 도커가 본다.
  if (url.pathname === '/healthz') {
    send(res, 200, { ok: true })
    return
  }

  if (url.pathname === '/v1/notices') {
    const raw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    // NaN 도 여기서 걸린다. 이상한 값이면 기본값으로 간다.
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), MAX_LIMIT) : DEFAULT_LIMIT
    send(res, 200, await listNotices(limit, url.searchParams.get('cursor'), parseKinds(url)))
    return
  }

  /**
   * 썬데이 메이플 기록. **넥슨이 안 들고 있는 것을 우리가 든다.**
   *
   * 썬데이는 일요일 하루만 `notice-event` 목록에 뜨고, 지나면 상세도 400 이라 지난 회차를
   * 받아 올 길이 없다. 폴러가 그날 잡아 둔 것이 유일한 사본이고 이 경로가 그것을 돌려준다.
   *
   * **목록인데 `blocks` 를 싣는다.** 다른 목록은 안 싣지만(업데이트 한 건이 57KB다) 썬데이
   * 본문은 이미지 한두 장이라 가볍고, 빼면 기록이 제목만 남아 볼 것이 없어진다.
   */
  if (url.pathname === '/v1/sunday-maple') {
    const raw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), MAX_LIMIT) : DEFAULT_LIMIT
    send(res, 200, { items: sundayRecordsFrom(await listEventRows()).slice(0, limit) })
    return
  }

  /**
   * 넥슨이 지금 스케줄러 기록을 결산 중인가. 판정은 `settlement.ts` 의 밤 고리가 들고 있다.
   *
   * **`startedAt` 이 계약의 핵심이다.** 앱이 안내 줄을 닫을 때 이 값을 기억하고, 다음에 받은
   * 값이 같으면 안 세운다. 다음 날 밤이면 값이 달라 다시 선다.
   *
   * 캐시를 안 건다. 판정이 1분마다 갈리는데 60초 캐시를 두면 앱이 최대 2분 낡은 값을 본다.
   */
  if (url.pathname === '/v1/settlement') {
    sendFresh(res, 200, settlement())
    return
  }

  const detail = /^\/v1\/notices\/(.+)$/.exec(url.pathname)
  if (detail?.[1] !== undefined) {
    const notice = await getNotice(decodeURIComponent(detail[1]))
    if (notice === null) {
      send(res, 404, { error: 'not_found' })
      return
    }
    send(res, 200, notice)
    return
  }

  send(res, 404, { error: 'not_found' })
}

/**
 * @param settlement 결산 판정을 꺼내는 함수. 밤 고리가 소유하고 이 서버는 읽기만 한다.
 *   안 주면 늘 «결산 아님» 이다(`NEXON_KEY` 없이 뜬 서버).
 */
export function createApi(settlement: () => Settlement = () => NOT_SETTLING) {
  return createServer((req, res) => {
    route(req, res, settlement).catch((error: unknown) => {
      // 실패 사유를 밖으로 안 흘린다. 안에서만 남긴다.
      console.error('[api]', error)
      if (!res.headersSent) send(res, 500, { error: 'internal' })
    })
  })
}
