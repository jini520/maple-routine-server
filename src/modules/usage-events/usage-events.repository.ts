import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gte, lt, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { usageEvents } from '../../database/schema'
import type { IdentitySource } from '../identity/identity.guard'

/** 묶음이 함께 싣는 값. */
export interface UsageBatch {
  userId: string
  identifiedBy: IdentitySource
  platform: 'ios' | 'android'
  appVersion: string
}

export interface UsageEventInput {
  type: 'visit' | 'screen' | 'action'
  name: string
  durationMs: number | null
  at: Date
}

/** 대시보드 기간. since 부터 until 앞까지. */
export interface UsageRange {
  since: Date
  until: Date
}

/** 사용자 화면의 플랫폼 고르개. 없으면 둘 다다. */
export interface UsageFilter {
  platform?: 'ios' | 'android'
}

export interface UsageDayCounts {
  /** 한국 시각 YYYY-MM-DD */
  day: string
  visitors: number
  visits: number
  views: number
}

export interface UsagePart {
  name: string
  value: number
}

export interface UsageScreen {
  name: string
  visitors: number
  views: number
  medianMs: number | null
}

/** UTC 로 자르면 한국 시각 오전 9시 전의 사건이 전날로 간다. */
const kstDay = sql<string>`to_char(${usageEvents.occurredAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`

@Injectable()
export class UsageEventsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 사건을 줄마다 적는다. 기기 시각이 받은 시각보다 미래면 받은 시각으로 자른다. */
  async insert(batch: UsageBatch, events: readonly UsageEventInput[]): Promise<void> {
    if (events.length === 0) return
    const now = new Date()
    await this.db.insert(usageEvents).values(
      events.map((event) => ({
        ...batch,
        type: event.type,
        name: event.name,
        durationMs: event.durationMs,
        occurredAt: event.at > now ? now : event.at,
        receivedAt: now,
      })),
    )
  }

  /** 기준 시각보다 앞선 줄을 지우고 지운 수를 돌려준다. */
  async deleteBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(usageEvents)
      .where(lt(usageEvents.occurredAt, cutoff))
      .returning({ id: usageEvents.id })
    return deleted.length
  }

  /** 날마다 방문자 · 방문 · 화면 조회. 사건이 없는 날은 빠진다. 오래된 날부터. */
  dailyCounts(range: UsageRange, filter: UsageFilter = {}): Promise<UsageDayCounts[]> {
    return this.db
      .select({
        day: kstDay,
        visitors: sql<number>`count(distinct ${usageEvents.userId})::int`,
        visits: sql<number>`(count(*) filter (where ${usageEvents.type} = 'visit'))::int`,
        views: sql<number>`(count(*) filter (where ${usageEvents.type} = 'screen'))::int`,
      })
      .from(usageEvents)
      .where(this.within(range, filter))
      .groupBy(kstDay)
      .orderBy(sql`1`)
  }

  /** 날마다 동작 이름별 횟수. 이름은 거르지 않는다. 앱이 동작을 더하면 그대로 줄이 생긴다. */
  dailyActions(range: UsageRange): Promise<{ day: string; name: string; count: number }[]> {
    return this.db
      .select({ day: kstDay, name: usageEvents.name, count: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(this.within(range, {}), eq(usageEvents.type, 'action')))
      .groupBy(kstDay, usageEvents.name)
      .orderBy(sql`1`, usageEvents.name)
  }

  /** 기간 안의 서로 다른 사람. 날마다의 방문자를 더하면 여러 날 온 사람이 여럿으로 잡힌다. */
  async visitorCount(range: UsageRange, filter: UsageFilter = {}): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(distinct ${usageEvents.userId})::int` })
      .from(usageEvents)
      .where(this.within(range, filter))
    return row?.n ?? 0
  }

  /**
   * 기간 방문자를 플랫폼 · 신원 · 앱 버전으로 나눈다. 한 사람은 기간 안의 마지막 사건 하나로만 센다.
   * 둘 다 쓴 사람을 양쪽에 세면 나눈 합이 방문자보다 커진다.
   */
  async composition(
    range: UsageRange,
    filter: UsageFilter = {},
  ): Promise<{ platform: UsagePart[]; identity: UsagePart[]; version: UsagePart[] }> {
    const platform = filter.platform ? sql`and platform = ${filter.platform}` : sql``
    const result = await this.db.execute<{ dim: string; name: string; value: number }>(sql`
      with last as (
        select distinct on (user_id) platform::text as platform, identified_by::text as identity, app_version
          from ${usageEvents}
         where user_id is not null and occurred_at >= ${range.since} and occurred_at < ${range.until} ${platform}
         order by user_id, occurred_at desc
      )
      select 'platform' as dim, platform as name, count(*)::int as value from last group by platform
      union all
      select 'identity', identity, count(*)::int from last group by identity
      union all
      select 'version', app_version, count(*)::int from last group by app_version
      order by 1, 3 desc, 2`)
    const pick = (dim: string): UsagePart[] =>
      result.rows.filter((r) => r.dim === dim).map((r) => ({ name: r.name, value: r.value }))
    return { platform: pick('platform'), identity: pick('identity'), version: pick('version') }
  }

  /** 방문을 시작한 한국 시각의 요일(월요일 0)과 시마다 방문 수. */
  visitHours(
    range: UsageRange,
    filter: UsageFilter = {},
  ): Promise<{ weekday: number; hour: number; visits: number }[]> {
    const local = sql`(${usageEvents.occurredAt} at time zone 'Asia/Seoul')`
    const weekday = sql<number>`(extract(isodow from ${local})::int - 1)`
    const hour = sql<number>`extract(hour from ${local})::int`
    return this.db
      .select({ weekday, hour, visits: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(this.within(range, filter), eq(usageEvents.type, 'visit')))
      .groupBy(weekday, hour)
      .orderBy(sql`1`, sql`2`)
  }

  /** 화면마다 방문자 · 본 횟수 · 체류 중앙값. 방문자가 많은 화면부터. */
  screenStats(range: UsageRange): Promise<UsageScreen[]> {
    return this.db
      .select({
        name: usageEvents.name,
        visitors: sql<number>`count(distinct ${usageEvents.userId})::int`,
        views: sql<number>`count(*)::int`,
        medianMs: sql<
          number | null
        >`percentile_cont(0.5) within group (order by ${usageEvents.durationMs})::float8`,
      })
      .from(usageEvents)
      .where(and(this.within(range, {}), eq(usageEvents.type, 'screen')))
      .groupBy(usageEvents.name)
      .orderBy(sql`2 desc`, sql`3 desc`, usageEvents.name)
  }

  /** 화면 하나의 날마다 방문자. 오래된 날부터. */
  screenDaily(name: string, range: UsageRange): Promise<{ day: string; visitors: number }[]> {
    return this.db
      .select({ day: kstDay, visitors: sql<number>`count(distinct ${usageEvents.userId})::int` })
      .from(usageEvents)
      .where(
        and(this.within(range, {}), eq(usageEvents.type, 'screen'), eq(usageEvents.name, name)),
      )
      .groupBy(kstDay)
      .orderBy(sql`1`)
  }

  private within(range: UsageRange, filter: UsageFilter) {
    return and(
      gte(usageEvents.occurredAt, range.since),
      lt(usageEvents.occurredAt, range.until),
      filter.platform ? eq(usageEvents.platform, filter.platform) : undefined,
    )
  }
}
