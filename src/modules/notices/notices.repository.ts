import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { notices } from '../../database/schema'
import type { NoticeBlock, NoticeKind } from './notice.types'

/** 목록 · 예약 · 발송이 보는 칸. blocks 는 없다. 한 줄이 57KB 까지 가서 목록에 실으면 응답이 MB 가 된다. */
export interface NoticeRow {
  id: string
  noticeKey: string
  kind: NoticeKind
  title: string
  body: string | null
  link: string | null
  sourceId: number | null
  publishedAt: Date
  startsAt: Date | null
  endsAt: Date | null
  scheduledAt: Date | null
  sentAt: Date | null
  pushTitle: string | null
  pushBody: string | null
}

export interface NoticeDetailRow extends NoticeRow {
  blocks: NoticeBlock[] | null
}

export interface NewNotice {
  noticeKey: string
  kind: NoticeKind
  title: string
  publishedAt: Date
  body?: string | null
  link?: string | null
  sourceId?: number | null
  startsAt?: Date | null
  endsAt?: Date | null
  blocks?: NoticeBlock[] | null
  scheduledAt?: Date | null
  pushTitle?: string | null
  pushBody?: string | null
}

const ROW_COLUMNS = {
  id: notices.id,
  noticeKey: notices.noticeKey,
  kind: notices.kind,
  title: notices.title,
  body: notices.body,
  link: notices.link,
  sourceId: notices.sourceId,
  publishedAt: notices.publishedAt,
  startsAt: notices.startsAt,
  endsAt: notices.endsAt,
  scheduledAt: notices.scheduledAt,
  sentAt: notices.sentAt,
  pushTitle: notices.pushTitle,
  pushBody: notices.pushBody,
}

const DETAIL_COLUMNS = { ...ROW_COLUMNS, blocks: notices.blocks }

/** 상세의 이벤트 시작일. 없으면 올린 날짜다. 썬데이 기록의 정렬 축이다. */
const STARTS_OR_PUBLISHED = sql`coalesce(${notices.startsAt}, ${notices.publishedAt})`

@Injectable()
export class NoticesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 최근 것부터. kinds 가 null 이면 전 분류다. */
  list(kinds: readonly NoticeKind[] | null, limit: number): Promise<NoticeRow[]> {
    return this.db
      .select(ROW_COLUMNS)
      .from(notices)
      .where(kinds === null ? undefined : inArray(notices.kind, [...kinds]))
      .orderBy(desc(notices.publishedAt), desc(notices.id))
      .limit(limit)
  }

  async findByKey(noticeKey: string): Promise<NoticeDetailRow | null> {
    const [row] = await this.db
      .select(DETAIL_COLUMNS)
      .from(notices)
      .where(eq(notices.noticeKey, noticeKey))
      .limit(1)
    return row === undefined ? null : asDetail(row)
  }

  async hasAny(kind: NoticeKind): Promise<boolean> {
    const rows = await this.db
      .select({ id: notices.id })
      .from(notices)
      .where(eq(notices.kind, kind))
      .limit(1)
    return rows.length > 0
  }

  async knownKeys(keys: readonly string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set()
    const rows = await this.db
      .select({ noticeKey: notices.noticeKey })
      .from(notices)
      .where(inArray(notices.noticeKey, [...keys]))
    return new Set(rows.map((row) => row.noticeKey))
  }

  async insert(input: NewNotice): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(notices)
      .values({
        noticeKey: input.noticeKey,
        kind: input.kind,
        title: input.title,
        publishedAt: input.publishedAt,
        body: input.body ?? null,
        link: input.link ?? null,
        sourceId: input.sourceId ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        blocks: input.blocks ?? null,
        scheduledAt: input.scheduledAt ?? null,
        pushTitle: input.pushTitle ?? null,
        pushBody: input.pushBody ?? null,
      })
      .returning({ id: notices.id })
    if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
    return row
  }

  async markSent(id: string, at: Date): Promise<void> {
    await this.db.update(notices).set({ sentAt: at }).where(eq(notices.id, id))
  }

  /** 예약 시각이 지났고 아직 안 보낸 운영자 공지. 이른 예약부터. */
  dueScheduled(now: Date): Promise<NoticeRow[]> {
    return this.db
      .select(ROW_COLUMNS)
      .from(notices)
      .where(and(eq(notices.kind, 'app'), lte(notices.scheduledAt, now), isNull(notices.sentAt)))
      .orderBy(notices.scheduledAt)
  }

  /** 이벤트를 시작일 역순으로. 썬데이 판정은 부르는 쪽이 제목으로 한다. */
  async recentEvents(limit: number): Promise<NoticeDetailRow[]> {
    const rows = await this.db
      .select(DETAIL_COLUMNS)
      .from(notices)
      .where(eq(notices.kind, 'event'))
      .orderBy(desc(STARTS_OR_PUBLISHED), desc(notices.id))
      .limit(limit)
    return rows.map(asDetail)
  }
}

/** jsonb 칸은 unknown 으로 온다. 쓰는 쪽이 넣은 것이라 블록 배열로 믿는다. */
function asDetail(row: NoticeRow & { blocks: unknown }): NoticeDetailRow {
  return { ...row, blocks: Array.isArray(row.blocks) ? (row.blocks as NoticeBlock[]) : null }
}
