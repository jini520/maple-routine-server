import { Injectable } from '@nestjs/common'

import type { NoticeKind } from '../notices/notice.types'
import { NoticesRepository } from '../notices/notices.repository'
import {
  type UsageFilter,
  type UsagePart,
  type UsageRange,
  UsageEventsRepository,
} from '../usage-events/usage-events.repository'
import { UsersRepository } from '../users/users.repository'
import {
  delta,
  hourGrid,
  kstDays,
  periodEndingToday,
  previousOf,
  type WeekdayStat,
  weekdayStats,
} from './usage-dashboard'
import { SCREEN_NAMES } from './views/screen-names'

/** 그 날 보낸 알림. 게임 알림은 넥슨 공지 넷을 합친 수이고, kinds 가 분류마다 나눈다. */
export interface DayAlerts {
  app: number
  game: number
  kinds: Partial<Record<Exclude<NoticeKind, 'app'>, number>>
}

export interface Tile {
  value: number
  delta: number | null
}

export interface DashboardRange {
  first: string
  last: string
  days: number
}

export interface UsersDashboard {
  range: DashboardRange
  tiles: {
    total: Tile & { series: number[] }
    today: Tile & { series: number[] }
    week: Tile
    period: Tile
    fresh: Tile & { series: number[] }
  }
  daily: { day: string; visitors: number; fresh: number; alerts: DayAlerts }[]
  weekday: WeekdayStat[]
  heat: number[][]
  composition: { platform: UsagePart[]; identity: UsagePart[] }
}

export interface UsageMetric {
  key: string
  label: string
  total: number
  delta: number | null
}

export interface UsageDashboard {
  range: DashboardRange
  metrics: UsageMetric[]
  daily: {
    day: string
    visits: number
    views: number
    actions: Record<string, number>
    alerts: DayAlerts
  }[]
  composition: { version: UsagePart[]; platform: UsagePart[] }
  screens: {
    name: string
    label: string | null
    visitors: number
    views: number
    medianMs: number | null
    recentChange: number | null
  }[]
}

/** 지표 칸의 작은 막대 수. */
const SPARK_DAYS = 12

/** 관리자 대시보드 두 장(사용자 · 사용 로그)의 값을 모은다. 기간은 늘 오늘까지다. */
@Injectable()
export class UsageDashboardService {
  constructor(
    private readonly usage: UsageEventsRepository,
    private readonly users: UsersRepository,
    private readonly notices: NoticesRepository,
  ) {}

  async forUsers(
    days: number,
    platform: UsageFilter['platform'],
    now = new Date(),
  ): Promise<UsersDashboard> {
    const filter: UsageFilter = platform ? { platform } : {}
    const period = periodEndingToday(days, now)
    const previous = previousOf(period)
    const week = periodEndingToday(7, now)
    const dayList = kstDays(period)
    const sparkStart = new Date(period.until.getTime() - Math.min(SPARK_DAYS, days) * 86_400_000)

    const [counts, created, alerts, hours, composition, periodVisitors, previousVisitors] =
      await Promise.all([
        this.usage.dailyCounts(period, filter),
        this.users.createdDaily(period),
        this.alertsByDay(period),
        this.usage.visitHours(period, filter),
        this.usage.composition(period, filter),
        this.usage.visitorCount(period, filter),
        this.usage.visitorCount(previous, filter),
      ])
    const [weekVisitors, weekBefore, previousCreated, total, totalBefore, totalBeforeSpark] =
      await Promise.all([
        this.usage.visitorCount(week, filter),
        this.usage.visitorCount(previousOf(week), filter),
        this.users.createdDaily(previous),
        this.users.countActive(),
        this.users.countActive(period.since),
        this.users.countActive(sparkStart),
      ])

    const hasPrevious = previousVisitors > 0
    const visitorsByDay = new Map(counts.map((c) => [c.day, c.visitors]))
    const createdByDay = new Map(created.map((c) => [c.day, c]))
    const daily = dayList.map((day) => ({
      day,
      visitors: visitorsByDay.get(day) ?? 0,
      fresh: createdByDay.get(day)?.created ?? 0,
      alerts: alerts.get(day) ?? emptyAlerts(),
    }))
    const fresh = sum(daily.map((d) => d.fresh))
    const today = daily[daily.length - 1]?.visitors ?? 0
    const dayBefore = daily[daily.length - 2]?.visitors ?? 0

    let running = totalBeforeSpark
    const totalSeries = dayList.slice(-Math.min(SPARK_DAYS, days)).map((day) => {
      running += createdByDay.get(day)?.active ?? 0
      return running
    })

    return {
      range: rangeOf(dayList),
      tiles: {
        total: { value: total, delta: delta(total, totalBefore, hasPrevious), series: totalSeries },
        today: {
          value: today,
          delta: delta(today, dayBefore, dayBefore > 0),
          series: daily.slice(-SPARK_DAYS).map((d) => d.visitors),
        },
        week: { value: weekVisitors, delta: delta(weekVisitors, weekBefore, weekBefore > 0) },
        period: {
          value: periodVisitors,
          delta: delta(periodVisitors, previousVisitors, hasPrevious),
        },
        fresh: {
          value: fresh,
          delta: delta(fresh, sum(previousCreated.map((c) => c.created)), hasPrevious),
          series: daily.slice(-SPARK_DAYS).map((d) => d.fresh),
        },
      },
      daily,
      weekday: weekdayStats(daily.map((d) => ({ day: d.day, value: d.visitors }))),
      heat: hourGrid(hours, dayList),
      composition: { platform: composition.platform, identity: composition.identity },
    }
  }

  async forUsage(days: number, now = new Date()): Promise<UsageDashboard> {
    const period = periodEndingToday(days, now)
    const previous = previousOf(period)
    const recent = periodEndingToday(7, now)
    const before = previousOf(recent)
    const dayList = kstDays(period)

    const [counts, previousCounts, actions, previousActions, alerts, composition] =
      await Promise.all([
        this.usage.dailyCounts(period),
        this.usage.dailyCounts(previous),
        this.usage.dailyActions(period),
        this.usage.dailyActions(previous),
        this.alertsByDay(period),
        this.usage.composition(period),
      ])
    const [screens, recentScreens, beforeScreens, previousVisitors] = await Promise.all([
      this.usage.screenStats(period),
      this.usage.screenStats(recent),
      this.usage.screenStats(before),
      this.usage.visitorCount(previous),
    ])

    const hasPrevious = previousVisitors > 0
    const countsByDay = new Map(counts.map((c) => [c.day, c]))
    const actionsByDay = new Map<string, Record<string, number>>()
    for (const a of actions) {
      const row = actionsByDay.get(a.day) ?? {}
      row[a.name] = a.count
      actionsByDay.set(a.day, row)
    }
    const daily = dayList.map((day) => ({
      day,
      visits: countsByDay.get(day)?.visits ?? 0,
      views: countsByDay.get(day)?.views ?? 0,
      actions: actionsByDay.get(day) ?? {},
      alerts: alerts.get(day) ?? emptyAlerts(),
    }))

    const actionTotal = (rows: readonly { name: string; count: number }[], name: string) =>
      sum(rows.filter((r) => r.name === name).map((r) => r.count))
    const actionNames = [...new Set([...actions, ...previousActions].map((a) => a.name))].sort()
    const metric = (key: string, label: string, total: number, before: number): UsageMetric => ({
      key,
      label,
      total,
      delta: delta(total, before, hasPrevious),
    })
    const metrics = [
      metric(
        'visits',
        '방문',
        sum(daily.map((d) => d.visits)),
        sum(previousCounts.map((c) => c.visits)),
      ),
      metric(
        'views',
        '화면 조회',
        sum(daily.map((d) => d.views)),
        sum(previousCounts.map((c) => c.views)),
      ),
      ...actionNames.map((name) =>
        metric(
          `action:${name}`,
          name,
          actionTotal(actions, name),
          actionTotal(previousActions, name),
        ),
      ),
    ]

    const recentByName = new Map(recentScreens.map((s) => [s.name, s.visitors]))
    const beforeByName = new Map(beforeScreens.map((s) => [s.name, s.visitors]))
    return {
      range: rangeOf(dayList),
      metrics,
      daily,
      composition: { version: composition.version, platform: composition.platform },
      screens: screens.map((s) => {
        const was = beforeByName.get(s.name) ?? 0
        const now7 = recentByName.get(s.name) ?? 0
        return {
          ...s,
          label: SCREEN_NAMES[s.name] ?? null,
          // 그 전 7일에 없던 화면은 비율을 낼 수 없다.
          recentChange: was > 0 ? Math.round((now7 / was - 1) * 100) : null,
        }
      }),
    }
  }

  /** 화면 하나의 날마다 방문자. 사건이 없는 날은 0 이다. */
  async forScreen(
    name: string,
    days: number,
    now = new Date(),
  ): Promise<{ daily: { day: string; visitors: number }[] }> {
    const period = periodEndingToday(days, now)
    const rows = await this.usage.screenDaily(name, period)
    const byDay = new Map(rows.map((r) => [r.day, r.visitors]))
    return { daily: kstDays(period).map((day) => ({ day, visitors: byDay.get(day) ?? 0 })) }
  }

  private async alertsByDay(range: UsageRange): Promise<Map<string, DayAlerts>> {
    const out = new Map<string, DayAlerts>()
    for (const row of await this.notices.sentDaily(range)) {
      const day = out.get(row.day) ?? emptyAlerts()
      if (row.kind === 'app') day.app += row.count
      else {
        day.game += row.count
        day.kinds[row.kind] = (day.kinds[row.kind] ?? 0) + row.count
      }
      out.set(row.day, day)
    }
    return out
  }
}

function emptyAlerts(): DayAlerts {
  return { app: 0, game: 0, kinds: {} }
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function rangeOf(dayList: readonly string[]): DashboardRange {
  return { first: dayList[0] ?? '', last: dayList[dayList.length - 1] ?? '', days: dayList.length }
}
