/** 대시보드 기간. since 부터 until 앞까지이고 둘 다 한국 시각 자정이다. */
export interface KstRange {
  since: Date
  until: Date
}

/** KST 는 서머타임이 없어 +9 시간이 곧 KST 다. */
const KST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000

/** 오늘(한국 시각)까지 days 일. 오늘도 다른 날과 똑같이 세므로 오늘 값은 새로고침할 때마다 늘어난다. */
export function periodEndingToday(days: number, now: Date): KstRange {
  const todayStart = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS
  const until = todayStart + DAY_MS
  return { since: new Date(until - days * DAY_MS), until: new Date(until) }
}

/** 바로 앞의 같은 길이 기간. */
export function previousOf(range: KstRange): KstRange {
  const length = range.until.getTime() - range.since.getTime()
  return { since: new Date(range.since.getTime() - length), until: range.since }
}

/** 기간 안의 한국 시각 날짜. 사건이 없는 날도 빠지지 않게 질의 결과를 이 목록에 맞춘다. */
export function kstDays(range: KstRange): string[] {
  const out: string[] = []
  for (let t = range.since.getTime(); t < range.until.getTime(); t += DAY_MS) {
    out.push(new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10))
  }
  return out
}

/** 월요일이 0, 일요일이 6. Postgres 의 isodow 에서 1 을 뺀 값과 같다. */
export function kstWeekday(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** 앞 기간에 사건이 하나도 없으면 맞댈 것이 없어 비운다. 사건은 2026-11-04 부터 쌓였다. */
export function delta(current: number, previous: number, hasPrevious: boolean): number | null {
  return hasPrevious ? current - previous : null
}

export interface WeekdayStat {
  weekday: number
  avg: number | null
  min: number | null
  max: number | null
}

/** 요일마다 하루 값의 평균 · 가장 적은 날 · 가장 많은 날. 기간에 그 요일이 없으면 비운다. */
export function weekdayStats(days: readonly { day: string; value: number }[]): WeekdayStat[] {
  const byWeekday: number[][] = Array.from({ length: 7 }, () => [])
  for (const { day, value } of days) byWeekday[kstWeekday(day)].push(value)
  return byWeekday.map((values, weekday) =>
    values.length === 0
      ? { weekday, avg: null, min: null, max: null }
      : {
          weekday,
          avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
          min: Math.min(...values),
          max: Math.max(...values),
        },
  )
}

/**
 * 요일 × 시마다 방문 수를 그 요일이 기간에 든 날 수로 나눈 값. 소수 첫째 자리까지.
 *
 * 기간이 7의 배수가 아니면 요일마다 든 날 수가 달라서, 합계를 그대로 두면 많이 든 요일이 부풀어 보인다.
 */
export function hourGrid(
  rows: readonly { weekday: number; hour: number; visits: number }[],
  days: readonly string[],
): number[][] {
  const counts = Array.from({ length: 7 }, () => 0)
  for (const day of days) counts[kstWeekday(day)] += 1
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const { weekday, hour, visits } of rows) {
    if (counts[weekday] > 0) grid[weekday][hour] = Math.round((visits / counts[weekday]) * 10) / 10
  }
  return grid
}
