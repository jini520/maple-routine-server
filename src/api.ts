/**
 * 조회 API 둘. 계약은 앱 저장소의 결정 문서가 소유한다.
 *
 * ```
 * GET /v1/notices?limit=20&cursor=…  → { items, nextCursor }
 * GET /v1/notices/{id}               → Notice
 * ```
 *
 * **인증이 없다.** 공개 정보라서다. 대신 누구나 부를 수 있으므로 `limit` 에 상한을 두고,
 * 그 밖의 속도 제한은 앞단 nginx 가 건다.
 *
 * 프레임워크를 안 쓴다. 경로가 둘뿐이고, 이 저장소는 public 이며 집 기계에서 도는 서버라
 * 의존성 하나가 곧 감사해야 할 표면이다.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { getNotice, listNotices } from './db.ts'

/** 한 번에 주는 상한. 넘겨 부르면 이 값으로 깎는다. */
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

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

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')

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
    send(res, 200, await listNotices(limit, url.searchParams.get('cursor')))
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

export function createApi() {
  return createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      // 실패 사유를 밖으로 안 흘린다. 안에서만 남긴다.
      console.error('[api]', error)
      if (!res.headersSent) send(res, 500, { error: 'internal' })
    })
  })
}
