/**
 * 가격 줄의 경계 검사. 기간 글자는 KST `YYYY-MM-DD` 또는 `YYYY-MM-DDTHH:mm` 이다.
 *
 * 가격의 경계는 그 보스의 기간 경계에 서야 한다. 주간은 리셋일 목요일, 월간은 1일이다. 앱이 처치 기간의
 * 첫날로 줄을 고르므로 경계가 어긋나면 어느 줄도 안 걸리거나 둘이 걸린다.
 */

export const PERIOD_TEXT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

export type BossCycle = 'weekly' | 'event_weekly' | 'monthly'

/** 글자 모양이 맞고 실제 있는 날짜인가. */
export function isPeriodText(value: string): boolean {
  if (!PERIOD_TEXT.test(value)) return false
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10)
}

/** 주간 · 시즌 보스는 목요일, 월간은 1일. */
export function isPeriodBoundary(value: string, cycle: BossCycle): boolean {
  if (!isPeriodText(value)) return false
  const date = value.slice(0, 10)
  if (cycle === 'monthly') return date.endsWith('-01')
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 4
}
