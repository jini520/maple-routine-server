import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'

import {
  type NexonNoticeItem,
  type NexonNoticeKind,
  NexonOpenApiClient,
} from '../../clients/nexon-open-api.client'
import type { Env } from '../../config/env.schema'
import { PushService } from '../push/push.service'
import { parseContents } from './contents'
import type { NoticeKind } from './notice.types'
import { type NewNotice, NoticesRepository } from './notices.repository'
import { isSundayMaple } from './sunday'

/** 올라온 지 이보다 오래된 글은 저장만 한다. 씨 뿌리기가 중간에 죽거나 서버가 하루 죽었다 살아날 때 밀린 알림이 터지는 것을 막는다. */
export const STALE_MS = 6 * 60 * 60 * 1000

const INTERVAL_NAME = 'notice-poll'
const NEXON_KINDS: readonly NexonNoticeKind[] = ['game', 'update', 'event', 'cashshop']

export interface TickSummary {
  stored: number
  notified: number
  scheduled: number
}

/** 이벤트는 썬데이만 알린다. 목록에는 다 보이고 알림만 갈린다. */
export function shouldNotify(kind: NoticeKind, title: string): boolean {
  return kind !== 'event' || isSundayMaple(title)
}

/**
 * 1분마다 넥슨 공지 넷을 받아 새 글을 저장하고 알리고, 예약 시각이 지난 운영자 공지를 쏜다.
 *
 * 알림 실패는 그 회차에서 끝난다. sent_at 이 비어 있다고 다시 쏘지 않는다. 재시도를 두면 서버가
 * 오래 죽었다 살아날 때 밀린 알림이 한꺼번에 나간다.
 */
@Injectable()
export class NoticePoller implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NoticePoller.name)
  private readonly intervalMs: number
  private running = false
  /** 스펙이 바꿔 끼우는 시계. */
  clock: () => Date = () => new Date()

  constructor(
    private readonly nexon: NexonOpenApiClient,
    private readonly repo: NoticesRepository,
    private readonly push: PushService,
    config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {
    this.intervalMs = config.get('POLL_INTERVAL_MS', { infer: true })
  }

  onApplicationBootstrap(): void {
    if (!this.nexon.enabled) {
      this.logger.warn('NEXON_KEY 가 없어 넥슨 공지를 안 받는다. 예약 발송만 돈다')
    }
    const timer = setInterval(() => void this.tick(), this.intervalMs)
    this.scheduler.addInterval(INTERVAL_NAME, timer)
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) {
      this.scheduler.deleteInterval(INTERVAL_NAME)
    }
  }

  /** 한 회차. 앞 회차가 아직 돌고 있으면 null 을 내고 건너뛴다. */
  async tick(): Promise<TickSummary | null> {
    if (this.running) return null
    this.running = true
    try {
      const summary: TickSummary = { stored: 0, notified: 0, scheduled: 0 }
      if (this.nexon.enabled) {
        for (const kind of NEXON_KINDS) {
          try {
            await this.collect(kind, summary)
          } catch (error) {
            this.logger.warn(`${kind} 목록을 못 받았다: ${String(error)}`)
          }
        }
      }
      await this.sendScheduled(summary)
      if (summary.stored > 0 || summary.notified > 0 || summary.scheduled > 0) {
        this.logger.log(
          `공지 폴링: 저장 ${summary.stored} · 알림 ${summary.notified} · 예약 발송 ${summary.scheduled}`,
        )
      }
      return summary
    } finally {
      this.running = false
    }
  }

  private async collect(kind: NexonNoticeKind, summary: TickSummary): Promise<void> {
    const items = await this.nexon.noticeList(kind)
    const keys = items.map((item) => keyOf(kind, item))
    const known = await this.repo.knownKeys(keys)
    const fresh = items.filter((_, i) => !known.has(keys[i]))
    if (fresh.length === 0) return

    // 표가 빈 분류의 첫 회차는 저장만 한다. 안 그러면 첫 배포가 알림 수십 개를 쏜다.
    const seeding = !(await this.repo.hasAny(kind))
    const now = this.clock()
    for (const item of fresh) {
      const row = await this.rowOf(kind, item)
      const { id } = await this.repo.insert(row)
      summary.stored += 1

      const stale = now.getTime() - row.publishedAt.getTime() > STALE_MS
      if (seeding || stale || !shouldNotify(kind, item.title)) continue
      try {
        await this.push.sendNotice({
          noticeKey: row.noticeKey,
          kind,
          title: row.title,
          body: null,
          publishedAt: row.publishedAt,
          link: row.link ?? null,
          pushTitle: null,
          pushBody: null,
        })
        await this.repo.markSent(id, now)
        summary.notified += 1
      } catch (error) {
        this.logger.warn(`알림을 못 보냈다 ${row.noticeKey}: ${String(error)}`)
      }
    }
  }

  /** 썬데이 메이플만 상세를 받아 blocks 와 기간을 둔다. 나머지는 목록 값만이다. */
  private async rowOf(kind: NexonNoticeKind, item: NexonNoticeItem): Promise<NewNotice> {
    const base: NewNotice = {
      noticeKey: keyOf(kind, item),
      kind,
      title: item.title,
      link: item.url,
      sourceId: item.noticeId,
      publishedAt: new Date(item.date),
      blocks: null,
    }
    if (kind !== 'event' || !isSundayMaple(item.title)) return base
    const detail = await this.nexon.noticeDetail(kind, item.noticeId)
    return {
      ...base,
      blocks: parseContents(detail.contents),
      startsAt: dateOrNull(detail.eventStart),
      endsAt: dateOrNull(detail.eventEnd),
    }
  }

  private async sendScheduled(summary: TickSummary): Promise<void> {
    const now = this.clock()
    for (const row of await this.repo.dueScheduled(now)) {
      try {
        await this.push.sendNotice(row)
        await this.repo.markSent(row.id, now)
        summary.scheduled += 1
      } catch (error) {
        this.logger.warn(`예약 공지를 못 보냈다 ${row.noticeKey}: ${String(error)}`)
      }
    }
  }
}

/** 열쇠는 `{분류}-{넥슨 notice_id}` 다. 번호 체계가 분류마다 달라 번호 하나로는 못 가린다. */
function keyOf(kind: NexonNoticeKind, item: NexonNoticeItem): string {
  return `${kind}-${item.noticeId}`
}

function dateOrNull(value: string | null): Date | null {
  if (value === null) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
