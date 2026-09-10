/**
 * 넥슨 Open API 의 공지 정보. **네 분류가 갈린 엔드포인트 여덟 개다.**
 *
 * 여기가 지키는 것은 바깥 형태를 하나로 접는 것이다. 목록의 배열 키가 분류마다 다르고
 * (`notice` · `update_notice` · `event_notice` · `cashshop_notice`), 이벤트와 캐시샵만 기간
 * 필드를 더 든다. 그 차이를 폴러가 알 필요가 없다.
 *
 * ⚠️ **상세는 목록에 지금 떠 있는 것만 답한다**(실측 2026-09-10). 목록 밖 `notice_id` 는 전부
 * 400 `OPENAPI00004` 다. 나중에 받아 오는 길이 없어서, 새 항목을 본 그 회차에서 상세까지
 * 받아야 한다.
 *
 * ⚠️ **상세 응답에 `notice_id` 가 없다.** 요청에 쓴 값을 부른 쪽이 붙인다.
 */
import type { NoticeKind } from './notice.ts'

const BASE = 'https://open.api.nexon.com'

/** 넥슨에서 오는 분류. `app` 은 우리가 쓰는 것이라 여기 없다. */
export type NexonKind = Exclude<NoticeKind, 'app'>

export const NEXON_KINDS: readonly NexonKind[] = ['game', 'update', 'event', 'cashshop']

const ENDPOINTS: Record<NexonKind, { list: string; detail: string; key: string }> = {
  game: { list: '/maplestory/v1/notice', detail: '/maplestory/v1/notice/detail', key: 'notice' },
  update: {
    list: '/maplestory/v1/notice-update',
    detail: '/maplestory/v1/notice-update/detail',
    key: 'update_notice',
  },
  event: {
    list: '/maplestory/v1/notice-event',
    detail: '/maplestory/v1/notice-event/detail',
    key: 'event_notice',
  },
  cashshop: {
    list: '/maplestory/v1/notice-cashshop',
    detail: '/maplestory/v1/notice-cashshop/detail',
    key: 'cashshop_notice',
  },
}

export interface NexonListItem {
  sourceId: number
  title: string
  url: string
  /** ISO 8601 UTC. 넥슨은 `2026-09-09T16:24+09:00` 꼴로 준다. */
  publishedAt: string
}

export interface NexonDetail extends NexonListItem {
  /** 스마트에디터 HTML. 그대로 저장하지 않는다. `html.ts` 가 블록으로 바꾼다. */
  contents: string
  /** 이벤트 시작·판매 시작. 다른 분류에는 없고, 캐시샵 상시 판매도 `null` 이다. */
  startsAt: string | null
  endsAt: string | null
  /** 캐시샵 상시 판매 여부. 넥슨이 문자열 `"true"` 로 준다. */
  ongoing: boolean | null
}

/**
 * 넥슨 날짜를 ISO UTC 로 바꾼다.
 *
 * `2026-09-09T16:24+09:00` 은 초가 없고 KST 오프셋이 붙는다. 우리 `publishedAt` 은 UTC 라
 * 그대로 두면 정렬이 다른 축으로 선다.
 */
export function toIso(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  const at = new Date(raw)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** 넥슨이 문자열로 주는 불리언. `"true"` 만 참이다. */
function toBoolean(raw: unknown): boolean | null {
  if (typeof raw !== 'string') return null
  return raw.toLowerCase() === 'true'
}

function toListItem(raw: unknown): NexonListItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const item = raw as Record<string, unknown>

  const sourceId = Number(item.notice_id)
  const publishedAt = toIso(item.date)
  // 셋 중 하나라도 없으면 저장할 수 없다. id 가 없으면 중복을 못 가리고 날짜가 없으면 정렬이
  // 안 선다. 한 건을 버리는 편이 목록 전체를 버리는 것보다 낫다.
  if (!Number.isFinite(sourceId) || typeof item.title !== 'string' || publishedAt === null) {
    return null
  }

  return {
    sourceId,
    title: item.title,
    url: typeof item.url === 'string' ? item.url : '',
    publishedAt,
  }
}

export class NexonError extends Error {
  status: number
  code: string | null

  constructor(status: number, code: string | null) {
    super(`nexon ${status} ${code ?? ''}`.trim())
    this.status = status
    this.code = code
  }
}

/** 테스트가 갈아 끼우는 자리. 기본은 전역 `fetch`. */
export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>

export class NexonClient {
  #apiKey: string
  #fetcher: Fetcher
  /** 한 요청이 이만큼 넘게 걸리면 끊는다. 폴링은 1분마다 다시 온다. */
  #timeoutMs: number

  constructor(apiKey: string, fetcher: Fetcher = fetch, timeoutMs = 10_000) {
    this.#apiKey = apiKey
    this.#fetcher = fetcher
    this.#timeoutMs = timeoutMs
  }

  private async call(path: string): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    try {
      const res = await this.#fetcher(`${BASE}${path}`, {
        headers: { 'x-nxopen-api-key': this.#apiKey },
        // @ts-expect-error 표준 fetch 는 받지만 테스트용 Fetcher 타입에는 없다.
        signal: controller.signal,
      })
      const body: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const error = (body as { error?: { name?: string } } | null)?.error
        throw new NexonError(res.status, error?.name ?? null)
      }
      return body
    } finally {
      clearTimeout(timer)
    }
  }

  /** 그 분류의 목록. 계약을 어긴 항목은 버리고 나머지를 준다. */
  async list(kind: NexonKind): Promise<NexonListItem[]> {
    const body = await this.call(ENDPOINTS[kind].list)
    const raw = (body as Record<string, unknown> | null)?.[ENDPOINTS[kind].key]
    if (!Array.isArray(raw)) return []

    const items: NexonListItem[] = []
    for (const one of raw) {
      const item = toListItem(one)
      if (item !== null) items.push(item)
    }
    return items
  }

  /**
   * 한 건의 상세. **목록에서 빠진 것은 400 이라 `null` 이 된다.**
   *
   * 그 실패는 고쳐지지 않으므로 부른 쪽이 다시 시도하면 안 된다.
   */
  async detail(kind: NexonKind, item: NexonListItem): Promise<NexonDetail | null> {
    let body: unknown
    try {
      body = await this.call(`${ENDPOINTS[kind].detail}?notice_id=${item.sourceId}`)
    } catch (error) {
      if (error instanceof NexonError && error.status === 400) return null
      throw error
    }

    const detail = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
    return {
      // 상세 응답에 notice_id 가 없다. 목록에서 가져온다.
      sourceId: item.sourceId,
      title: typeof detail.title === 'string' ? detail.title : item.title,
      url: typeof detail.url === 'string' ? detail.url : item.url,
      publishedAt: toIso(detail.date) ?? item.publishedAt,
      contents: typeof detail.contents === 'string' ? detail.contents : '',
      startsAt: toIso(detail.date_event_start ?? detail.date_sale_start),
      endsAt: toIso(detail.date_event_end ?? detail.date_sale_end),
      ongoing: toBoolean(detail.ongoing_flag),
    }
  }
}
