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

export interface UsageDay {
  /** 한국 시각 YYYY-MM-DD */
  day: string
  visitors: number
  visits: number
  ios: number
  android: number
  /** 동작 이름마다 횟수 */
  actions: Record<string, number>
}

export interface UsageScreen {
  name: string
  visitors: number
  views: number
  medianMs: number | null
}

export interface UsageVersion {
  platform: 'ios' | 'android'
  appVersion: string
  visitors: number
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

  /** 날짜별 방문자 · 방문 횟수 · 플랫폼별 방문자 · 동작 횟수. 최근 날짜부터. */
  async daily(since: Date): Promise<UsageDay[]> {
    const [days, actions] = await Promise.all([
      this.db
        .select({
          day: kstDay,
          visitors: sql<number>`count(distinct ${usageEvents.userId})::int`,
          visits: sql<number>`(count(*) filter (where ${usageEvents.type} = 'visit'))::int`,
          ios: sql<number>`(count(distinct ${usageEvents.userId}) filter (where ${usageEvents.platform} = 'ios'))::int`,
          android: sql<number>`(count(distinct ${usageEvents.userId}) filter (where ${usageEvents.platform} = 'android'))::int`,
        })
        .from(usageEvents)
        .where(gte(usageEvents.occurredAt, since))
        .groupBy(kstDay)
        .orderBy(sql`1 desc`),
      this.db
        .select({ day: kstDay, name: usageEvents.name, count: sql<number>`count(*)::int` })
        .from(usageEvents)
        .where(and(gte(usageEvents.occurredAt, since), eq(usageEvents.type, 'action')))
        .groupBy(kstDay, usageEvents.name),
    ])
    return days.map((row) => ({
      ...row,
      actions: Object.fromEntries(
        actions
          .filter((action) => action.day === row.day)
          .map((action) => [action.name, action.count]),
      ),
    }))
  }

  /** 화면마다 방문자 · 본 횟수 · 체류 중앙값. 방문자가 많은 화면부터. */
  async screens(since: Date): Promise<UsageScreen[]> {
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
      .where(and(gte(usageEvents.occurredAt, since), eq(usageEvents.type, 'screen')))
      .groupBy(usageEvents.name)
      .orderBy(sql`2 desc`, sql`3 desc`, usageEvents.name)
  }

  /** 플랫폼 · 앱 버전마다 방문자. OTA 를 낸 뒤 옛 번들이 얼마나 남는지 본다. */
  async versions(since: Date): Promise<UsageVersion[]> {
    return this.db
      .select({
        platform: usageEvents.platform,
        appVersion: usageEvents.appVersion,
        visitors: sql<number>`count(distinct ${usageEvents.userId})::int`,
      })
      .from(usageEvents)
      .where(gte(usageEvents.occurredAt, since))
      .groupBy(usageEvents.platform, usageEvents.appVersion)
      .orderBy(sql`3 desc`, usageEvents.platform, usageEvents.appVersion)
  }
}
