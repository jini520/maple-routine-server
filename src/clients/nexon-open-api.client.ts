import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.schema'
import { errorNameOf } from './nexon-error'

/** 넥슨이 주는 공지 분류 넷. app 은 여기 없다. */
export type NexonNoticeKind = 'game' | 'update' | 'event' | 'cashshop'

/** 목록 항목. date 는 `2026-09-09T16:24+09:00` 꼴 원문 그대로다. */
export interface NexonNoticeItem {
  noticeId: number
  title: string
  url: string
  date: string
}

/** 상세. 기간은 이벤트에만 있고 나머지는 null 이다. */
export interface NexonNoticeDetail {
  title: string
  url: string
  contents: string
  date: string
  eventStart: string | null
  eventEnd: string | null
}

export class NexonOpenApiError extends Error {
  /** 본문의 error.name. 결산 중(OPENAPI00009)을 여기서 가른다. */
  readonly errorName: string | null

  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`넥슨 Open API 가 ${status} 를 냈다: ${body}`)
    this.errorName = errorNameOf(body)
  }
}

const BASE_URL = 'https://open.api.nexon.com'
const TIMEOUT_MS = 10_000

/** 분류마다 경로와 응답 배열의 키가 다르다. 상세는 같은 경로 뒤에 /detail 이다. */
const NOTICE_PATH: Record<NexonNoticeKind, { path: string; key: string }> = {
  game: { path: '/maplestory/v1/notice', key: 'notice' },
  update: { path: '/maplestory/v1/notice-update', key: 'update_notice' },
  event: { path: '/maplestory/v1/notice-event', key: 'event_notice' },
  cashshop: { path: '/maplestory/v1/notice-cashshop', key: 'cashshop_notice' },
}

/** 개발자 API 키로 부르는 넥슨 Open API. 공지 목록·상세와 결산 판정이 쓴다. */
@Injectable()
export class NexonOpenApiClient {
  private readonly key: string | undefined

  constructor(config: ConfigService<Env, true>) {
    this.key = config.get('NEXON_KEY', { infer: true })
  }

  get enabled(): boolean {
    return this.key !== undefined
  }

  async noticeList(kind: NexonNoticeKind): Promise<NexonNoticeItem[]> {
    const { path, key } = NOTICE_PATH[kind]
    const body = (await this.getJson(path)) as Record<string, unknown>
    const raw = body[key]
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item) => {
      const parsed = toItem(item)
      return parsed === null ? [] : [parsed]
    })
  }

  async noticeDetail(kind: NexonNoticeKind, noticeId: number): Promise<NexonNoticeDetail> {
    const { path } = NOTICE_PATH[kind]
    const body = (await this.getJson(`${path}/detail?notice_id=${noticeId}`)) as Record<
      string,
      unknown
    >
    return {
      title: str(body.title),
      url: str(body.url),
      contents: str(body.contents),
      date: str(body.date),
      eventStart: strOrNull(body.date_event_start),
      eventEnd: strOrNull(body.date_event_end),
    }
  }

  /** 스케줄러 캐릭터 상태. 결산 중이면 넥슨이 400 OPENAPI00009 로 거절하고 그것이 신호다. 본문은 안 쓴다. */
  async characterState(ocid: string, date: string): Promise<void> {
    await this.getJson(
      `/maplestory/v1/scheduler/character-state?ocid=${encodeURIComponent(ocid)}&date=${date}`,
    )
  }

  private async getJson(path: string): Promise<unknown> {
    if (this.key === undefined) throw new Error('NEXON_KEY 가 없어 넥슨을 부를 수 없다')
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'x-nxopen-api-key': this.key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new NexonOpenApiError(res.status, await res.text())
    return res.json()
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** 목록 항목 하나. notice_id 가 숫자가 아니면 버린다. 열쇠를 못 만드는 줄이다. */
function toItem(value: unknown): NexonNoticeItem | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const noticeId = typeof raw.notice_id === 'number' ? raw.notice_id : Number(raw.notice_id)
  if (!Number.isInteger(noticeId)) return null
  return { noticeId, title: str(raw.title), url: str(raw.url), date: str(raw.date) }
}
