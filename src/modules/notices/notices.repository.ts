import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'

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
  /** 넥슨 공지를 받은 시각. 운영자 공지는 비운다. */
  fetchedAt?: Date | null
  /** 썬데이 메이플 상세를 받은 시각. */
  detailFetchedAt?: Date | null
}

/** 목록에 다시 보인 넥슨 공지의 값. 회차마다 이것으로 고친다. */
export interface ListedNotice {
  noticeKey: string
  title: string
  link: string
  publishedAt: Date
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
        fetchedAt: input.fetchedAt ?? null,
        detailFetchedAt: input.detailFetchedAt ?? null,
      })
      .returning({ id: notices.id })
    if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
    return row
  }

  /** 목록에 다시 보인 넥슨 공지를 그 값과 받은 시각으로 고친다. 알림 시각은 두어 다시 알리지 않는다. */
  async refresh(listed: readonly ListedNotice[], at: Date): Promise<void> {
    if (listed.length === 0) return
    await this.db.transaction(async (tx) => {
      for (const row of listed) {
        await tx
          .update(notices)
          .set({ title: row.title, link: row.link, publishedAt: row.publishedAt, fetchedAt: at })
          .where(and(eq(notices.noticeKey, row.noticeKey), sql`${notices.kind} <> 'app'`))
      }
    })
  }

  /** 받은 시각이 before 보다 앞선 넥슨 공지를 지우고 지운 수를 준다. 운영자 공지는 받은 시각이 없어 걸리지 않는다. */
  async purgeStale(before: Date): Promise<number> {
    const rows = await this.db
      .delete(notices)
      .where(and(sql`${notices.kind} <> 'app'`, lt(notices.fetchedAt, before)))
      .returning({ id: notices.id })
    return rows.length
  }

  /** 주어진 열쇠 가운데 상세를 받은 시각이 before 보다 앞선 것. */
  async staleDetailKeys(keys: readonly string[], before: Date): Promise<Set<string>> {
    if (keys.length === 0) return new Set()
    const rows = await this.db
      .select({ noticeKey: notices.noticeKey })
      .from(notices)
      .where(and(inArray(notices.noticeKey, [...keys]), lt(notices.detailFetchedAt, before)))
    return new Set(rows.map((row) => row.noticeKey))
  }

  /** 다시 받은 썬데이 상세로 blocks 와 기간을 고친다. */
  async updateDetail(
    noticeKey: string,
    detail: Pick<NewNotice, 'blocks' | 'startsAt' | 'endsAt'>,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(notices)
      .set({
        blocks: detail.blocks ?? null,
        startsAt: detail.startsAt ?? null,
        endsAt: detail.endsAt ?? null,
        detailFetchedAt: at,
      })
      .where(eq(notices.noticeKey, noticeKey))
  }

  async markSent(id: string, at: Date): Promise<void> {
    await this.db.update(notices).set({ sentAt: at }).where(eq(notices.id, id))
  }

  /** 날마다(한국 시각) 분류별로 알림을 보낸 공지 수. 몇 대에 닿았는지가 아니다. 토픽 발송은 배달 수를 돌려주지 않는다. */
  sentDaily(range: {
    since: Date
    until: Date
  }): Promise<{ day: string; kind: NoticeKind; count: number }[]> {
    const day = sql<string>`to_char(${notices.sentAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`
    return this.db
      .select({ day, kind: notices.kind, count: sql<number>`count(*)::int` })
      .from(notices)
      .where(and(gte(notices.sentAt, range.since), lt(notices.sentAt, range.until)))
      .groupBy(day, notices.kind)
      .orderBy(sql`1`, notices.kind)
  }

  /** 운영자 공지만 최근 것부터. 관리 화면이 읽는다. */
  listApp(limit: number): Promise<NoticeRow[]> {
    return this.db
      .select(ROW_COLUMNS)
      .from(notices)
      .where(eq(notices.kind, 'app'))
      .orderBy(desc(notices.publishedAt), desc(notices.id))
      .limit(limit)
  }

  /** 운영자 공지 하나. 넥슨 공지는 id 를 알아도 null 이다. 지우거나 고칠 수 있는 것이 운영자 공지뿐이라서다. */
  async findAppById(id: string): Promise<NoticeRow | null> {
    const [row] = await this.db.select(ROW_COLUMNS).from(notices).where(appRow(id)).limit(1)
    return row ?? null
  }

  /** 제목 · 내용 · 링크를 간다. published_at 은 목록의 정렬 축이라 안 건드린다. 알림 문구는 보냈을 때만 덮는다. */
  async updateApp(
    id: string,
    patch: {
      title: string
      body: string
      link: string | null
      pushTitle?: string | null
      pushBody?: string | null
    },
  ): Promise<boolean> {
    const rows = await this.db
      .update(notices)
      .set(patch)
      .where(appRow(id))
      .returning({ id: notices.id })
    return rows.length > 0
  }

  async deleteApp(id: string): Promise<boolean> {
    const rows = await this.db.delete(notices).where(appRow(id)).returning({ id: notices.id })
    return rows.length > 0
  }

  /** 아직 안 나간 예약을 내린다. 공지는 남는다. 이미 나갔거나 예약이 없으면 false 다. */
  async cancelSchedule(id: string): Promise<boolean> {
    const rows = await this.db
      .update(notices)
      .set({ scheduledAt: null })
      .where(and(appRow(id), isNotNull(notices.scheduledAt), isNull(notices.sentAt)))
      .returning({ id: notices.id })
    return rows.length > 0
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

/** 운영자 공지 한 줄을 고르는 조건. 넥슨 공지를 지우면 되돌릴 방법이 없어 kind 를 늘 함께 본다. */
function appRow(id: string) {
  return and(eq(notices.id, id), eq(notices.kind, 'app'))
}

/** jsonb 칸은 unknown 으로 온다. 쓰는 쪽이 넣은 것이라 블록 배열로 믿는다. */
function asDetail(row: NoticeRow & { blocks: unknown }): NoticeDetailRow {
  return { ...row, blocks: Array.isArray(row.blocks) ? (row.blocks as NoticeBlock[]) : null }
}
